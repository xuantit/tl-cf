import request from "supertest";
import bcrypt from "bcryptjs";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { eq, inArray } from "drizzle-orm";

import { app } from "../src/app.js";
import { clearDashboardCache } from "../src/routes/dashboard.js";
import { cloudflareService, type Zone } from "../src/services/cloudflare.js";
import { configService } from "../src/services/configService.js";
import { db } from "../src/services/db.js";
import { bulkJobs, changeItems, changeSets, cloudflareAccounts, domains, users } from "../src/db/schema.js";
import { encrypt } from "../src/utils/encryption.js";

const email = `dashboard-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
const password = "DashboardPass123";

let userId: string;
let accountId: string;
let token: string;
const jobIds: string[] = [];
const changeSetIds: string[] = [];

const zones: Zone[] = [
  { id: "zone-a", name: "a.com", status: "active", plan: "free" },
  { id: "zone-b", name: "b.com", status: "active", plan: "pro" },
  { id: "zone-c", name: "c.com", status: "pending", plan: "free" },
  { id: "zone-d", name: "d.com", status: "moved" },
  { id: "zone-e", name: "e.com", status: "initializing", plan: "free" },
];

beforeAll(async () => {
  const passwordHash = await bcrypt.hash(password, 12);
  const [user] = await db.insert(users).values({ email, passwordHash, role: "user" }).returning();
  userId = user.id;

  const account = await configService.addAccount({
    userId,
    authType: "apiToken",
    label: `dashboard-test-${Date.now()}`,
    globalApiKeyEncrypted: encrypt("dummy-dashboard-token"),
  });
  accountId = account.id;

  // Domains: one sslMode off, one full, one without settings
  await db.insert(domains).values([
    {
      accountId,
      name: "a.com",
      zoneId: "zone-a",
      status: "active",
      settingsJson: JSON.stringify({ sslMode: "off", tags: ["prod"] }),
    },
    {
      accountId,
      name: "b.com",
      zoneId: "zone-b",
      status: "active",
      settingsJson: JSON.stringify({ sslMode: "full", tags: ["prod", "eu"] }),
    },
    { accountId, name: "c.com", zoneId: "zone-c", status: "pending" },
  ]);

  // ChangeSets: newest first should be dns-update with 2 items
  const [older] = await db
    .insert(changeSets)
    .values({
      ownerId: userId,
      accountId,
      zoneId: "zone-b",
      action: "purge-cache",
      status: "done",
      createdAt: new Date(Date.now() - 60_000),
    })
    .returning();
  const [newer] = await db
    .insert(changeSets)
    .values({
      ownerId: userId,
      accountId,
      zoneId: "zone-a",
      action: "dns-update",
      status: "done",
    })
    .returning();
  await db.insert(changeItems).values([
    { changeSetId: newer.id, resourceType: "dns_record", resourceId: "rec-1" },
    { changeSetId: newer.id, resourceType: "dns_record", resourceId: "rec-2" },
  ]);
  changeSetIds.push(older.id, newer.id);

  // BulkJobs: two inside the 7d window, one outside (excluded)
  const jobsData = [
    {
      id: `dash-job-1-${Date.now()}`,
      type: "bulk-purge",
      ownerId: userId,
      status: "done",
      total: 4,
      processed: 4,
      succeeded: 3,
      failed: 1,
      itemsJson: "[]",
    },
    {
      id: `dash-job-2-${Date.now()}`,
      type: "dns-replace",
      ownerId: userId,
      status: "done",
      total: 2,
      processed: 2,
      succeeded: 2,
      failed: 0,
      itemsJson: "[]",
    },
    {
      id: `dash-job-old-${Date.now()}`,
      type: "bulk-purge",
      ownerId: userId,
      status: "done",
      total: 5,
      processed: 5,
      succeeded: 5,
      failed: 0,
      itemsJson: "[]",
      createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
    },
  ];
  for (const data of jobsData) {
    const [job] = await db.insert(bulkJobs).values(data).returning();
    jobIds.push(job.id);
  }

  const res = await request(app).post("/api/auth/login").send({ email, password });
  expect(res.status).toBe(200);
  token = res.body.token;
});

afterAll(async () => {
  await db.delete(bulkJobs).where(inArray(bulkJobs.id, jobIds));
  await db.delete(changeSets).where(inArray(changeSets.id, changeSetIds));
  await db.delete(cloudflareAccounts).where(eq(cloudflareAccounts.id, accountId));
  await db.delete(users).where(eq(users.id, userId));
});

beforeEach(() => {
  clearDashboardCache();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/dashboard/summary", () => {
  it("requires auth", async () => {
    const res = await request(app).get("/api/dashboard/summary");
    expect(res.status).toBe(401);
  });

  it("returns zone stats, plan distribution, attention, changes, jobs and accounts", async () => {
    const listZonesSpy = vi.spyOn(cloudflareService, "listZones").mockResolvedValue(zones);

    const res = await request(app)
      .get(`/api/dashboard/summary?accountId=${accountId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(listZonesSpy).toHaveBeenCalledTimes(1);

    expect(res.body.zones).toEqual({
      total: 5,
      active: 2,
      pending: 1,
      moved: 1,
      other: 1,
      sslOff: 1,
    });

    expect(res.body.planDistribution).toEqual([
      { plan: "free", count: 3 },
      { plan: "pro", count: 1 },
      { plan: "unknown", count: 1 },
    ]);

    expect(res.body.attention).toEqual({ pendingNs: 1, sslOff: 1, devMode: 0 });

    expect(res.body.recentChanges).toHaveLength(2);
    expect(res.body.recentChanges[0]).toMatchObject({
      action: "dns-update",
      status: "done",
      zoneId: "zone-a",
      itemCount: 2,
    });
    expect(res.body.recentChanges[1]).toMatchObject({
      action: "purge-cache",
      zoneId: "zone-b",
      itemCount: 0,
    });

    expect(res.body.jobs7d).toEqual({ total: 2, succeeded: 5, failed: 1 });

    expect(res.body.accounts).toHaveLength(1);
    expect(res.body.accounts[0]).toMatchObject({
      id: accountId,
      authType: "apiToken",
      isActive: true,
      domainCount: 3,
    });
  });

  it("caches the zone list so a second call does not re-invoke listZones", async () => {
    const listZonesSpy = vi.spyOn(cloudflareService, "listZones").mockResolvedValue(zones);

    const first = await request(app)
      .get(`/api/dashboard/summary?accountId=${accountId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(first.status).toBe(200);

    const second = await request(app)
      .get(`/api/dashboard/summary?accountId=${accountId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(second.status).toBe(200);

    expect(listZonesSpy).toHaveBeenCalledTimes(1);
    expect(second.body.zones.total).toBe(5);
  });
});
