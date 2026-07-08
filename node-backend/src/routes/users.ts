import { Router } from "express";
import { z } from "zod";

import { requireAuth, type AuthUser } from "../middleware/auth.js";
import { prisma } from "../services/db.js";
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
  return prisma.user.count({
    where: { role: "admin", isActive: true, id: { not: excludeUserId } },
  });
}

// GET /api/users — danh sách user kèm thống kê
usersRouter.get("/", async (_req, res) => {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      email: true,
      role: true,
      isActive: true,
      createdAt: true,
      _count: { select: { cfAccounts: true, dnsTemplates: true } },
    },
  });
  res.json(
    users.map((u) => ({
      id: u.id,
      email: u.email,
      role: u.role,
      isActive: u.isActive,
      createdAt: u.createdAt,
      cfAccountCount: u._count.cfAccounts,
      templateCount: u._count.dnsTemplates,
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

  const target = await prisma.user.findUnique({ where: { id: req.params.id } });
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

  const updated = await prisma.user.update({
    where: { id: target.id },
    data: {
      ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
      ...(body.role !== undefined ? { role: body.role } : {}),
    },
    select: { id: true, email: true, role: true, isActive: true },
  });

  logger.info("User updated by admin", { targetId: target.id, changes: body, adminId: auth.userId });
  res.json(updated);
});

// DELETE /api/users/:id — xoá user (cascade xoá CF accounts, domains, templates)
usersRouter.delete("/:id", async (req, res) => {
  const auth = req.auth as AuthUser;

  const target = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!target) return res.status(404).json({ detail: "User not found" });

  if (target.id === auth.userId) {
    return res.status(400).json({ detail: "Không thể tự xoá chính mình" });
  }
  if (target.role === "admin" && target.isActive && (await otherActiveAdminCount(target.id)) === 0) {
    return res.status(400).json({ detail: "Không thể xoá admin cuối cùng" });
  }

  await prisma.$transaction([
    prisma.bulkJob.deleteMany({ where: { ownerId: target.id } }),
    prisma.user.delete({ where: { id: target.id } }), // cascade: cfAccounts → domains, dnsTemplates
  ]);

  logger.info("User deleted by admin", { targetId: target.id, email: target.email, adminId: auth.userId });
  res.json({ ok: true });
});
