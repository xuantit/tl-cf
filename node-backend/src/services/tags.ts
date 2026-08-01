import { prisma } from "./db.js";

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

function domainScope(userId: string, accountId?: string) {
  return { account: { userId, ...(accountId ? { id: accountId } : {}) } };
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
  const [domains, metadata] = await Promise.all([
    prisma.domain.findMany({
      where: domainScope(userId, accountId),
      select: { settingsJson: true },
    }),
    prisma.tag.findMany({ where: { userId } }),
  ]);

  const result = new Map<string, AggregatedTag>();
  for (const domain of domains) {
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
  return prisma.$transaction(async (tx) => {
    const domains = await tx.domain.findMany({
      where: domainScope(userId, accountId),
      select: { id: true, settingsJson: true },
    });
    let affected = 0;
    for (const domain of domains) {
      const updated = transformTags(domain.settingsJson, (tags) =>
        tags.includes(from) ? [...new Set(tags.map((tag) => (tag === from ? to : tag)))] : tags,
      );
      if (updated !== null) {
        await tx.domain.update({ where: { id: domain.id }, data: { settingsJson: updated } });
        affected += 1;
      }
    }

    // Move metadata: if a row for `to` already exists, merge (drop the old row)
    const fromMeta = await tx.tag.findUnique({
      where: { userId_name: { userId, name: from } },
    });
    if (fromMeta) {
      const toMeta = await tx.tag.findUnique({
        where: { userId_name: { userId, name: to } },
      });
      if (toMeta) {
        await tx.tag.delete({ where: { id: fromMeta.id } });
      } else {
        await tx.tag.update({ where: { id: fromMeta.id }, data: { name: to } });
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
  return prisma.$transaction(async (tx) => {
    const domains = await tx.domain.findMany({
      where: domainScope(userId, accountId),
      select: { id: true, settingsJson: true },
    });
    let affected = 0;
    for (const domain of domains) {
      const updated = transformTags(domain.settingsJson, (tags) =>
        tags.filter((tag) => tag !== name),
      );
      if (updated !== null) {
        await tx.domain.update({ where: { id: domain.id }, data: { settingsJson: updated } });
        affected += 1;
      }
    }
    await tx.tag.deleteMany({ where: { userId, name } });
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
