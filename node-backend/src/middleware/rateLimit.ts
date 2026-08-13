import rateLimit, { ipKeyGenerator, type Options } from "express-rate-limit";
import type { Request, Response } from "express";

import { env } from "../utils/env.js";
import logger from "../utils/logger.js";

/**
 * Chống brute-force / lạm dụng API.
 *
 * Lưu ý: giới hạn lưu trong RAM nên chỉ đúng khi chạy 1 process (PM2 fork mode,
 * xem ecosystem.config.cjs). Nếu scale nhiều instance phải chuyển sang store Redis.
 */

/**
 * Tắt mặc định khi chạy vitest để không làm hỏng các test khác.
 * Đặt RATE_LIMIT_DISABLED=false để ép bật (test bảo mật dùng cách này).
 */
function limitsDisabled(): boolean {
  if (process.env.RATE_LIMIT_DISABLED === "false") return false;
  return env.RATE_LIMIT_DISABLED || process.env.NODE_ENV === "test";
}

function tooMany(res: Response, detail: string) {
  return res.status(429).json({ code: "RATE_LIMITED", detail, retryable: true });
}

/** Ưu tiên userId (token hợp lệ) để 1 user không bị hàng xóm NAT làm ảnh hưởng. */
function userOrIpKey(req: Request): string {
  return req.auth?.userId ?? ipKeyGenerator(req.ip ?? "unknown");
}

function build(options: Partial<Options> & { windowMs: number; limit: number; detail: string }) {
  const { detail, ...rest } = options;
  return rateLimit({
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skip: () => limitsDisabled(),
    handler: (req, res) => {
      logger.warn("Rate limit exceeded", {
        path: req.originalUrl.split("?")[0],
        ip: req.ip,
        userId: req.auth?.userId,
      });
      tooMany(res, detail);
    },
    ...rest,
  });
}

/** Đăng nhập / đăng ký / setup: rất chặt, tính theo IP. */
export const authLimiter = build({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  detail: "Quá nhiều lần thử. Vui lòng đợi 15 phút rồi thử lại.",
});

/** Đổi mật khẩu: chặn dò mật khẩu hiện tại bằng token bị đánh cắp. */
export const sensitiveLimiter = build({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  keyGenerator: userOrIpKey,
  detail: "Quá nhiều yêu cầu nhạy cảm. Vui lòng thử lại sau.",
});

/** Toàn bộ /api: chặn scraping / vét cạn tài nguyên Cloudflare qua backend. */
export const apiLimiter = build({
  windowMs: 60 * 1000,
  limit: 300,
  keyGenerator: userOrIpKey,
  detail: "Quá nhiều request. Vui lòng chậm lại.",
});

/**
 * Endpoint gọi thẳng Cloudflare (mỗi request = nhiều lần đọc/ghi CF).
 * Giữ hạn mức thấp để không bị CF rate-limit hoặc bị dùng làm bàn đạp.
 */
export const cloudflareLimiter = build({
  windowMs: 60 * 1000,
  limit: 60,
  keyGenerator: userOrIpKey,
  detail: "Quá nhiều thao tác Cloudflare. Vui lòng thử lại sau ít giây.",
});
