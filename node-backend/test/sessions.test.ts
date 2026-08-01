import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { app } from "../src/app.js";
import { prisma } from "../src/services/db.js";
import { env } from "../src/utils/env.js";

const email = `sessions-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
const otherEmail = `sessions-other-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
const password = "SessionsPass123";

let userId: string;
let otherUserId: string;
let tokenA: string; // "current" session
let tokenB: string; // second session, to be revoked individually
let otherToken: string;

function jtiOf(token: string): string {
  return (jwt.decode(token) as { jti: string }).jti;
}

async function login(loginEmail: string) {
  const res = await request(app)
    .post("/api/auth/login")
    .set("User-Agent", "vitest-agent")
    .send({ email: loginEmail, password });
  expect(res.status).toBe(200);
  return res.body.token as string;
}

async function me(token: string) {
  return request(app).get("/api/auth/me").set("Authorization", `Bearer ${token}`);
}

beforeAll(async () => {
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({ data: { email, passwordHash, role: "user" } });
  userId = user.id;
  const other = await prisma.user.create({ data: { email: otherEmail, passwordHash, role: "user" } });
  otherUserId = other.id;

  tokenA = await login(email);
  tokenB = await login(email);
  otherToken = await login(otherEmail);
});

afterAll(async () => {
  // Session rows cascade with user delete
  await prisma.user.deleteMany({ where: { id: { in: [userId, otherUserId] } } });
});

describe("login sessions", () => {
  it("login creates a session row and the token works", async () => {
    const sessions = await prisma.session.findMany({ where: { userId } });
    expect(sessions).toHaveLength(2);
    expect(sessions.map((s) => s.jti)).toEqual(
      expect.arrayContaining([jtiOf(tokenA), jtiOf(tokenB)]),
    );
    expect(sessions[0].userAgent).toBe("vitest-agent");
    expect(sessions[0].ip).toBeTruthy();

    const res = await me(tokenA);
    expect(res.status).toBe(200);
    expect(res.body.userId).toBe(userId);
  });

  it("GET /api/auth/sessions lists non-revoked sessions newest first and marks current", async () => {
    const res = await request(app)
      .get("/api/auth/sessions")
      .set("Authorization", `Bearer ${tokenA}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);

    for (const s of res.body) {
      expect(s).toMatchObject({
        id: expect.any(String),
        userAgent: "vitest-agent",
      });
      expect(s.createdAt).toBeTruthy();
      expect(s.lastSeenAt).toBeTruthy();
      expect(s).not.toHaveProperty("jti");
    }

    const currents = res.body.filter((s: { current: boolean }) => s.current);
    expect(currents).toHaveLength(1);
    const currentSession = await prisma.session.findUnique({ where: { jti: jtiOf(tokenA) } });
    expect(currents[0].id).toBe(currentSession!.id);

    const times = res.body.map((s: { createdAt: string }) => new Date(s.createdAt).getTime());
    expect(times[0]).toBeGreaterThanOrEqual(times[1]);
  });

  it("cannot revoke a session owned by another user (404)", async () => {
    const foreign = await prisma.session.findUnique({ where: { jti: jtiOf(otherToken) } });
    const res = await request(app)
      .delete(`/api/auth/sessions/${foreign!.id}`)
      .set("Authorization", `Bearer ${tokenA}`);
    expect(res.status).toBe(404);

    const still = await me(otherToken);
    expect(still.status).toBe(200);
  });

  it("revoking another own session invalidates that token while current keeps working", async () => {
    const sessionB = await prisma.session.findUnique({ where: { jti: jtiOf(tokenB) } });
    const res = await request(app)
      .delete(`/api/auth/sessions/${sessionB!.id}`)
      .set("Authorization", `Bearer ${tokenA}`);
    expect(res.status).toBe(200);

    const revoked = await me(tokenB);
    expect(revoked.status).toBe(401);
    expect(revoked.body.detail).toBeTruthy();

    const current = await me(tokenA);
    expect(current.status).toBe(200);

    // Revoked session no longer listed
    const list = await request(app)
      .get("/api/auth/sessions")
      .set("Authorization", `Bearer ${tokenA}`);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].current).toBe(true);

    // Revoking again → 404 (already revoked)
    const again = await request(app)
      .delete(`/api/auth/sessions/${sessionB!.id}`)
      .set("Authorization", `Bearer ${tokenA}`);
    expect(again.status).toBe(404);
  });

  it("DELETE /api/auth/sessions revokes all other sessions but keeps the current one", async () => {
    const tokenC = await login(email);
    expect((await me(tokenC)).status).toBe(200);

    const res = await request(app)
      .delete("/api/auth/sessions")
      .set("Authorization", `Bearer ${tokenA}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ revoked: 1 });

    expect((await me(tokenC)).status).toBe(401);
    expect((await me(tokenA)).status).toBe(200);

    // Other user's sessions untouched
    expect((await me(otherToken)).status).toBe(200);
  });

  it("legacy token without jti is still accepted (backward compat)", async () => {
    const jwtSecret = env.JWT_SECRET || "default-jwt-secret-change-in-production";
    const legacy = jwt.sign({ userId, email, role: "user" }, jwtSecret, { expiresIn: "7d" });

    const res = await me(legacy);
    expect(res.status).toBe(200);
    expect(res.body.userId).toBe(userId);

    // Sessions list works with legacy token; nothing is marked current
    const list = await request(app)
      .get("/api/auth/sessions")
      .set("Authorization", `Bearer ${legacy}`);
    expect(list.status).toBe(200);
    expect(list.body.every((s: { current: boolean }) => s.current === false)).toBe(true);
  });
});
