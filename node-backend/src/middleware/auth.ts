import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

import { prisma } from "../services/db.js";
import { env } from "../utils/env.js";

export type AuthUser = { userId: string; email: string; role: string };

declare module "express-serve-static-core" {
  interface Request {
    auth?: AuthUser;
  }
}

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

  // Kiểm tra trạng thái thật trong DB — user bị khoá/xoá hoặc bị đổi role thì token cũ hết tác dụng ngay
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { isActive: true, role: true },
  });
  if (!user) return res.status(401).json({ detail: "Invalid token" });
  if (!user.isActive) return res.status(403).json({ detail: "Tài khoản đã bị khoá" });

  req.auth = { ...payload, role: user.role };
  return next();
}

