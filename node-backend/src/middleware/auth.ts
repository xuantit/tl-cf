import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { eq } from "drizzle-orm";

import { db } from "../services/db.js";
import { sessions, users } from "../db/schema.js";
import { env } from "../utils/env.js";
import logger from "../utils/logger.js";

export type AuthUser = { userId: string; email: string; role: string; jti?: string };

declare module "express-serve-static-core" {
  interface Request {
    auth?: AuthUser;
  }
}

const LAST_SEEN_THROTTLE_MS = 5 * 60 * 1000;

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;
  if (!token) return res.status(401).json({ detail: "Missing token" });

  let payload: AuthUser;
  try {
    const jwtSecret = env.JWT_SECRET || "default-jwt-secret-change-in-production";
    payload = jwt.verify(token, jwtSecret) as AuthUser;
  } catch {
    return res.status(401).json({ detail: "Invalid token" });
  }

  // Kiểm tra trạng thái thật trong DB — user bị khoá/xoá hoặc bị đổi role thì token cũ hết tác dụng ngay.
  // Token có jti (phát hành sau B5) → check thêm session chưa bị revoke. Token cũ không jti vẫn hợp lệ.
  const [user, session] = await Promise.all([
    db.query.users.findFirst({
      where: eq(users.id, payload.userId),
      columns: { isActive: true, role: true },
    }),
    payload.jti
      ? db.query.sessions.findFirst({
          where: eq(sessions.jti, payload.jti),
          columns: { id: true, revokedAt: true, lastSeenAt: true },
        })
      : Promise.resolve(null),
  ]);
  if (!user) return res.status(401).json({ detail: "Invalid token" });
  if (!user.isActive) return res.status(403).json({ detail: "Tài khoản đã bị khoá" });

  if (payload.jti) {
    if (!session || session.revokedAt) {
      return res.status(401).json({ detail: "Phiên đăng nhập đã bị thu hồi" });
    }
    // Cập nhật lastSeenAt throttled (fire-and-forget, không chặn request)
    if (Date.now() - session.lastSeenAt.getTime() > LAST_SEEN_THROTTLE_MS) {
      db.update(sessions)
        .set({ lastSeenAt: new Date() })
        .where(eq(sessions.id, session.id))
        .catch((e) => logger.warn("Failed to update session lastSeenAt", { error: (e as Error).message }));
    }
  }

  req.auth = { ...payload, role: user.role };
  return next();
}

