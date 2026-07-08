import { Router } from "express";
import { z } from "zod";

import { requireAuth, type AuthUser } from "../middleware/auth.js";
import { prisma } from "../services/db.js";

export const auditRouter = Router();

auditRouter.use(requireAuth);

// Chỉ admin xem được audit log
auditRouter.use((req, res, next) => {
  const auth = req.auth as AuthUser;
  if (auth.role !== "admin") {
    return res.status(403).json({ detail: "Admin role required" });
  }
  return next();
});

// GET /api/audit?limit=&userId=&path=&page=
auditRouter.get("/", async (req, res) => {
  const querySchema = z.object({
    limit: z.coerce.number().int().min(1).max(200).default(50),
    page: z.coerce.number().int().min(1).default(1),
    userId: z.string().optional(),
    path: z.string().optional(),
  });
  const q = querySchema.parse(req.query);

  const where = {
    ...(q.userId ? { userId: q.userId } : {}),
    ...(q.path ? { path: { contains: q.path } } : {}),
  };

  const [total, logs] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (q.page - 1) * q.limit,
      take: q.limit,
    }),
  ]);

  res.json({
    total,
    page: q.page,
    limit: q.limit,
    items: logs.map((l) => ({
      id: l.id,
      userId: l.userId,
      email: l.email,
      method: l.method,
      path: l.path,
      status: l.status,
      meta: l.metaJson ? safeParse(l.metaJson) : null,
      ip: l.ip,
      createdAt: l.createdAt,
    })),
  });
});

function safeParse(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return json;
  }
}
