import { Router } from "express";
import { z } from "zod";
import { and, asc, eq } from "drizzle-orm";

import { requireAuth, type AuthUser } from "../middleware/auth.js";
import { db } from "../services/db.js";
import { tagRules, tags } from "../db/schema.js";
import { aggregateTags, deleteTag, matchTagRules, renameTag } from "../services/tags.js";
import { sendApiError } from "../utils/apiError.js";
import logger from "../utils/logger.js";
import { getZonesCached } from "./dashboard.js";

export const tagsRouter = Router();

tagsRouter.use(requireAuth);

const tagNameSchema = z.string().trim().min(1).max(40);

const ruleCreateSchema = z.object({
  field: z.enum(["name", "plan"]),
  op: z.enum(["endsWith", "startsWith", "contains", "equals"]),
  value: z.string().trim().min(1).max(100),
  tag: tagNameSchema,
  enabled: z.boolean().optional(),
});

const ruleUpdateSchema = ruleCreateSchema.partial();

function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  return issue ? `${issue.path.join(".") || "body"}: ${issue.message}` : "Invalid request body";
}

// ========== Auto-tag rules (registered BEFORE /:name to avoid param capture) ==========

tagsRouter.get("/rules", async (req, res) => {
  const auth = req.auth as AuthUser;
  const rules = await db.query.tagRules.findMany({
    where: eq(tagRules.userId, auth.userId),
    orderBy: asc(tagRules.createdAt),
  });
  res.json(rules);
});

tagsRouter.post("/rules", async (req, res) => {
  const auth = req.auth as AuthUser;
  const parsed = ruleCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ detail: firstIssue(parsed.error) });
  }
  const [rule] = await db
    .insert(tagRules)
    .values({ userId: auth.userId, ...parsed.data })
    .returning();
  res.status(201).json(rule);
});

tagsRouter.post("/rules/:id/preview", async (req, res) => {
  const auth = req.auth as AuthUser;
  const accountId = req.query.accountId as string | undefined;
  const label = req.query.label as string | undefined;

  const rule = await db.query.tagRules.findFirst({
    where: and(eq(tagRules.id, req.params.id), eq(tagRules.userId, auth.userId)),
  });
  if (!rule) {
    return res.status(404).json({ detail: "Tag rule not found" });
  }

  try {
    const zones = await getZonesCached(auth.userId, accountId, label);
    // Preview ignores the enabled flag so disabled rules can be evaluated too
    const matched = zones.filter(
      (zone) => matchTagRules([{ ...rule, enabled: true }], zone).length > 0,
    );
    res.json({
      matchedCount: matched.length,
      sample: matched.slice(0, 10).map((zone) => zone.name),
    });
  } catch (error) {
    sendApiError(res, error, {
      status: 502,
      code: "TAG_RULE_PREVIEW_FAILED",
      detail: "Failed to preview tag rule",
    });
  }
});

tagsRouter.put("/rules/:id", async (req, res) => {
  const auth = req.auth as AuthUser;
  const parsed = ruleUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ detail: firstIssue(parsed.error) });
  }
  const existing = await db.query.tagRules.findFirst({
    where: and(eq(tagRules.id, req.params.id), eq(tagRules.userId, auth.userId)),
  });
  if (!existing) {
    return res.status(404).json({ detail: "Tag rule not found" });
  }
  const [rule] = await db.update(tagRules).set(parsed.data).where(eq(tagRules.id, existing.id)).returning();
  res.json(rule);
});

tagsRouter.delete("/rules/:id", async (req, res) => {
  const auth = req.auth as AuthUser;
  const existing = await db.query.tagRules.findFirst({
    where: and(eq(tagRules.id, req.params.id), eq(tagRules.userId, auth.userId)),
  });
  if (!existing) {
    return res.status(404).json({ detail: "Tag rule not found" });
  }
  await db.delete(tagRules).where(eq(tagRules.id, existing.id));
  res.json({ deleted: true });
});

// ========== Tags ==========

// Aggregate tags across the account's domains, merged with Tag metadata
tagsRouter.get("/", async (req, res) => {
  const auth = req.auth as AuthUser;
  const accountId = req.query.accountId as string | undefined;
  const aggregated = await aggregateTags(auth.userId, accountId);
  res.json(aggregated);
});

// Create tag metadata (membership is managed via PUT /domains/:zoneId/tags)
tagsRouter.post("/", async (req, res) => {
  const auth = req.auth as AuthUser;
  const bodySchema = z.object({
    name: tagNameSchema,
    description: z.string().max(200).nullish(),
    templateId: z.string().max(100).nullish(),
  });
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ detail: firstIssue(parsed.error) });
  }
  try {
    const [tag] = await db
      .insert(tags)
      .values({
        userId: auth.userId,
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        templateId: parsed.data.templateId ?? null,
      })
      .returning();
    res.status(201).json(tag);
  } catch (error: any) {
    // Postgres unique_violation
    if (error?.code === "23505" || error?.cause?.code === "23505") {
      return res.status(409).json({ detail: `Tag "${parsed.data.name}" already exists` });
    }
    throw error;
  }
});

// Rename (across all domains) and/or update metadata
tagsRouter.put("/:name", async (req, res) => {
  const auth = req.auth as AuthUser;
  const name = req.params.name;
  const accountId = req.query.accountId as string | undefined;
  const bodySchema = z.object({
    newName: tagNameSchema.optional(),
    description: z.string().max(200).nullish(),
    templateId: z.string().max(100).nullish(),
  });
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ detail: firstIssue(parsed.error) });
  }
  const body = parsed.data;

  const finalName = body.newName && body.newName !== name ? body.newName : name;
  let affectedDomains = 0;
  if (finalName !== name) {
    affectedDomains = await renameTag(auth.userId, accountId, name, finalName);
  }

  if (body.description !== undefined || body.templateId !== undefined) {
    await db
      .insert(tags)
      .values({
        userId: auth.userId,
        name: finalName,
        description: body.description ?? null,
        templateId: body.templateId ?? null,
      })
      .onConflictDoUpdate({
        target: [tags.userId, tags.name],
        set: {
          ...(body.description !== undefined ? { description: body.description } : {}),
          ...(body.templateId !== undefined ? { templateId: body.templateId } : {}),
        },
      });
  }

  logger.info("Tag updated", { userId: auth.userId, from: name, to: finalName, affectedDomains });
  res.json({ name: finalName, affectedDomains });
});

// Remove the tag from every domain + delete metadata
tagsRouter.delete("/:name", async (req, res) => {
  const auth = req.auth as AuthUser;
  const accountId = req.query.accountId as string | undefined;
  const affectedDomains = await deleteTag(auth.userId, accountId, req.params.name);
  logger.info("Tag deleted", { userId: auth.userId, name: req.params.name, affectedDomains });
  res.json({ name: req.params.name, affectedDomains });
});
