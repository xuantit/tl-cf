import { Router } from "express";
import { z } from "zod";
import { and, asc, count, eq, ne } from "drizzle-orm";

import { requireAuth, type AuthUser } from "../middleware/auth.js";
import { db } from "../services/db.js";
import { bulkJobs, users } from "../db/schema.js";
import logger from "../utils/logger.js";

export const usersRouter = Router();

usersRouter.use(requireAuth);

// Toàn bộ router chỉ dành cho admin
usersRouter.use((req, res, next) => {
  const auth = req.auth as AuthUser;
  if (auth.role !== "admin") {
    return res.status(403).json({ detail: "Admin role required" });
  }
  return next();
});

/** Đếm số admin đang active, trừ user chỉ định (để chặn khoá/xoá admin cuối cùng) */
async function otherActiveAdminCount(excludeUserId: string): Promise<number> {
  const [{ value }] = await db
    .select({ value: count() })
    .from(users)
    .where(and(eq(users.role, "admin"), eq(users.isActive, true), ne(users.id, excludeUserId)));
  return value;
}

// GET /api/users — danh sách user kèm thống kê
usersRouter.get("/", async (_req, res) => {
  const rows = await db.query.users.findMany({
    orderBy: asc(users.createdAt),
    columns: { id: true, email: true, role: true, isActive: true, createdAt: true },
    with: {
      cfAccounts: { columns: { id: true } },
      dnsTemplates: { columns: { id: true } },
    },
  });
  res.json(
    rows.map((u) => ({
      id: u.id,
      email: u.email,
      role: u.role,
      isActive: u.isActive,
      createdAt: u.createdAt,
      cfAccountCount: u.cfAccounts.length,
      templateCount: u.dnsTemplates.length,
    })),
  );
});

// PATCH /api/users/:id — khoá/mở khoá hoặc đổi role
usersRouter.patch("/:id", async (req, res) => {
  const auth = req.auth as AuthUser;
  const bodySchema = z.object({
    isActive: z.boolean().optional(),
    role: z.enum(["user", "admin"]).optional(),
  });
  const body = bodySchema.parse(req.body ?? {});

  const target = await db.query.users.findFirst({ where: eq(users.id, req.params.id) });
  if (!target) return res.status(404).json({ detail: "User not found" });

  if (target.id === auth.userId && (body.isActive === false || body.role === "user")) {
    return res.status(400).json({ detail: "Không thể tự khoá hoặc tự hạ quyền chính mình" });
  }

  // Chặn khoá/hạ quyền admin active cuối cùng
  const losesAdmin =
    target.role === "admin" &&
    target.isActive &&
    (body.isActive === false || body.role === "user");
  if (losesAdmin && (await otherActiveAdminCount(target.id)) === 0) {
    return res.status(400).json({ detail: "Không thể khoá/hạ quyền admin cuối cùng" });
  }

  const [updated] = await db
    .update(users)
    .set({
      ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
      ...(body.role !== undefined ? { role: body.role } : {}),
    })
    .where(eq(users.id, target.id))
    .returning({ id: users.id, email: users.email, role: users.role, isActive: users.isActive });

  logger.info("User updated by admin", { targetId: target.id, changes: body, adminId: auth.userId });
  res.json(updated);
});

// DELETE /api/users/:id — xoá user (cascade xoá CF accounts, domains, templates)
usersRouter.delete("/:id", async (req, res) => {
  const auth = req.auth as AuthUser;

  const target = await db.query.users.findFirst({ where: eq(users.id, req.params.id) });
  if (!target) return res.status(404).json({ detail: "User not found" });

  if (target.id === auth.userId) {
    return res.status(400).json({ detail: "Không thể tự xoá chính mình" });
  }
  if (target.role === "admin" && target.isActive && (await otherActiveAdminCount(target.id)) === 0) {
    return res.status(400).json({ detail: "Không thể xoá admin cuối cùng" });
  }

  await db.transaction(async (tx) => {
    await tx.delete(bulkJobs).where(eq(bulkJobs.ownerId, target.id));
    await tx.delete(users).where(eq(users.id, target.id)); // cascade: cfAccounts → domains, dnsTemplates
  });

  logger.info("User deleted by admin", { targetId: target.id, email: target.email, adminId: auth.userId });
  res.json({ ok: true });
});
