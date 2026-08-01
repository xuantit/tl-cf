import { and, eq } from "drizzle-orm";

import { db } from "./db.js";
import { cloudflareAccounts, domains, tags } from "../db/schema.js";

// Tag membership lives inside Domain.settingsJson (DomainSettings.tags); the Tag
// table only stores per-user metadata (description, templateId). TagRule rows
// drive auto-tagging, applied on read (never persisted).

export interface AggregatedTag {
  name: string;
  domainCount: number;
  description?: string | null;
  templateId?: string | null;
  createdAt?: Date;
}

export interface TagRuleLike {
  field: string; // "name" | "plan"
  op: string; // "endsWith" | "startsWith" | "contains" | "equals"
  value: string;
  tag: string;
  enabled?: boolean;
}

// Domains scoped to a user (optionally one account) — join qua CloudflareAccount
function domainScopeWhere(userId: string, accountId?: string) {
  return accountId
    ? and(eq(cloudflareAccounts.userId, userId), eq(cloudflareAccounts.id, accountId))
    : eq(cloudflareAccounts.userId, userId);
}

async function findScopedDomains(
  dbOrTx: Pick<typeof db, "select">,
  userId: string,
  accountId?: string,
): Promise<{ id: string; settingsJson: string | null }[]> {
  return dbOrTx
    .select({ id: domains.id, settingsJson: domains.settingsJson })
    .from(domains)
    .innerJoin(cloudflareAccounts, eq(domains.accountId, cloudflareAccounts.id))
    .where(domainScopeWhere(userId, accountId));
}

function parseTags(settingsJson: string | null): string[] {
  if (!settingsJson) return [];
  try {
    const parsed = JSON.parse(settingsJson);
    if (parsed && Array.isArray(parsed.tags)) {
      return parsed.tags.filter((tag: unknown): tag is string => typeof tag === "string");
    }
  } catch {
    // Ignore malformed settings
  }
  return [];
}

// Apply fn to the tags array inside settingsJson. Returns the new JSON string,
// or null when nothing changed (keeps all other settings fields untouched).
function transformTags(
  settingsJson: string | null,
  fn: (tags: string[]) => string[],
): string | null {
  if (!settingsJson) return null;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(settingsJson);
  } catch {
    return null;
  }
  if (!parsed || !Array.isArray(parsed.tags)) return null;
  const current = (parsed.tags as unknown[]).filter(
    (tag): tag is string => typeof tag === "string",
  );
  const next = fn(current);
  if (next.length === current.length && next.every((tag, i) => tag === current[i])) {
    return null;
  }
  parsed.tags = next;
  return JSON.stringify(parsed);
}

export async function aggregateTags(
  userId: string,
  accountId?: string,
): Promise<AggregatedTag[]> {
  const [domainRows, metadata] = await Promise.all([
    findScopedDomains(db, userId, accountId),
    db.query.tags.findMany({ where: eq(tags.userId, userId) }),
  ]);

  const result = new Map<string, AggregatedTag>();
  for (const domain of domainRows) {
    for (const name of parseTags(domain.settingsJson)) {
      const entry = result.get(name);
      if (entry) entry.domainCount += 1;
      else result.set(name, { name, domainCount: 1 });
    }
  }
  for (const meta of metadata) {
    const entry = result.get(meta.name);
    if (entry) {
      entry.description = meta.description;
      entry.templateId = meta.templateId;
      entry.createdAt = meta.createdAt;
    } else {
      result.set(meta.name, {
        name: meta.name,
        domainCount: 0,
        description: meta.description,
        templateId: meta.templateId,
        createdAt: meta.createdAt,
      });
    }
  }
  return [...result.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// Rename `from` → `to` across every domain of the scope + Tag metadata row.
// Returns the number of domains whose settings changed.
export async function renameTag(
  userId: string,
  accountId: string | undefined,
  from: string,
  to: string,
): Promise<number> {
  return db.transaction(async (tx) => {
    const domainRows = await findScopedDomains(tx, userId, accountId);
    let affected = 0;
    for (const domain of domainRows) {
      const updated = transformTags(domain.settingsJson, (tagList) =>
        tagList.includes(from) ? [...new Set(tagList.map((tag) => (tag === from ? to : tag)))] : tagList,
      );
      if (updated !== null) {
        await tx.update(domains).set({ settingsJson: updated }).where(eq(domains.id, domain.id));
        affected += 1;
      }
    }

    // Move metadata: if a row for `to` already exists, merge (drop the old row)
    const fromMeta = await tx.query.tags.findFirst({
      where: and(eq(tags.userId, userId), eq(tags.name, from)),
    });
    if (fromMeta) {
      const toMeta = await tx.query.tags.findFirst({
        where: and(eq(tags.userId, userId), eq(tags.name, to)),
      });
      if (toMeta) {
        await tx.delete(tags).where(eq(tags.id, fromMeta.id));
      } else {
        await tx.update(tags).set({ name: to }).where(eq(tags.id, fromMeta.id));
      }
    }
    return affected;
  });
}

// Remove the tag from every domain of the scope + delete its metadata row.
// Returns the number of domains whose settings changed.
export async function deleteTag(
  userId: string,
  accountId: string | undefined,
  name: string,
): Promise<number> {
  return db.transaction(async (tx) => {
    const domainRows = await findScopedDomains(tx, userId, accountId);
    let affected = 0;
    for (const domain of domainRows) {
      const updated = transformTags(domain.settingsJson, (tagList) =>
        tagList.filter((tag) => tag !== name),
      );
      if (updated !== null) {
        await tx.update(domains).set({ settingsJson: updated }).where(eq(domains.id, domain.id));
        affected += 1;
      }
    }
    await tx.delete(tags).where(and(eq(tags.userId, userId), eq(tags.name, name)));
    return affected;
  });
}

// Pure rule matcher (case-insensitive). Disabled rules never match.
export function matchTagRules(
  rules: TagRuleLike[],
  zone: { name: string; plan?: string },
): string[] {
  const matched = new Set<string>();
  for (const rule of rules) {
    if (rule.enabled === false) continue;
    const fieldValue = (rule.field === "plan" ? (zone.plan ?? "") : zone.name).toLowerCase();
    const value = rule.value.toLowerCase();
    let hit = false;
    switch (rule.op) {
      case "endsWith":
        hit = fieldValue.endsWith(value);
        break;
      case "startsWith":
        hit = fieldValue.startsWith(value);
        break;
      case "contains":
        hit = fieldValue.includes(value);
        break;
      case "equals":
        hit = fieldValue === value;
        break;
    }
    if (hit) matched.add(rule.tag);
  }
  return [...matched];
}
