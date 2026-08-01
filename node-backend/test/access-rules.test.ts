import request from "supertest";
import bcrypt from "bcryptjs";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { app } from "../src/app.js";
import { cloudflareService, type AccessRule } from "../src/services/cloudflare.js";
import { configService } from "../src/services/configService.js";
import { prisma } from "../src/services/db.js";
import { encrypt } from "../src/utils/encryption.js";

const run = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const email = `access-rules-test-${run}@example.com`;
const password = "AccessRulesPass123";
const zoneId = `zone-ar-${run}`;

let userId: string;
let accountId: string;
let token: string;

const sampleRule: AccessRule = {
  id: "rule-1",
  mode: "block",
  configuration: { target: "ip", value: "203.0.113.7" },
  notes: "bad actor",
  created_on: "2026-07-28T00:00:00Z",
  modified_on: "2026-07-28T00:00:00Z",
};

beforeAll(async () => {
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { email, passwordHash, role: "user" },
  });
  userId = user.id;

  const account = await configService.addAccount({
    userId,
    authType: "apiToken",
    label: `access-rules-test-${run}`,
    globalApiKeyEncrypted: encrypt("dummy-access-rules-token"),
  });
  accountId = account.id;

  const res = await request(app).post("/api/auth/login").send({ email, password });
  expect(res.status).toBe(200);
  token = res.body.token;
});

afterAll(async () => {
  await prisma.changeSet.deleteMany({ where: { ownerId: userId } });
  await prisma.cloudflareAccount.deleteMany({ where: { id: accountId } });
  await prisma.user.deleteMany({ where: { id: userId } });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/domains/:zoneId/access-rules", () => {
  it("returns 401 without a token", async () => {
    const res = await request(app).get(`/api/domains/${zoneId}/access-rules`);
    expect(res.status).toBe(401);
  });

  it("returns mocked rules", async () => {
    const spy = vi.spyOn(cloudflareService, "listAccessRules").mockResolvedValue([sampleRule]);

    const res = await request(app)
      .get(`/api/domains/${zoneId}/access-rules?accountId=${accountId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ rules: [sampleRule] });
    expect(spy).toHaveBeenCalledWith(expect.anything(), zoneId);
  });
});

describe("POST /api/domains/:zoneId/access-rules", () => {
  it("rejects an invalid ip value with 400", async () => {
    const spy = vi.spyOn(cloudflareService, "createAccessRule");

    const res = await request(app)
      .post(`/api/domains/${zoneId}/access-rules?accountId=${accountId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ mode: "block", target: "ip", value: "999.1.2.3" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("ACCESS_RULE_INVALID_VALUE");
    expect(spy).not.toHaveBeenCalled();
  });

  it("rejects an invalid mode with 400", async () => {
    const res = await request(app)
      .post(`/api/domains/${zoneId}/access-rules?accountId=${accountId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ mode: "nuke", target: "ip", value: "203.0.113.7" });

    expect(res.status).toBe(400);
  });

  it("creates a rule for a valid ip and records a change set", async () => {
    const created: AccessRule = { ...sampleRule, id: "rule-new" };
    const spy = vi.spyOn(cloudflareService, "createAccessRule").mockResolvedValue(created);

    const res = await request(app)
      .post(`/api/domains/${zoneId}/access-rules?accountId=${accountId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ mode: "block", target: "ip", value: "203.0.113.7", notes: "bad actor" });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe("rule-new");
    expect(spy).toHaveBeenCalledWith(expect.anything(), zoneId, {
      mode: "block",
      configuration: { target: "ip", value: "203.0.113.7" },
      notes: "bad actor",
    });

    const changeSet = await prisma.changeSet.findFirst({
      where: { ownerId: userId, zoneId, action: "access_rule.create" },
    });
    expect(changeSet).not.toBeNull();
    expect(changeSet?.reversible).toBe(false);
  });

  it("normalizes country codes to uppercase", async () => {
    const spy = vi.spyOn(cloudflareService, "createAccessRule").mockResolvedValue({
      ...sampleRule,
      id: "rule-country",
      configuration: { target: "country", value: "VN" },
    });

    const res = await request(app)
      .post(`/api/domains/${zoneId}/access-rules?accountId=${accountId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ mode: "challenge", target: "country", value: "vn" });

    expect(res.status).toBe(201);
    expect(spy).toHaveBeenCalledWith(expect.anything(), zoneId, {
      mode: "challenge",
      configuration: { target: "country", value: "VN" },
      notes: undefined,
    });
  });

  it("normalizes asn values and rejects malformed ones", async () => {
    const spy = vi.spyOn(cloudflareService, "createAccessRule").mockResolvedValue({
      ...sampleRule,
      id: "rule-asn",
      configuration: { target: "asn", value: "AS13335" },
    });

    const bad = await request(app)
      .post(`/api/domains/${zoneId}/access-rules?accountId=${accountId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ mode: "block", target: "asn", value: "13335" });
    expect(bad.status).toBe(400);
    expect(spy).not.toHaveBeenCalled();

    const good = await request(app)
      .post(`/api/domains/${zoneId}/access-rules?accountId=${accountId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ mode: "block", target: "asn", value: "as13335" });
    expect(good.status).toBe(201);
    expect(spy).toHaveBeenCalledWith(expect.anything(), zoneId, {
      mode: "block",
      configuration: { target: "asn", value: "AS13335" },
      notes: undefined,
    });
  });
});

describe("PATCH /api/domains/:zoneId/access-rules/:ruleId", () => {
  it("passes mode/notes updates through to Cloudflare", async () => {
    const updated: AccessRule = { ...sampleRule, mode: "challenge", notes: "softer" };
    const spy = vi.spyOn(cloudflareService, "updateAccessRule").mockResolvedValue(updated);

    const res = await request(app)
      .patch(`/api/domains/${zoneId}/access-rules/rule-1?accountId=${accountId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ mode: "challenge", notes: "softer" });

    expect(res.status).toBe(200);
    expect(res.body.mode).toBe("challenge");
    expect(spy).toHaveBeenCalledWith(expect.anything(), zoneId, "rule-1", {
      mode: "challenge",
      notes: "softer",
    });
  });

  it("rejects an empty body with 400", async () => {
    const res = await request(app)
      .patch(`/api/domains/${zoneId}/access-rules/rule-1?accountId=${accountId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/domains/:zoneId/access-rules/:ruleId", () => {
  it("deletes the rule and records a change set", async () => {
    const spy = vi.spyOn(cloudflareService, "deleteAccessRule").mockResolvedValue(undefined);

    const res = await request(app)
      .delete(`/api/domains/${zoneId}/access-rules/rule-1?accountId=${accountId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(204);
    expect(spy).toHaveBeenCalledWith(expect.anything(), zoneId, "rule-1");

    const changeSet = await prisma.changeSet.findFirst({
      where: { ownerId: userId, zoneId, action: "access_rule.delete" },
    });
    expect(changeSet).not.toBeNull();
    expect(changeSet?.reversible).toBe(false);
  });
});
