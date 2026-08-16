import { and, desc, eq } from "drizzle-orm";

import { db } from "./db.js";
import { changeItems, changeSets, type ChangeItemRow, type ChangeSetRow } from "../db/schema.js";
import logger from "../utils/logger.js";

export type ChangeItemPayload = {
  resourceType: string;
  resourceId: string;
  before?: unknown;
  after?: unknown;
  status?: string;
  error?: string | null;
};

export type CreateChangeSetPayload = {
  ownerId: string;
  accountId?: string;
  zoneId?: string;
  action: string;
  status?: string;
  reversible?: boolean;
  jobId?: string;
  meta?: unknown;
  finishedAt?: Date | null;
  items?: ChangeItemPayload[];
};

function parseJson<T>(value: string | null | undefined): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

type ChangeSetWithItems = ChangeSetRow & { items?: ChangeItemRow[] };

function mapChangeSet(record: ChangeSetWithItems) {
  return {
    id: record.id,
    ownerId: record.ownerId,
    accountId: record.accountId,
    zoneId: record.zoneId,
    action: record.action,
    status: record.status,
    reversible: record.reversible,
    jobId: record.jobId,
    meta: parseJson(record.metaJson),
    createdAt: record.createdAt,
    finishedAt: record.finishedAt,
    items: (record.items || []).map((item) => ({
      id: item.id,
      resourceType: item.resourceType,
      resourceId: item.resourceId,
      before: parseJson(item.beforeJson),
      after: parseJson(item.afterJson),
      status: item.status,
      error: item.error,
      createdAt: item.createdAt,
    })),
  };
}

export async function createChangeSet(payload: CreateChangeSetPayload) {
  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(changeSets)
      .values({
        ownerId: payload.ownerId,
        accountId: payload.accountId,
        zoneId: payload.zoneId,
        action: payload.action,
        status: payload.status ?? "done",
        reversible: payload.reversible ?? false,
        jobId: payload.jobId,
        metaJson: payload.meta ? JSON.stringify(payload.meta) : null,
        finishedAt: payload.finishedAt ?? null,
      })
      .returning();

    let items: ChangeItemRow[] = [];
    if (payload.items?.length) {
      items = await tx
        .insert(changeItems)
        .values(
          payload.items.map((item) => ({
            changeSetId: created.id,
            resourceType: item.resourceType,
            resourceId: item.resourceId,
            beforeJson: item.before !== undefined ? JSON.stringify(item.before) : null,
            afterJson: item.after !== undefined ? JSON.stringify(item.after) : null,
            status: item.status ?? "done",
            error: item.error ?? null,
          }))
        )
        .returning();
    }
    return mapChangeSet({ ...created, items });
  });
}

/** Persist a change history entry; never let history failures break the primary operation. */
export async function recordChangeSafe(
  payload: CreateChangeSetPayload & { items: ChangeItemPayload[] },
): Promise<void> {
  try {
    await createChangeSet({ status: "done", finishedAt: new Date(), reversible: false, ...payload });
  } catch (error) {
    logger.warn("Failed to record change set", { action: payload.action, error: (error as Error).message });
  }
}

export async function listChangeSets(ownerId: string, params: { limit?: number; accountId?: string; zoneId?: string; action?: string }) {
  const take = Math.min(Math.max(params.limit ?? 50, 1), 200);
  const conditions = [eq(changeSets.ownerId, ownerId)];
  if (params.accountId !== undefined) conditions.push(eq(changeSets.accountId, params.accountId));
  if (params.zoneId !== undefined) conditions.push(eq(changeSets.zoneId, params.zoneId));
  if (params.action !== undefined) conditions.push(eq(changeSets.action, params.action));

  const records = await db.query.changeSets.findMany({
    where: and(...conditions),
    orderBy: desc(changeSets.createdAt),
    limit: take,
    with: { items: true },
  });
  return records.map(mapChangeSet);
}

export async function getChangeSetById(id: string) {
  const record = await db.query.changeSets.findFirst({
    where: eq(changeSets.id, id),
    with: { items: true },
  });
  if (!record) return null;
  return mapChangeSet(record);
}

export async function markChangeSetStatus(changeSetId: string, status: string) {
  const [updated] = await db
    .update(changeSets)
    .set({ status })
    .where(eq(changeSets.id, changeSetId))
    .returning();
  const items = await db.query.changeItems.findMany({
    where: eq(changeItems.changeSetId, changeSetId),
  });
  return mapChangeSet({ ...updated, items });
}

export async function getRollbackPreview(changeSetId: string, ownerId: string) {
  const changeSet = await getChangeSetById(changeSetId);
  if (!changeSet || changeSet.ownerId !== ownerId) return null;

  const operations = changeSet.items.map((item) => ({
    resourceType: item.resourceType,
    resourceId: item.resourceId,
    action: item.before ? "restore" : "delete_created",
    before: item.before,
    after: item.after,
    status: item.status,
  }));

  return {
    id: changeSet.id,
    action: changeSet.action,
    reversible: changeSet.reversible,
    itemCount: operations.length,
    operations,
  };
}
