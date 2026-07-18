import { prisma } from "./db.js";

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

function mapChangeSet(record: any) {
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
    items: (record.items || []).map((item: any) => ({
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
  const created = await prisma.changeSet.create({
    data: {
      ownerId: payload.ownerId,
      accountId: payload.accountId,
      zoneId: payload.zoneId,
      action: payload.action,
      status: payload.status ?? "done",
      reversible: payload.reversible ?? false,
      jobId: payload.jobId,
      metaJson: payload.meta ? JSON.stringify(payload.meta) : null,
      finishedAt: payload.finishedAt ?? null,
      items: payload.items?.length
        ? {
            create: payload.items.map((item) => ({
              resourceType: item.resourceType,
              resourceId: item.resourceId,
              beforeJson: item.before !== undefined ? JSON.stringify(item.before) : null,
              afterJson: item.after !== undefined ? JSON.stringify(item.after) : null,
              status: item.status ?? "done",
              error: item.error ?? null,
            })),
          }
        : undefined,
    },
    include: { items: true },
  });
  return mapChangeSet(created);
}

export async function listChangeSets(ownerId: string, params: { limit?: number; accountId?: string; zoneId?: string; action?: string }) {
  const take = Math.min(Math.max(params.limit ?? 50, 1), 200);
  const records = await prisma.changeSet.findMany({
    where: {
      ownerId,
      accountId: params.accountId,
      zoneId: params.zoneId,
      action: params.action,
    },
    orderBy: { createdAt: "desc" },
    take,
    include: { items: true },
  });
  return records.map(mapChangeSet);
}

export async function getChangeSetById(id: string) {
  const record = await prisma.changeSet.findUnique({
    where: { id },
    include: { items: true },
  });
  if (!record) return null;
  return mapChangeSet(record);
}

export async function markChangeSetStatus(changeSetId: string, status: string) {
  const updated = await prisma.changeSet.update({
    where: { id: changeSetId },
    data: { status },
    include: { items: true },
  });
  return mapChangeSet(updated);
}

export async function getRollbackPreview(changeSetId: string, ownerId: string) {
  const changeSet = await getChangeSetById(changeSetId);
  if (!changeSet || changeSet.ownerId !== ownerId) return null;

  const operations = changeSet.items.map((item: any) => ({
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
