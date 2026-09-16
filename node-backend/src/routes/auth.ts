import { createHash, randomUUID, timingSafeEqual } from "node:crypto";

import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { and, desc, eq, isNull, ne, sql } from "drizzle-orm";

import { findUserByEmail } from "../models/userJson.js";
import { requireAuth } from "../middleware/auth.js";
import { authLimiter, registrationEmailLimiter, sensitiveLimiter } from "../middleware/rateLimit.js";
import { db } from "../services/db.js";
import { sessions, users } from "../db/schema.js";
import { completeRegistration, requestRegistration, REGISTRATION_RESEND_SECONDS } from "../services/registration.js";
import { RegistrationError } from "../services/registrationEmail.js";
import { publicTurnstileConfig, verifyTurnstile } from "../services/turnstileVerification.js";
import { env } from "../utils/env.js";
import logger from "../utils/logger.js";

export const authRouter = Router();

function logRegistrationFailure(message: string, error: unknown) {
  // Drizzle query errors can include SQL parameters (password hashes/tokens).
  // Log only the PostgreSQL SQLSTATE, never the raw error, query or parameters.
  let cause: unknown = error;
  let databaseCode: string | undefined;
  let connectionFailure = false;
  for (let depth = 0; depth < 4 && cause && typeof cause === "object"; depth++) {
    if (cause instanceof Error && /connection terminated|timeout|socket|ECONN|EPIPE/i.test(cause.message)) {
      connectionFailure = true;
    }
    if ("code" in cause && typeof cause.code === "string" && /^[A-Z0-9_]{3,40}$/.test(cause.code)) {
      databaseCode = cause.code;
      break;
    }
    cause = "cause" in cause ? cause.cause : undefined;
  }
  logger.error(message, { databaseCode, connectionFailure });
}

// Bootstrap is disabled unless an operator explicitly configures a secret.
authRouter.post("/setup", async (req, res) => {
  const supplied = req.get("X-Setup-Token") || "";
  const expected = env.INITIAL_SETUP_TOKEN;
  if (!expected || supplied.length > 256 || !timingSafeEqual(
    createHash("sha256").update(supplied).digest(), createHash("sha256").update(expected).digest(),
  )) return res.status(403).json({ detail: "Initial setup is disabled or not authorized." });
  const parsed = z.object({
    email: z.string().trim().toLowerCase().email().max(254),
    password: z.string().min(8).refine((value) => Buffer.byteLength(value, "utf8") <= 72),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ detail: "Invalid setup input." });
  try {
    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    const user = await db.transaction(async (tx) => {
      // Serializes bootstrap and all User inserts, including regular signup.
      await tx.execute(sql`LOCK TABLE "User" IN SHARE ROW EXCLUSIVE MODE`);
      if (await tx.query.users.findFirst({ columns: { id: true } })) return null;
      const [created] = await tx.insert(users).values({ email: parsed.data.email, passwordHash, role: "admin" })
        .returning({ id: users.id, email: users.email, role: users.role });
      return created;
    });
    if (!user) {
      return res.status(403).json({ detail: "Initial setup already completed. Use /register instead." });
    }
    logger.info("Initial admin user created", { userId: user.id, email: user.email });
    res.json(user);
  } catch (error) {
    logRegistrationFailure("Setup failed", error);
    res.status(500).json({ detail: "Failed to setup initial user" });
  }
});

authRouter.get('/turnstile', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  try { res.json(publicTurnstileConfig()); }
  catch (error) {
    if (error instanceof RegistrationError) return res.status(error.status).json({ code: error.code, detail: error.message });
    res.status(503).json({ detail: 'Anti-bot verification unavailable' });
  }
});

authRouter.post("/register", registrationEmailLimiter, async (req, res) => {
  const parsed = z.object({ email: z.string().trim().toLowerCase().email().max(254) }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ detail: "Vui lòng nhập địa chỉ email hợp lệ." });
  }
  try {
    await verifyTurnstile(req.body?.turnstileToken, 'register');
    await requestRegistration(parsed.data.email);
    res.status(202).json({
      verificationRequired: true,
      retryAfter: REGISTRATION_RESEND_SECONDS,
      detail: "Nếu email chưa được đăng ký, bạn sẽ nhận được liên kết xác minh. Vui lòng kiểm tra cả thư mục spam.",
    });
  } catch (error) {
    if (error instanceof RegistrationError) {
      logger.warn("Registration email unavailable", { code: error.code });
      return res.status(error.status).json({ code: error.code, detail: error.message });
    }
    logRegistrationFailure("Registration request failed", error);
    res.status(500).json({ detail: "Không thể đăng ký lúc này. Vui lòng thử lại sau." });
  }
});

authRouter.post("/verify-email", authLimiter, async (req, res) => {
  const parsed = z.object({
    token: z.string().regex(/^[a-f0-9]{64}$/),
    password: z.string().min(8).refine((v) => Buffer.byteLength(v, "utf8") <= 72),
  }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ detail: "Liên kết không hợp lệ hoặc mật khẩu không đủ 8 ký tự / vượt quá 72 byte." });
  }
  try {
    await verifyTurnstile(req.body?.turnstileToken, 'verify_email');
    const user = await completeRegistration(parsed.data.token, parsed.data.password);
    logger.info("Email registration completed", { userId: user.id });
    res.status(201).json(user);
  } catch (error) {
    if (error instanceof RegistrationError) {
      return res.status(error.status).json({ code: error.code, detail: error.message });
    }
    logRegistrationFailure("Email verification failed", error);
    res.status(500).json({ detail: "Không thể xác minh email lúc này. Vui lòng thử lại sau." });
  }
});

authRouter.post("/login", async (req, res) => {
  const parsed = z.object({
    email: z.string().trim().email().max(254), password: z.string().min(1).max(1024),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ detail: "Invalid login input." });
  try {
    const body = parsed.data;

    const user = await findUserByEmail(body.email) ?? await findUserByEmail(body.email.toLowerCase());
    if (!user) {
      logger.warn("Login attempt with invalid email", { email: body.email });
      return res.status(401).json({ detail: "Invalid credentials" });
    }

    const ok = await bcrypt.compare(body.password, user.passwordHash);
    if (!ok) {
      logger.warn("Login attempt with invalid password", { email: body.email, userId: user.id });
      return res.status(401).json({ detail: "Invalid credentials" });
    }

    const fresh = await db.query.users.findFirst({
      where: eq(users.id, user.id),
      columns: { isActive: true, role: true, displayName: true },
    });
    if (!fresh?.isActive) {
      logger.warn("Login attempt on locked account", { email: body.email, userId: user.id });
      return res.status(403).json({ detail: "Tài khoản đã bị khoá" });
    }

    const jwtSecret = env.JWT_SECRET || "default-jwt-secret-change-in-production";
    const jti = randomUUID();
    const token = jwt.sign({ userId: user.id, email: user.email, role: fresh.role, jti }, jwtSecret, {
      expiresIn: "7d",
    });

    await db.insert(sessions).values({
      userId: user.id,
      jti,
      userAgent: req.headers["user-agent"]?.slice(0, 200) ?? null,
      ip: req.ip ?? null,
    });

    logger.info("User logged in", { userId: user.id, email: user.email, role: fresh.role });
    res.json({
      token,
      user: { userId: user.id, email: user.email, role: fresh.role, displayName: fresh.displayName },
    });
  } catch (error) {
    logRegistrationFailure("Login failed", error);
    res.status(500).json({ detail: "Login temporarily unavailable." });
  }
});

authRouter.get("/me", requireAuth, async (req, res) => {
  const user = await db.query.users.findFirst({
    where: eq(users.id, req.auth!.userId),
    columns: { id: true, email: true, role: true, displayName: true, createdAt: true },
  });
  if (!user) return res.status(401).json({ detail: "Invalid token" });

  res.json({
    userId: user.id,
    email: user.email,
    role: user.role,
    displayName: user.displayName,
    createdAt: user.createdAt,
  });
});

authRouter.patch("/me", requireAuth, async (req, res) => {
  const bodySchema = z.object({
    displayName: z.string().trim().max(60, "Tên hiển thị tối đa 60 ký tự"),
  });
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ detail: parsed.error.issues[0]?.message || "Invalid body" });
  }

  const displayName = parsed.data.displayName === "" ? null : parsed.data.displayName;
  const [user] = await db
    .update(users)
    .set({ displayName })
    .where(eq(users.id, req.auth!.userId))
    .returning({
      id: users.id,
      email: users.email,
      role: users.role,
      displayName: users.displayName,
      createdAt: users.createdAt,
    });

  logger.info("User profile updated", { userId: user.id });
  res.json({
    userId: user.id,
    email: user.email,
    role: user.role,
    displayName: user.displayName,
    createdAt: user.createdAt,
  });
});

authRouter.post("/change-password", requireAuth, sensitiveLimiter, async (req, res) => {
  const bodySchema = z.object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z.string().min(8, "Mật khẩu mới phải có ít nhất 8 ký tự"),
  });
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ detail: parsed.error.issues[0]?.message || "Invalid body" });
  }

  const user = await db.query.users.findFirst({
    where: eq(users.id, req.auth!.userId),
    columns: { id: true, passwordHash: true },
  });
  if (!user) return res.status(401).json({ detail: "Invalid token" });

  const ok = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
  if (!ok) {
    logger.warn("Change password with wrong current password", { userId: user.id });
    return res.status(400).json({ detail: "Mật khẩu hiện tại không đúng" });
  }

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
  await db.update(users).set({ passwordHash }).where(eq(users.id, user.id));

  // Đổi mật khẩu phải đá văng mọi phiên khác: nếu token cũ bị đánh cắp,
  // nó vẫn sống 7 ngày nếu không revoke.
  const revoked = await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(sessions.userId, user.id),
        isNull(sessions.revokedAt),
        ...(req.auth!.jti ? [ne(sessions.jti, req.auth!.jti)] : []),
      ),
    )
    .returning({ id: sessions.id });

  logger.info("User changed password", { userId: user.id, revokedSessions: revoked.length });
  res.json({ ok: true, revokedSessions: revoked.length });
});

authRouter.get("/sessions", requireAuth, async (req, res) => {
  const rows = await db.query.sessions.findMany({
    where: and(eq(sessions.userId, req.auth!.userId), isNull(sessions.revokedAt)),
    orderBy: desc(sessions.createdAt),
    columns: { id: true, jti: true, userAgent: true, ip: true, createdAt: true, lastSeenAt: true },
  });

  res.json(
    rows.map((s) => ({
      id: s.id,
      userAgent: s.userAgent,
      ip: s.ip,
      createdAt: s.createdAt,
      lastSeenAt: s.lastSeenAt,
      current: s.jti === req.auth!.jti,
    })),
  );
});

// Thu hồi mọi phiên khác (giữ phiên hiện tại) — đặt TRƯỚC /sessions/:id
authRouter.delete("/sessions", requireAuth, async (req, res) => {
  const revokedRows = await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(sessions.userId, req.auth!.userId),
        isNull(sessions.revokedAt),
        ...(req.auth!.jti ? [ne(sessions.jti, req.auth!.jti)] : []),
      ),
    )
    .returning({ id: sessions.id });

  logger.info("User revoked all other sessions", { userId: req.auth!.userId, revoked: revokedRows.length });
  res.json({ revoked: revokedRows.length });
});

authRouter.delete("/sessions/:id", requireAuth, async (req, res) => {
  const sessionId = String(req.params.id);
  const revokedRows = await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(
      and(eq(sessions.id, sessionId), eq(sessions.userId, req.auth!.userId), isNull(sessions.revokedAt)),
    )
    .returning({ id: sessions.id });
  if (revokedRows.length === 0) {
    return res.status(404).json({ detail: "Không tìm thấy phiên đăng nhập" });
  }

  logger.info("User revoked session", { userId: req.auth!.userId, sessionId });
  res.json({ ok: true });
});

