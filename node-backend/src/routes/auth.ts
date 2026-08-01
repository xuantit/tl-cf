import { randomUUID } from "node:crypto";

import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";

import { findUserByEmail, createUser } from "../models/userJson.js";
import { requireAuth } from "../middleware/auth.js";
import { prisma } from "../services/db.js";
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

    const invite = await prisma.inviteCode.findUnique({ where: { code: body.inviteCode.trim() } });
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
    const claimed = await prisma.inviteCode.updateMany({
      where: { id: invite.id, usedCount: { lt: invite.maxUses } },
      data: { usedCount: { increment: 1 } },
    });
    if (claimed.count === 0) {
      return res.status(403).json({ detail: "Mã mời đã được dùng hết" });
    }

    const passwordHash = await bcrypt.hash(body.password, 12);
    const user = await createUser({ email: body.email, passwordHash, role: "user" });

    // Ghi lại email đã dùng code (best-effort)
    try {
      const fresh = await prisma.inviteCode.findUnique({ where: { id: invite.id } });
      if (fresh) {
        const usedBy = JSON.parse(fresh.usedByJson) as string[];
        usedBy.push(user.email);
        await prisma.inviteCode.update({
          where: { id: invite.id },
          data: { usedByJson: JSON.stringify(usedBy) },
        });
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

    const fresh = await prisma.user.findUnique({
      where: { id: user.id },
      select: { isActive: true, role: true, displayName: true },
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

    await prisma.session.create({
      data: {
        userId: user.id,
        jti,
        userAgent: req.headers["user-agent"]?.slice(0, 200) ?? null,
        ip: req.ip ?? null,
      },
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
  const user = await prisma.user.findUnique({
    where: { id: req.auth!.userId },
    select: { id: true, email: true, role: true, displayName: true, createdAt: true },
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
  const user = await prisma.user.update({
    where: { id: req.auth!.userId },
    data: { displayName },
    select: { id: true, email: true, role: true, displayName: true, createdAt: true },
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

authRouter.post("/change-password", requireAuth, async (req, res) => {
  const bodySchema = z.object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z.string().min(8, "Mật khẩu mới phải có ít nhất 8 ký tự"),
  });
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ detail: parsed.error.issues[0]?.message || "Invalid body" });
  }

  const user = await prisma.user.findUnique({
    where: { id: req.auth!.userId },
    select: { id: true, passwordHash: true },
  });
  if (!user) return res.status(401).json({ detail: "Invalid token" });

  const ok = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
  if (!ok) {
    logger.warn("Change password with wrong current password", { userId: user.id });
    return res.status(400).json({ detail: "Mật khẩu hiện tại không đúng" });
  }

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });

  logger.info("User changed password", { userId: user.id });
  res.json({ ok: true });
});

authRouter.get("/sessions", requireAuth, async (req, res) => {
  const sessions = await prisma.session.findMany({
    where: { userId: req.auth!.userId, revokedAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true, jti: true, userAgent: true, ip: true, createdAt: true, lastSeenAt: true },
  });

  res.json(
    sessions.map((s) => ({
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
  const result = await prisma.session.updateMany({
    where: {
      userId: req.auth!.userId,
      revokedAt: null,
      ...(req.auth!.jti ? { jti: { not: req.auth!.jti } } : {}),
    },
    data: { revokedAt: new Date() },
  });

  logger.info("User revoked all other sessions", { userId: req.auth!.userId, revoked: result.count });
  res.json({ revoked: result.count });
});

authRouter.delete("/sessions/:id", requireAuth, async (req, res) => {
  const sessionId = String(req.params.id);
  const result = await prisma.session.updateMany({
    where: { id: sessionId, userId: req.auth!.userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (result.count === 0) {
    return res.status(404).json({ detail: "Không tìm thấy phiên đăng nhập" });
  }

  logger.info("User revoked session", { userId: req.auth!.userId, sessionId });
  res.json({ ok: true });
});

