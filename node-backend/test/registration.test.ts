import { createHash, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { eq, inArray } from "drizzle-orm";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import './helpers/securitySetup.js';

const { sendEmail } = vi.hoisted(() => ({ sendEmail: vi.fn() }));
// Never send real email or use real Resend credentials in tests.
vi.mock("resend", () => ({ Resend: class { emails = { send: sendEmail }; } }));

import { app } from "../src/app.js";
import { pendingRegistrations, registrationMailQuotas, users } from "../src/db/schema.js";
import { registrationMailboxKey } from "../src/services/registration.js";
import { redactSensitive } from "../src/middleware/audit.js";
import { db } from "../src/services/db.js";
import { env } from "../src/utils/env.js";

const originalConfig = { RESEND_API_KEY: env.RESEND_API_KEY, RESEND_FROM_EMAIL: env.RESEND_FROM_EMAIL, APP_URL: env.APP_URL };
const emails: string[] = [];
const password = "VerifiedOwnerPass123";
const newEmail = () => {
  const email = `email-registration-${randomUUID()}@example.com`;
  emails.push(email);
  return email;
};
function sentToken() {
  const payload = sendEmail.mock.calls.at(-1)![0] as { html: string };
  const link = payload.html.match(/href="([^"]+)"/)![1];
  return { link, token: new URLSearchParams(new URL(link).hash.slice(1)).get("token")! };
}
const register = (email: string) => request(app).post("/api/auth/register").send({ email });
const verify = (token: string) => request(app).post("/api/auth/verify-email").send({ token, password });

beforeAll(() => {
  Object.assign(env, { RESEND_API_KEY: "re_unit_test_only", RESEND_FROM_EMAIL: "signup@example.com", APP_URL: "https://app.example.com" });
});
beforeEach(() => {
  sendEmail.mockReset().mockResolvedValue({ data: { id: "test-email-id" }, error: null });
});
afterEach(async () => {
  if (emails.length) {
    await db.delete(pendingRegistrations).where(inArray(pendingRegistrations.email, emails));
    await db.delete(registrationMailQuotas).where(inArray(registrationMailQuotas.key, emails.map(registrationMailboxKey)));
    await db.delete(users).where(inArray(users.email, emails));
    emails.length = 0;
  }
});
afterAll(() => Object.assign(env, originalConfig));

describe("email registration via Resend", () => {
  it("requires only email; ignores invite, password and role until verification", async () => {
    const email = newEmail();
    const res = await request(app).post("/api/auth/register").send({ email: `  ${email.toUpperCase()}  `, password: "AttackerPass123", inviteCode: "ignored", role: "admin" });
    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({ verificationRequired: true, retryAfter: 60 });
    expect(res.body.token).toBeUndefined();
    expect(await db.query.users.findFirst({ where: eq(users.email, email) })).toBeUndefined();
    const { link, token } = sentToken();
    const pending = await db.query.pendingRegistrations.findFirst({ where: eq(pendingRegistrations.email, email) });
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(pending?.tokenHash).toBe(createHash("sha256").update(token).digest("hex"));
    expect(pending?.tokenHash).not.toBe(token);
    expect(pending!.expiresAt.getTime() - pending!.requestedAt.getTime()).toBe(30 * 60 * 1000);
    expect(link).toBe(`https://app.example.com/verify-email#token=${token}`);
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      from: "CF Tool <signup@example.com>", to: [email], text: expect.stringContaining(token),
    }), { idempotencyKey: expect.stringMatching(/^registration\/[a-f0-9]{32}$/) });
    expect(pending!.tokenEncrypted).toBeTruthy();
    expect(pending!.tokenEncrypted).not.toContain(token);
    const login = await request(app).post("/api/auth/login").send({ email, password: "AttackerPass123" });
    expect(login.status).toBe(401);
  });

  it("creates only a regular user after verification, then allows login", async () => {
    const email = newEmail();
    await register(email);
    const { token } = sentToken();
    const result = await request(app).post("/api/auth/verify-email").send({ token, password, role: "admin", email: "other@example.com" });
    expect(result.status).toBe(201);
    expect(result.body).toMatchObject({ email, role: "user" });
    expect(result.body.passwordHash).toBeUndefined();
    const user = await db.query.users.findFirst({ where: eq(users.email, email) });
    expect(await bcrypt.compare(password, user!.passwordHash)).toBe(true);
    expect(await db.query.pendingRegistrations.findFirst({ where: eq(pendingRegistrations.email, email) })).toBeUndefined();
    const login = await request(app).post("/api/auth/login").send({ email: email.toUpperCase(), password });
    expect(login.status).toBe(200);
    expect(login.body.token).toBeTruthy();
    expect((await verify(token)).status).toBe(400);
  });

  it.each([1, 2, 3])("consumes a token atomically under concurrent verification (run %i)", async () => {
    const email = newEmail();
    await register(email);
    const { token } = sentToken();
    const results = await Promise.all([verify(token), verify(token)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 400]);
    expect(await db.query.users.findMany({ where: eq(users.email, email) })).toHaveLength(1);
  });

  it("rejects expired, fabricated and missing tokens without creating a user", async () => {
    const email = newEmail();
    await register(email);
    const { token } = sentToken();
    await db.update(pendingRegistrations).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(pendingRegistrations.email, email));
    expect((await verify(token)).body.code).toBe("INVALID_VERIFICATION_TOKEN");
    expect((await verify("a".repeat(64))).status).toBe(400);
    expect((await verify("")).status).toBe(400);
    expect(await db.query.users.findFirst({ where: eq(users.email, email) })).toBeUndefined();
  });

  it("enforces an email-wide cooldown and preserves the active token on resend", async () => {
    const email = newEmail();
    await Promise.all([register(email), register(email)]);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const firstToken = sentToken().token;
    await db.update(pendingRegistrations).set({ requestedAt: new Date(Date.now() - 61_000) }).where(eq(pendingRegistrations.email, email));
    expect((await register(email)).status).toBe(202);
    expect(sendEmail).toHaveBeenCalledTimes(2);
    const secondToken = sentToken().token;
    expect(secondToken).toBe(firstToken);
    expect(sendEmail.mock.calls[1][1].idempotencyKey).not.toBe(sendEmail.mock.calls[0][1].idempotencyKey);
    expect((await verify(firstToken)).status).toBe(201);
    expect((await verify(secondToken)).status).toBe(400);
  });

  it("does not disclose or modify existing accounts, including mixed-case legacy email", async () => {
    const email = newEmail();
    const legacyEmail = email.toUpperCase();
    emails.push(legacyEmail);
    await db.insert(users).values({ email: legacyEmail, passwordHash: "existing-hash", role: "admin" });
    const res = await register(email);
    expect(res.status).toBe(202);
    expect(res.body.verificationRequired).toBe(true);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(await db.query.pendingRegistrations.findFirst({ where: eq(pendingRegistrations.email, email) })).toBeUndefined();
    expect((await db.query.users.findFirst({ where: eq(users.email, legacyEmail) }))?.passwordHash).toBe("existing-hash");
  });

  it("cannot overwrite an account created after the email was sent", async () => {
    const email = newEmail();
    await register(email);
    const { token } = sentToken();
    await db.insert(users).values({ email, passwordHash: "do-not-replace", role: "admin" });
    expect((await verify(token)).status).toBe(400);
    expect((await db.query.users.findFirst({ where: eq(users.email, email) }))?.passwordHash).toBe("do-not-replace");
  });

  it.each(["invalid", "", "x".repeat(255) + "@example.com"])("validates email: %s", async (email) => {
    expect((await register(email)).status).toBe(400);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("rejects weak/oversized passwords without consuming a valid token", async () => {
    const email = newEmail();
    await register(email);
    const { token } = sentToken();
    for (const invalid of ["short", "a".repeat(73), "ấ".repeat(25)]) {
      const res = await request(app).post("/api/auth/verify-email").send({ token, password: invalid });
      expect(res.status).toBe(400);
    }
    expect((await verify(token)).status).toBe(201);
  });

  it.each(["RESEND_API_KEY", "RESEND_FROM_EMAIL", "APP_URL"] as const)("fails closed when %s is missing", async (key) => {
    const saved = env[key];
    env[key] = undefined;
    try {
      const email = newEmail();
      const res = await register(email);
      expect(res.status).toBe(503);
      expect(res.body.code).toBe("EMAIL_NOT_CONFIGURED");
      expect(sendEmail).not.toHaveBeenCalled();
      expect(await db.query.pendingRegistrations.findFirst({ where: eq(pendingRegistrations.email, email) })).toBeUndefined();
    } finally { env[key] = saved; }
  });

  it.each(["provider", "network", "empty"])("handles %s delivery failure safely and enforces cooldown before retry", async (kind) => {
    if (kind === "network") sendEmail.mockRejectedValueOnce(new Error("secret-provider-detail"));
    else sendEmail.mockResolvedValueOnce({ data: null, error: kind === "provider" ? { message: "secret-provider-detail" } : null });
    const email = newEmail();
    const res = await register(email);
    expect(res.status).toBe(503);
    expect(res.body.code).toBe("EMAIL_SEND_FAILED");
    expect(JSON.stringify(res.body)).not.toContain("secret-provider-detail");
    expect(await db.query.pendingRegistrations.findFirst({ where: eq(pendingRegistrations.email, email) })).toBeDefined();
    expect((await register(email)).status).toBe(202);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    await db.update(pendingRegistrations).set({ requestedAt: new Date(Date.now() - 61000) }).where(eq(pendingRegistrations.email, email));
    expect((await register(email)).status).toBe(202);
    expect(sendEmail).toHaveBeenCalledTimes(2);
  });

  it("redacts verification tokens and passwords from audit metadata", () => {
    expect(redactSensitive({ token: "secret-link", password })).toEqual({ token: "[REDACTED]", password: "[REDACTED]" });
  });

  it("counts successful requests towards the registration mail rate limit", async () => {
    const email = newEmail();
    const saved = process.env.RATE_LIMIT_DISABLED;
    process.env.RATE_LIMIT_DISABLED = "false";
    try {
      for (let i = 0; i < 5; i++) expect((await register(email)).status).toBe(202);
      const blocked = await register(email);
      expect(blocked.status).toBe(429);
      expect(blocked.body.code).toBe("RATE_LIMITED");
      expect(sendEmail).toHaveBeenCalledTimes(1);
    } finally {
      if (saved === undefined) delete process.env.RATE_LIMIT_DISABLED;
      else process.env.RATE_LIMIT_DISABLED = saved;
    }
  });
});