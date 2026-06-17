import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

import { env } from "../utils/env.js";

export type AuthUser = { userId: string; email: string; role: string };

declare module "express-serve-static-core" {
  interface Request {
    auth?: AuthUser;
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;
  if (!token) return res.status(401).json({ detail: "Missing token" });

  try {
    const jwtSecret = env.JWT_SECRET || "default-jwt-secret-change-in-production";
    const payload = jwt.verify(token, jwtSecret) as AuthUser;
    req.auth = payload;
    return next();
  } catch {
    return res.status(401).json({ detail: "Invalid token" });
  }
}

