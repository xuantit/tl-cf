import { randomBytes } from "crypto";

import { Router } from "express";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";

import { requireAuth, type AuthUser } from "../middleware/auth.js";
import { db } from "../services/db.js";
import { inviteCodes } from "../db/schema.js";
import logger from "../utils/logger.js";

export const invitesRouter = Router();

invitesRouter.use(requireAuth);

// Toàn bộ router chỉ dành cho admin
invitesRouter.use((req, res, next) => {
  const auth = req.auth as AuthUser;
  if (auth.role !== "admin") {
    return res.status(403).json({ detail: "Admin role required" });
  }
  return next();
});

function generateCode(): string {
  // 10 ký tự dễ đọc, bỏ các ký tự dễ nhầm (0/O, 1/I/L)
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(10);
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return `CF-${out.slice(0, 5)}-${out.slice(5)}`;
}

// GET /api/invites — danh sách invite codes
invitesRouter.get("/", async (_req, res) => {
  const invites = await db.query.inviteCodes.findMany({ orderBy: desc(inviteCodes.createdAt) });
  res.json(
    invites.map((i) => ({
      id: i.id,
      code: i.code,
      note: i.note,
      maxUses: i.maxUses,
      usedCount: i.usedCount,
      usedBy: JSON.parse(i.usedByJson) as string[],
      expiresAt: i.expiresAt,
      createdAt: i.createdAt,
    })),
  );
});

// POST /api/invites — tạo invite code mới
invitesRouter.post("/", async (req, res) => {
  const auth = req.auth as AuthUser;
  const bodySchema = z.object({
    note: z.string().max(200).optional(),
    maxUses: z.number().int().min(1).max(1000).default(1),
    expiresAt: z.coerce.date().optional(),
  });
  const body = bodySchema.parse(req.body ?? {});

  const [invite] = await db
    .insert(inviteCodes)
    .values({
      code: generateCode(),
      note: body.note,
      maxUses: body.maxUses,
      expiresAt: body.expiresAt,
      createdBy: auth.userId,
    })
    .returning();

  logger.info("Invite code created", { inviteId: invite.id, createdBy: auth.userId });
  res.status(201).json({
    id: invite.id,
    code: invite.code,
    note: invite.note,
    maxUses: invite.maxUses,
    usedCount: invite.usedCount,
    expiresAt: invite.expiresAt,
    createdAt: invite.createdAt,
  });
});

// DELETE /api/invites/:id — thu hồi invite code
invitesRouter.delete("/:id", async (req, res) => {
  const existing = await db.query.inviteCodes.findFirst({ where: eq(inviteCodes.id, req.params.id) });
  if (!existing) return res.status(404).json({ detail: "Invite code not found" });

  await db.delete(inviteCodes).where(eq(inviteCodes.id, req.params.id));
  logger.info("Invite code deleted", { inviteId: req.params.id });
  res.json({ ok: true });
});
