import { randomUUID } from "node:crypto";

import { prisma } from "./db.js";
import logger from "../utils/logger.js";

export type BulkJobItemStatus = "pending" | "running" | "success" | "error";

export interface BulkJobItem {
  key: string;
  label?: string;
  status: BulkJobItemStatus;
  error?: string;
  result?: unknown;
}

export interface BulkJob {
  id: string;
  type: string;
  ownerId: string;
  status: "running" | "done" | "interrupted";
  total: number;
  processed: number;
  succeeded: number;
  failed: number;
  items: BulkJobItem[];
  createdAt: number;
  finishedAt?: number;
}

export interface BulkJobItemInput {
  key: string;
  label?: string;
}

type Worker = (item: BulkJobItemInput) => Promise<unknown>;

const CONCURRENCY = 5;
const MAX_RETRIES = 2; // total attempts = 1 + MAX_RETRIES
const RETRY_DELAYS_MS = [1000, 3000];
const JOB_TTL_MS = 60 * 60 * 1000; // 1 hour
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

const jobs = new Map<string, BulkJob>();

const PERSIST_THROTTLE_MS = 1000;
const lastPersistAt = new Map<string, number>();

async function persistJob(job: BulkJob): Promise<void> {
  try {
    const data = {
      type: job.type,
      ownerId: job.ownerId,
      status: job.status,
      total: job.total,
      processed: job.processed,
      succeeded: job.succeeded,
      failed: job.failed,
      itemsJson: JSON.stringify(job.items),
      finishedAt: job.finishedAt ? new Date(job.finishedAt) : null,
    };
    await prisma.bulkJob.upsert({
      where: { id: job.id },
      create: { id: job.id, createdAt: new Date(job.createdAt), ...data },
      update: data,
    });
    lastPersistAt.set(job.id, Date.now());
  } catch (error: any) {
    logger.error("Failed to persist bulk job", { jobId: job.id, error: error?.message });
  }
}

function persistJobThrottled(job: BulkJob): void {
  const last = lastPersistAt.get(job.id) ?? 0;
  if (Date.now() - last >= PERSIST_THROTTLE_MS) {
    void persistJob(job);
  }
}

function jobFromDbRecord(record: {
  id: string;
  type: string;
  ownerId: string;
  status: string;
  total: number;
  processed: number;
  succeeded: number;
  failed: number;
  itemsJson: string;
  createdAt: Date;
  finishedAt: Date | null;
}): BulkJob {
  let items: BulkJobItem[] = [];
  try {
    items = JSON.parse(record.itemsJson);
  } catch {
    items = [];
  }
  return {
    id: record.id,
    type: record.type,
    ownerId: record.ownerId,
    status: record.status as BulkJob["status"],
    total: record.total,
    processed: record.processed,
    succeeded: record.succeeded,
    failed: record.failed,
    items,
    createdAt: record.createdAt.getTime(),
    finishedAt: record.finishedAt?.getTime(),
  };
}

/** Mark jobs left in "running" state by a previous process as interrupted. */
export async function recoverInterruptedJobs(): Promise<void> {
  try {
    const result = await prisma.bulkJob.updateMany({
      where: { status: "running" },
      data: { status: "interrupted", finishedAt: new Date() },
    });
    if (result.count > 0) {
      logger.warn("Marked interrupted bulk jobs from previous run", { count: result.count });
    }
  } catch (error: any) {
    logger.error("Failed to recover interrupted jobs", { error: error?.message });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runItem(job: BulkJob, index: number, input: BulkJobItemInput, worker: Worker): Promise<void> {
  const item = job.items[index];
  item.status = "running";

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await worker(input);
      item.status = "success";
      item.result = result;
      item.error = undefined;
      job.succeeded += 1;
      break;
    } catch (error: any) {
      item.error = error?.message || "Unknown error";
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAYS_MS[attempt] ?? 3000);
      } else {
        item.status = "error";
        job.failed += 1;
      }
    }
  }

  job.processed += 1;
  persistJobThrottled(job);
}

async function processJob(job: BulkJob, inputs: BulkJobItemInput[], worker: Worker): Promise<void> {
  let cursor = 0;

  async function next(): Promise<void> {
    while (cursor < inputs.length) {
      const index = cursor;
      cursor += 1;
      await runItem(job, index, inputs[index], worker);
    }
  }

  const pool = Array.from({ length: Math.min(CONCURRENCY, inputs.length) }, () => next());
  await Promise.all(pool);
  job.status = "done";
  job.finishedAt = Date.now();
  await persistJob(job);
  logger.info("Bulk job finished", {
    jobId: job.id,
    type: job.type,
    total: job.total,
    succeeded: job.succeeded,
    failed: job.failed,
  });
}

export function createJob(type: string, ownerId: string, inputs: BulkJobItemInput[], worker: Worker): BulkJob {
  const job: BulkJob = {
    id: randomUUID(),
    type,
    ownerId,
    status: "running",
    total: inputs.length,
    processed: 0,
    succeeded: 0,
    failed: 0,
    items: inputs.map((input) => ({ key: input.key, label: input.label, status: "pending" as const })),
    createdAt: Date.now(),
  };
  jobs.set(job.id, job);
  void persistJob(job);

  processJob(job, inputs, worker).catch((error: any) => {
    job.status = "done";
    job.finishedAt = Date.now();
    void persistJob(job);
    logger.error("Bulk job crashed", { jobId: job.id, type: job.type, error: error?.message });
  });

  return job;
}

export function getJob(id: string): BulkJob | undefined {
  return jobs.get(id);
}

/** Look up a job in memory first, then fall back to the persisted history. */
export async function getJobWithHistory(id: string): Promise<BulkJob | undefined> {
  const inMemory = jobs.get(id);
  if (inMemory) return inMemory;
  const record = await prisma.bulkJob.findUnique({ where: { id } });
  return record ? jobFromDbRecord(record) : undefined;
}

export async function listJobs(ownerId: string, limit = 50): Promise<BulkJob[]> {
  const records = await prisma.bulkJob.findMany({
    where: { ownerId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return records.map(jobFromDbRecord);
}

const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (job.status !== "running" && now - job.createdAt > JOB_TTL_MS) {
      jobs.delete(id);
      lastPersistAt.delete(id);
    }
  }
}, CLEANUP_INTERVAL_MS);
cleanupTimer.unref();
