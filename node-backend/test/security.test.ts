/**
 * Kiểm thử bảo mật (security regression tests).
 *
 * Tập trung vào các đường tấn công thực tế:
 *  - brute-force đăng nhập
 *  - giả mạo / tái sử dụng JWT
 *  - IDOR: user A đọc/sửa tài khoản Cloudflare của user B
 *  - rò rỉ bí mật Cloudflare qua API response
 *  - leo thang đặc quyền lên admin
 */
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inArray } from "drizzle-orm";

import { app } from "../src/app.js";
import { db } from "../src/services/db.js";
import { cloudflareAccounts, users } from "../src/db/schema.js";
import { env } from "../src/utils/env.js";
import { encrypt } from "../src/utils/encryption.js";

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const victimEmail = `sec-victim-${suffix}@example.com`;
const attackerEmail = `sec-attacker-${suffix}@example.com`;
const password = "SecurityPass123";

const VICTIM_API_TOKEN = "cf-secret-token-do-not-leak-1234567890";

let victimId: string;
let attackerId: string;
let victimToken: string;
let attackerToken: string;
let victimAccountId: string;

async function login(email: string) {
  const res = await request(app).post("/api/auth/login").send({ email, password });
  expect(res.status).toBe(200);
  return res.body.token as string;
}

beforeAll(async () => {
  const passwordHash = await bcrypt.hash(password, 12);
  const [victim] = await db
    .insert(users)
    .values({ email: victimEmail, passwordHash, role: "user" })
    .returning();
  const [attacker] = await db
    .insert(users)
    .values({ email: attackerEmail, passwordHash, role: "user" })
    .returning();
  victimId = victim.id;
  attackerId = attacker.id;

  const [account] = await db
    .insert(cloudflareAccounts)
    .values({
      userId: victimId,
      label: `victim-cf-${suffix}`,
      authType: "apiToken",
      credentialEncrypted: encrypt(VICTIM_API_TOKEN),
      isActive: true,
    })
    .returning();
  victimAccountId = account.id;

  victimToken = await login(victimEmail);
  attackerToken = await login(attackerEmail);
});

afterAll(async () => {
  await db.delete(users).where(inArray(users.id, [victimId, attackerId]));
});

describe("xác thực & JWT", () => {
  it("từ chối request không có token", async () => {
    const res = await request(app).get("/api/cf/accounts");
    expect(res.status).toBe(401);
  });

  it("từ chối token ký bằng secret khác (forge)", async () => {
    const forged = jwt.sign({ userId: victimId, email: victimEmail, role: "admin" }, "wrong-secret");
    const res = await request(app).get("/api/cf/accounts").set("Authorization", `Bearer ${forged}`);
    expect(res.status).toBe(401);
  });

  it("từ chối token alg=none", async () => {
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({ userId: victimId, email: victimEmail, role: "admin" }),
    ).toString("base64url");
    const res = await request(app)
      .get("/api/cf/accounts")
      .set("Authorization", `Bearer ${header}.${payload}.`);
    expect(res.status).toBe(401);
  });

  it("từ chối token đã hết hạn", async () => {
    const expired = jwt.sign(
      { userId: victimId, email: victimEmail, role: "user" },
      env.JWT_SECRET,
      { expiresIn: -10 },
    );
    const res = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${expired}`);
    expect(res.status).toBe(401);
  });

  it("role trong token KHÔNG được tin: role lấy lại từ DB", async () => {
    // Attacker tự ký token hợp lệ nhưng claim role=admin
    const escalated = jwt.sign(
      { userId: attackerId, email: attackerEmail, role: "admin" },
      env.JWT_SECRET,
      { expiresIn: "1h" },
    );
    const res = await request(app).get("/api/users").set("Authorization", `Bearer ${escalated}`);
    expect(res.status).toBe(403);
  });

  it("đổi mật khẩu thu hồi các phiên khác", async () => {
    const oldToken = await login(victimEmail);
    const change = await request(app)
      .post("/api/auth/change-password")
      .set("Authorization", `Bearer ${victimToken}`)
      .send({ currentPassword: password, newPassword: password });
    expect(change.status).toBe(200);
    expect(change.body.revokedSessions).toBeGreaterThan(0);

    const reuse = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${oldToken}`);
    expect(reuse.status).toBe(401);

    // phiên hiện tại vẫn dùng được
    const current = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${victimToken}`);
    expect(current.status).toBe(200);
  });
});

describe("cách ly dữ liệu Cloudflare giữa các user (IDOR)", () => {
  it("attacker không đọc được tài khoản CF của victim", async () => {
    const res = await request(app)
      .get(`/api/cf/accounts/${victimAccountId}`)
      .set("Authorization", `Bearer ${attackerToken}`);
    expect(res.status).toBe(404);
  });

  it("attacker không sửa được tài khoản CF của victim", async () => {
    const res = await request(app)
      .put(`/api/cf/accounts/${victimAccountId}`)
      .set("Authorization", `Bearer ${attackerToken}`)
      .send({ label: "hacked" });
    expect(res.status).toBe(404);
  });

  it("attacker không xoá được tài khoản CF của victim", async () => {
    const res = await request(app)
      .delete(`/api/cf/accounts/${victimAccountId}`)
      .set("Authorization", `Bearer ${attackerToken}`);
    expect([403, 404]).toContain(res.status);

    const still = await db.query.cloudflareAccounts.findFirst({
      where: (a, { eq }) => eq(a.id, victimAccountId),
    });
    expect(still).toBeTruthy();
  });

  it("danh sách tài khoản chỉ trả về của chính mình", async () => {
    const res = await request(app)
      .get("/api/cf/accounts")
      .set("Authorization", `Bearer ${attackerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.map((a: { id: string }) => a.id)).not.toContain(victimAccountId);
  });
});

describe("không rò rỉ bí mật Cloudflare", () => {
  it("GET /cf/accounts không trả về token/ciphertext", async () => {
    const res = await request(app)
      .get("/api/cf/accounts")
      .set("Authorization", `Bearer ${victimToken}`);
    expect(res.status).toBe(200);
    const body = JSON.stringify(res.body);
    expect(body).not.toContain(VICTIM_API_TOKEN);
    expect(body).not.toMatch(/credentialEncrypted|globalApiKeyEncrypted/i);
  });

  it("GET /cf/accounts/:id không trả về token", async () => {
    const res = await request(app)
      .get(`/api/cf/accounts/${victimAccountId}`)
      .set("Authorization", `Bearer ${victimToken}`);
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain(VICTIM_API_TOKEN);
  });

  it("export config yêu cầu quyền admin", async () => {
    const res = await request(app)
      .get("/api/cf/accounts/export")
      .set("Authorization", `Bearer ${attackerToken}`);
    expect(res.status).toBe(403);
  });

  it("import config yêu cầu quyền admin", async () => {
    const res = await request(app)
      .post("/api/cf/accounts/import")
      .set("Authorization", `Bearer ${attackerToken}`)
      .send({ config: { version: "1.0", users: [], accounts: [] } });
    expect(res.status).toBe(403);
  });
});

describe("kiểm soát truy cập admin", () => {
  it("user thường không xem được audit log", async () => {
    const res = await request(app)
      .get("/api/audit")
      .set("Authorization", `Bearer ${attackerToken}`);
    expect(res.status).toBe(403);
  });

  it("user thường không tạo được invite code", async () => {
    const res = await request(app)
      .post("/api/invites")
      .set("Authorization", `Bearer ${attackerToken}`)
      .send({ maxUses: 100 });
    expect(res.status).toBe(403);
  });

  it("user thường không sửa/xoá được user khác", async () => {
    const patch = await request(app)
      .patch(`/api/users/${victimId}`)
      .set("Authorization", `Bearer ${attackerToken}`)
      .send({ role: "admin" });
    expect(patch.status).toBe(403);
  });

  it("không thể tạo tài khoản chỉ bằng mã mời khi chưa xác minh email", async () => {
    const res = await request(app)
      .post("/api/auth/verify-email")
      .send({ email: `no-invite-${suffix}@example.com`, password, inviteCode: "invalid-code" });
    expect(res.status).toBe(400);
  });

  it("/api/auth/setup không tạo được admin khi đã có user", async () => {
    const res = await request(app)
      .post("/api/auth/setup")
      .send({ email: `pwn-${suffix}@example.com`, password: "PwnedPass123" });
    expect(res.status).toBe(403);
  });
});

describe("chống brute-force", () => {
  it("khoá sau nhiều lần đăng nhập sai", async () => {
    process.env.RATE_LIMIT_DISABLED = "false";
    try {
      let blocked = false;
      for (let i = 0; i < 15; i += 1) {
        const res = await request(app)
          .post("/api/auth/login")
          .send({ email: victimEmail, password: `wrong-${i}` });
        if (res.status === 429) {
          blocked = true;
          expect(res.body.code).toBe("RATE_LIMITED");
          break;
        }
        expect(res.status).toBe(401);
      }
      expect(blocked).toBe(true);
    } finally {
      delete process.env.RATE_LIMIT_DISABLED;
    }
  });
});
