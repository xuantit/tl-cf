import bcrypt from "bcryptjs";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { app } from "../src/app.js";
import { prisma } from "../src/services/db.js";

const email = `profile-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
const password = "InitialPass123";
const newPassword = "BrandNewPass456";

let userId: string;
let token: string;

async function login(pass: string) {
  return request(app).post("/api/auth/login").send({ email, password: pass });
}

beforeAll(async () => {
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { email, passwordHash, role: "user" },
  });
  userId = user.id;

  const res = await login(password);
  expect(res.status).toBe(200);
  token = res.body.token;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: userId } });
});

describe("auth profile", () => {
  it("login returns user object alongside token", async () => {
    const res = await login(password);
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user).toEqual({
      userId,
      email,
      role: "user",
      displayName: null,
    });
  });

  it("GET /api/auth/me requires auth", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("GET /api/auth/me returns profile", async () => {
    const res = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      userId,
      email,
      role: "user",
      displayName: null,
    });
    expect(res.body.createdAt).toBeTruthy();
  });

  it("PATCH /api/auth/me updates displayName", async () => {
    const res = await request(app)
      .patch("/api/auth/me")
      .set("Authorization", `Bearer ${token}`)
      .send({ displayName: "  Nguyễn Văn A  " });
    expect(res.status).toBe(200);
    expect(res.body.displayName).toBe("Nguyễn Văn A");

    const me = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${token}`);
    expect(me.body.displayName).toBe("Nguyễn Văn A");
  });

  it("PATCH /api/auth/me with empty string clears displayName", async () => {
    const res = await request(app)
      .patch("/api/auth/me")
      .set("Authorization", `Bearer ${token}`)
      .send({ displayName: "" });
    expect(res.status).toBe(200);
    expect(res.body.displayName).toBeNull();
  });

  it("PATCH /api/auth/me rejects displayName over 60 chars", async () => {
    const res = await request(app)
      .patch("/api/auth/me")
      .set("Authorization", `Bearer ${token}`)
      .send({ displayName: "x".repeat(61) });
    expect(res.status).toBe(400);
    expect(res.body.detail).toBeTruthy();
  });

  it("change-password with wrong current password returns 400", async () => {
    const res = await request(app)
      .post("/api/auth/change-password")
      .set("Authorization", `Bearer ${token}`)
      .send({ currentPassword: "wrong-password", newPassword });
    expect(res.status).toBe(400);
    expect(res.body.detail).toBeTruthy();
  });

  it("change-password with short new password returns 400", async () => {
    const res = await request(app)
      .post("/api/auth/change-password")
      .set("Authorization", `Bearer ${token}`)
      .send({ currentPassword: password, newPassword: "short" });
    expect(res.status).toBe(400);
  });

  it("change-password with correct current password succeeds; login works with new password only", async () => {
    const res = await request(app)
      .post("/api/auth/change-password")
      .set("Authorization", `Bearer ${token}`)
      .send({ currentPassword: password, newPassword });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });

    const oldLogin = await login(password);
    expect(oldLogin.status).toBe(401);

    const newLogin = await login(newPassword);
    expect(newLogin.status).toBe(200);
    expect(newLogin.body.token).toBeTruthy();
  });
});
