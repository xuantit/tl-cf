import { randomUUID } from "node:crypto";

import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { and, desc, eq, isNull, lt, ne, sql } from "drizzle-orm";

import { findUserByEmail, createUser } from "../models/userJson.js";
import { requireAuth } from "../middleware/auth.js";
import { sensitiveLimiter } from "../middleware/rateLimit.js";
import { db } from "../services/db.js";
import { inviteCodes, sessions, users } from "../db/schema.js";
import { env } from "../utils/env.js";
import logger from "../utils/logger.js";

export const authRouter = Router();

// Allow creating first admin user without authentication
authRouter.post("/setup", async (req, res) => {
  try {
    const bodySchema = z.object({
      email: z.string().email(),
      password: z.string().min(8),
    });
    const body = bodySchema.parse(req.body);

    // Check if any users exist
    const { configService } = await import("../services/configService.js");
    await configService.loadConfig();
    const existingUsers = await configService.getAllUsers();

    if (existingUsers.length > 0) {
      return res.status(403).json({ detail: "Initial setup already completed. Use /register instead." });
    }

    const passwordHash = await bcrypt.hash(body.password, 12);
    const user = await createUser({ email: body.email, passwordHash, role: "admin" });

    logger.info("Initial admin user created", { userId: user.id, email: user.email });
    res.json({ id: user.id, email: user.email, role: user.role });
  } catch (error: any) {
    logger.error("Setup error", { error: error.message });
    res.status(400).json({ detail: error.message || "Failed to setup initial user" });
  }
});

authRouter.post("/register", async (req, res) => {
  try {
    const bodySchema = z.object({
      email: z.string().email(),
      password: z.string().min(8),
      inviteCode: z.string().min(1, "Invite code is required"),
    });
    const body = bodySchema.parse(req.body);

    const invite = await db.query.inviteCodes.findFirst({
      where: eq(inviteCodes.code, body.inviteCode.trim()),
    });
    if (!invite) {
      logger.warn("Registration with invalid invite code", { email: body.email });
      return res.status(403).json({ detail: "Mã mời không hợp lệ" });
    }
    if (invite.expiresAt && invite.expiresAt < new Date()) {
      return res.status(403).json({ detail: "Mã mời đã hết hạn" });
    }
    if (invite.usedCount >= invite.maxUses) {
      return res.status(403).json({ detail: "Mã mời đã được dùng hết" });
    }

    const existing = await findUserByEmail(body.email);
    if (existing) {
      logger.warn("Registration attempt with existing email", { email: body.email });
      return res.status(409).json({ detail: "Email already exists" });
    }

    // Tăng usedCount atomic — nếu 2 request cùng lúc vượt maxUses thì request sau fail
    const claimed = await db
      .update(inviteCodes)
      .set({ usedCount: sql`${inviteCodes.usedCount} + 1` })
      .where(and(eq(inviteCodes.id, invite.id), lt(inviteCodes.usedCount, invite.maxUses)))
      .returning({ id: inviteCodes.id });
    if (claimed.length === 0) {
      return res.status(403).json({ detail: "Mã mời đã được dùng hết" });
    }

    const passwordHash = await bcrypt.hash(body.password, 12);
    const user = await createUser({ email: body.email, passwordHash, role: "user" });

    // Ghi lại email đã dùng code (best-effort)
    try {
      const fresh = await db.query.inviteCodes.findFirst({ where: eq(inviteCodes.id, invite.id) });
      if (fresh) {
        const usedBy = JSON.parse(fresh.usedByJson) as string[];
        usedBy.push(user.email);
        await db
          .update(inviteCodes)
          .set({ usedByJson: JSON.stringify(usedBy) })
          .where(eq(inviteCodes.id, invite.id));
      }
    } catch (e) {
      logger.warn("Failed to record invite usage", { inviteId: invite.id, error: (e as Error).message });
    }

    logger.info("User registered", { userId: user.id, email: user.email, inviteId: invite.id });
    res.json({ id: user.id, email: user.email, role: user.role });
  } catch (error) {
    logger.error("Registration error", { error, email: req.body?.email });
    throw error;
  }
});

authRouter.post("/login", async (req, res) => {
  try {
    const bodySchema = z.object({
      email: z.string().email(),
      password: z.string().min(1),
    });
    const body = bodySchema.parse(req.body);

    const user = await findUserByEmail(body.email);
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
    logger.error("Login error", { error, email: req.body?.email });
    throw error;
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

