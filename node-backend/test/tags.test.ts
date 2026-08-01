import request from "supertest";
import bcrypt from "bcryptjs";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { and, eq, inArray } from "drizzle-orm";

import { app } from "../src/app.js";
import { clearDashboardCache } from "../src/routes/dashboard.js";
import { cloudflareService, type Zone } from "../src/services/cloudflare.js";
import { configService } from "../src/services/configService.js";
import { matchTagRules } from "../src/services/tags.js";
import { db } from "../src/services/db.js";
import { cloudflareAccounts, domains, tagRules, tags, users } from "../src/db/schema.js";
import { encrypt } from "../src/utils/encryption.js";

const run = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const email = `tags-test-${run}@example.com`;
const password = "TagsTestPass123";

const zoneAId = `zone-tag-a-${run}`;
const zoneBId = `zone-tag-b-${run}`;

let userId: string;
let accountId: string;
let token: string;
let domainAId: string;
let domainBId: string;

beforeAll(async () => {
  const passwordHash = await bcrypt.hash(password, 12);
  const [user] = await db.insert(users).values({ email, passwordHash, role: "user" }).returning();
  userId = user.id;

  const account = await configService.addAccount({
    userId,
    authType: "apiToken",
    label: `tags-test-${run}`,
    globalApiKeyEncrypted: encrypt("dummy-tags-token"),
  });
  accountId = account.id;

  const [domainA] = await db
    .insert(domains)
    .values({
      accountId,
      name: "a.com",
      zoneId: zoneAId,
      status: "active",
      settingsJson: JSON.stringify({ sslMode: "full", tags: ["prod", "eu"] }),
    })
    .returning();
  const [domainB] = await db
    .insert(domains)
    .values({
      accountId,
      name: "b.com",
      zoneId: zoneBId,
      status: "active",
      settingsJson: JSON.stringify({ tags: ["prod"] }),
    })
    .returning();
  domainAId = domainA.id;
  domainBId = domainB.id;

  // Metadata: one for an in-use tag, one orphan (no domains)
  await db.insert(tags).values([
    { userId, name: "prod", description: "Production zones" },
    { userId, name: "archived", description: "No domains yet" },
  ]);

  const res = await request(app).post("/api/auth/login").send({ email, password });
  expect(res.status).toBe(200);
  token = res.body.token;
});

afterAll(async () => {
  await db.delete(tagRules).where(eq(tagRules.userId, userId));
  await db.delete(tags).where(eq(tags.userId, userId));
  await db.delete(cloudflareAccounts).where(eq(cloudflareAccounts.id, accountId));
  await db.delete(users).where(eq(users.id, userId));
});

beforeEach(() => {
  clearDashboardCache();
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function getTags(domainId: string): Promise<string[]> {
  const domain = await db.query.domains.findFirst({ where: eq(domains.id, domainId) });
  return JSON.parse(domain!.settingsJson ?? "{}").tags ?? [];
}

describe("matchTagRules (pure)", () => {
  it("matches endsWith/startsWith/contains/equals case-insensitively", () => {
    const zone = { name: "Shop.Example.DEV", plan: "free" };
    expect(
      matchTagRules(
        [
          { field: "name", op: "endsWith", value: ".dev", tag: "dev" },
          { field: "name", op: "startsWith", value: "shop.", tag: "shop" },
          { field: "name", op: "contains", value: "example", tag: "example" },
          { field: "name", op: "equals", value: "shop.example.dev", tag: "exact" },
          { field: "name", op: "endsWith", value: ".com", tag: "nope" },
        ],
        zone,
      ).sort(),
    ).toEqual(["dev", "exact", "example", "shop"]);
  });

  it("matches on plan field and skips disabled rules", () => {
    const zone = { name: "a.com", plan: "Pro" };
    expect(
      matchTagRules(
        [
          { field: "plan", op: "equals", value: "pro", tag: "paid" },
          { field: "plan", op: "equals", value: "free", tag: "free" },
          { field: "name", op: "endsWith", value: ".com", tag: "disabled-tag", enabled: false },
        ],
        zone,
      ),
    ).toEqual(["paid"]);
    // Missing plan never matches
    expect(
      matchTagRules([{ field: "plan", op: "equals", value: "pro", tag: "paid" }], { name: "x" }),
    ).toEqual([]);
  });
});

describe("/api/tags", () => {
  it("requires auth", async () => {
    const res = await request(app).get("/api/tags");
    expect(res.status).toBe(401);
  });

  it("aggregates tag counts across domains merged with metadata", async () => {
    const res = await request(app)
      .get(`/api/tags?accountId=${accountId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    const byName = Object.fromEntries(res.body.map((t: any) => [t.name, t]));
    expect(byName.prod).toMatchObject({ domainCount: 2, description: "Production zones" });
    expect(byName.eu).toMatchObject({ domainCount: 1 });
    expect(byName.archived).toMatchObject({ domainCount: 0, description: "No domains yet" });
  });

  it("creates tag metadata and returns 409 on duplicate", async () => {
    const created = await request(app)
      .post("/api/tags")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "staging", description: "Staging zones" });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name: "staging", description: "Staging zones" });

    const duplicate = await request(app)
      .post("/api/tags")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "staging" });
    expect(duplicate.status).toBe(409);

    const invalid = await request(app)
      .post("/api/tags")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "" });
    expect(invalid.status).toBe(400);
  });

  it("renames a tag across all domains and metadata in one transaction", async () => {
    const res = await request(app)
      .put(`/api/tags/prod?accountId=${accountId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ newName: "production" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ name: "production", affectedDomains: 2 });

    expect(await getTags(domainAId)).toEqual(["production", "eu"]);
    expect(await getTags(domainBId)).toEqual(["production"]);

    const meta = await db.query.tags.findFirst({
      where: and(eq(tags.userId, userId), eq(tags.name, "production")),
    });
    expect(meta?.description).toBe("Production zones");
    const oldMeta = await db.query.tags.findFirst({
      where: and(eq(tags.userId, userId), eq(tags.name, "prod")),
    });
    expect(oldMeta).toBeUndefined();

    // Other settings fields must survive the rewrite
    const domainA = await db.query.domains.findFirst({ where: eq(domains.id, domainAId) });
    expect(JSON.parse(domainA!.settingsJson!).sslMode).toBe("full");
  });

  it("deletes a tag from all domains and removes metadata", async () => {
    const res = await request(app)
      .delete(`/api/tags/eu?accountId=${accountId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ name: "eu", affectedDomains: 1 });
    expect(await getTags(domainAId)).toEqual(["production"]);
  });
});

describe("/api/tags/rules", () => {
  let ruleId: string;

  it("creates, lists and validates rules", async () => {
    const created = await request(app)
      .post("/api/tags/rules")
      .set("Authorization", `Bearer ${token}`)
      .send({ field: "name", op: "endsWith", value: ".dev", tag: "dev" });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      field: "name",
      op: "endsWith",
      value: ".dev",
      tag: "dev",
      enabled: true,
    });
    ruleId = created.body.id;

    const list = await request(app)
      .get("/api/tags/rules")
      .set("Authorization", `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(list.body.some((r: any) => r.id === ruleId)).toBe(true);

    const invalid = await request(app)
      .post("/api/tags/rules")
      .set("Authorization", `Bearer ${token}`)
      .send({ field: "bogus", op: "endsWith", value: "x", tag: "t" });
    expect(invalid.status).toBe(400);
  });

  it("previews rule matches against the zone list", async () => {
    vi.spyOn(cloudflareService, "listZones").mockResolvedValue([
      { id: "z1", name: "shop.dev", status: "active" },
      { id: "z2", name: "b.com", status: "active" },
      { id: "z3", name: "API.DEV", status: "pending" },
    ] as Zone[]);

    const res = await request(app)
      .post(`/api/tags/rules/${ruleId}/preview?accountId=${accountId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ matchedCount: 2, sample: ["shop.dev", "API.DEV"] });

    const missing = await request(app)
      .post("/api/tags/rules/nonexistent/preview")
      .set("Authorization", `Bearer ${token}`);
    expect(missing.status).toBe(404);
  });

  it("updates and toggles a rule partially", async () => {
    const res = await request(app)
      .put(`/api/tags/rules/${ruleId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ value: ".com", tag: "dotcom" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ value: ".com", tag: "dotcom", enabled: true });
  });

  it("merges enabled rule tags into GET /domains response without persisting", async () => {
    vi.spyOn(cloudflareService, "listZones").mockResolvedValue([
      { id: zoneAId, name: "a.com", status: "active" },
      { id: zoneBId, name: "b.com", status: "active" },
    ] as Zone[]);
    vi.spyOn(cloudflareService, "getSslMode").mockResolvedValue({ mode: "full" });

    const res = await request(app)
      .get(`/api/domains?accountId=${accountId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    const zoneA = res.body.find((z: any) => z.id === zoneAId);
    const zoneB = res.body.find((z: any) => z.id === zoneBId);
    // Saved tags + rule tag (endsWith .com → dotcom), deduped
    expect(zoneA.tags).toEqual(["production", "dotcom"]);
    expect(zoneB.tags).toEqual(["production", "dotcom"]);

    // Rule tags are NOT persisted to settingsJson
    expect(await getTags(domainAId)).toEqual(["production"]);

    // Disabled rules stop matching
    await request(app)
      .put(`/api/tags/rules/${ruleId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ enabled: false });

    const after = await request(app)
      .get(`/api/domains?accountId=${accountId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(after.status).toBe(200);
    const zoneAAfter = after.body.find((z: any) => z.id === zoneAId);
    expect(zoneAAfter.tags).toEqual(["production"]);
  });

  it("deletes a rule", async () => {
    const res = await request(app)
      .delete(`/api/tags/rules/${ruleId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);

    const missing = await request(app)
      .delete(`/api/tags/rules/${ruleId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(missing.status).toBe(404);
  });
});
