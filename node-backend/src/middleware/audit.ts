import type { Request, Response, NextFunction } from "express";

import { db } from "../services/db.js";
import { auditLogs } from "../db/schema.js";
import logger from "../utils/logger.js";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// Field nhạy cảm không bao giờ được lưu vào audit log / application log
const SENSITIVE_KEYS =
  /password|passwordhash|apikey|api_key|apitoken|api_token|globalapikey|credential|secret|authorization|token|jwt|cookie/i;

const MAX_META_LENGTH = 2000;

function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[…]";
  if (Array.isArray(value)) {
    // Mảng dài (bulk ops) chỉ lưu vài phần tử đầu + tổng số
    const preview = value.slice(0, 5).map((v) => sanitize(v, depth + 1));
    return value.length > 5 ? [...preview, `… +${value.length - 5} more`] : preview;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEYS.test(k) ? "[REDACTED]" : sanitize(v, depth + 1);
    }
    return out;
  }
  if (typeof value === "string" && value.length > 200) return value.slice(0, 200) + "…";
  return value;
}

/** Dùng chung cho error handler: che mọi field nhạy cảm trước khi ghi log. */
export function redactSensitive(value: unknown): unknown {
  return sanitize(value);
}

/**
 * Ghi audit log cho mọi request mutating vào /api/*.
 * Đăng ký trước các router; ghi khi response kết thúc (fire-and-forget).
 */
export function auditMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!MUTATING_METHODS.has(req.method) || !req.path.startsWith("/api/")) {
    return next();
  }

  res.on("finish", () => {
    let metaJson: string | undefined;
    try {
      if (req.body && typeof req.body === "object" && Object.keys(req.body).length > 0) {
        metaJson = JSON.stringify(sanitize(req.body));
        if (metaJson.length > MAX_META_LENGTH) metaJson = metaJson.slice(0, MAX_META_LENGTH);
      }
    } catch {
      metaJson = undefined;
    }

    // Auth routes chưa có req.auth — lấy email từ body (đã redact password ở meta).
    // Dùng originalUrl vì req.path bị router strip prefix khi 'finish' fire.
    const fullPath = req.originalUrl.split("?")[0];
    const email =
      req.auth?.email ??
      (fullPath.startsWith("/api/auth/") && typeof req.body?.email === "string" ? req.body.email : undefined);

    db.insert(auditLogs)
      .values({
        userId: req.auth?.userId,
        email,
        method: req.method,
        path: fullPath,
        status: res.statusCode,
        metaJson,
        ip: req.ip,
      })
      .catch((error: Error) => {
        logger.warn("Failed to write audit log", { error: error.message, path: req.path });
      });
  });

  return next();
}
