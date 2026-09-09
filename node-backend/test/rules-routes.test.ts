import request from "supertest";
import bcrypt from "bcryptjs";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { eq } from "drizzle-orm";

import { app } from "../src/app.js";
import { cloudflareService } from "../src/services/cloudflare.js";
import { configService } from "../src/services/configService.js";
import { db } from "../src/services/db.js";
import { cloudflareAccounts, users } from "../src/db/schema.js";
import { encrypt } from "../src/utils/encryption.js";

const run = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const email = `rules-routes-test-${run}@example.com`;
const password = "RulesRoutesPass123";
const zoneId = `zone-rr-${run}`;

let userId: string;
let accountId: string;
let token: string;

beforeAll(async () => {
  const passwordHash = await bcrypt.hash(password, 12);
  const [user] = await db.insert(users).values({ email, passwordHash, role: "user" }).returning();
  userId = user.id;

  const account = await configService.addAccount({
    userId,
    authType: "apiToken",
    label: `rules-routes-test-${run}`,
    globalApiKeyEncrypted: encrypt("dummy-rules-routes-token"),
  });
  accountId = account.id;

  const res = await request(app).post("/api/auth/login").send({ email, password });
  expect(res.status).toBe(200);
  token = res.body.token;
});

afterAll(async () => {
  await db.delete(cloudflareAccounts).where(eq(cloudflareAccounts.id, accountId));
  await db.delete(users).where(eq(users.id, userId));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/rules/:zoneId/:kind", () => {
  it("accepts kind security and queries the firewall custom phase", async () => {
    const spy = vi.spyOn(cloudflareService, "getRulesetRules").mockResolvedValue({
      rulesetId: "rs_1",
      phase: "http_request_firewall_custom",
      rules: [],
    });

    const res = await request(app)
      .get(`/api/rules/${zoneId}/security?accountId=${accountId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ rules: [], quota: { used: 0 }, warnings: [] });
    expect(spy).toHaveBeenCalledWith(expect.anything(), zoneId, "http_request_firewall_custom");
  });

  it("rejects an unknown kind with 400", async () => {
    const res = await request(app)
      .get(`/api/rules/${zoneId}/ratelimit?accountId=${accountId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("RULE_KIND_UNSUPPORTED");
  });
});

describe("POST /api/rules/:zoneId/:kind", () => {
  it("creates a security rule with the requested action", async () => {
    const spy = vi.spyOn(cloudflareService, "createRulesetRule").mockResolvedValue({
      id: "r1",
      enabled: true,
      description: "Block xmlrpc",
      expression: '(http.request.uri.path eq "/xmlrpc.php")',
      action: "block",
    });

    const res = await request(app)
      .post(`/api/rules/${zoneId}/security?accountId=${accountId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        enabled: true,
        description: "Block xmlrpc",
        expression: '(http.request.uri.path eq "/xmlrpc.php")',
        action: "managed_challenge",
      });

    expect(res.status).toBe(201);
    expect(spy).toHaveBeenCalledWith(expect.anything(), zoneId, "http_request_firewall_custom", {
      enabled: true,
      description: "Block xmlrpc",
      expression: '(http.request.uri.path eq "/xmlrpc.php")',
      action: "managed_challenge",
      actionParameters: undefined,
    });
  });

  it("falls back to the block default action when none is sent", async () => {
    const spy = vi.spyOn(cloudflareService, "createRulesetRule").mockResolvedValue({
      id: "r2",
      enabled: true,
      description: "",
      expression: "true",
      action: "block",
    });

    const res = await request(app)
      .post(`/api/rules/${zoneId}/security?accountId=${accountId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ expression: "true" });

    expect(res.status).toBe(201);
    expect(spy).toHaveBeenCalledWith(
      expect.anything(),
      zoneId,
      "http_request_firewall_custom",
      expect.objectContaining({ action: "block" }),
    );
  });
});
