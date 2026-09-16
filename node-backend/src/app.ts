import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";

import { env } from "./utils/env.js";
import logger from "./utils/logger.js";
import { auditMiddleware, redactSensitive } from "./middleware/audit.js";
import { apiLimiter, authLimiter, cloudflareLimiter } from "./middleware/rateLimit.js";
import { analyticsRouter } from "./routes/analytics.js";
import { auditRouter } from "./routes/audit.js";
import { authRouter } from "./routes/auth.js";
import { changesRouter } from "./routes/changes.js";
import { cfRouter } from "./routes/cf.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { domainsRouter } from "./routes/domains.js";
import { domainsConfigRouter } from "./routes/domains-config.js";
import { invitesRouter } from "./routes/invites.js";
import { jobsRouter } from "./routes/jobs.js";
import { pagesRouter } from "./routes/pages.js";
import { rulesRouter } from "./routes/rules.js";
import { tagsRouter } from "./routes/tags.js";
import { templatesRouter } from "./routes/templates.js";
import { tunnelsRouter } from "./routes/tunnels.js";
import { turnstileRouter } from "./routes/turnstile.js";
import { usersRouter } from "./routes/users.js";
import { workersRouter } from "./routes/workers.js";

export const app = express();

// Chạy sau Cloudflare Tunnel/nginx → req.ip phải lấy từ X-Forwarded-For,
// nếu không mọi client sẽ chung 1 IP và rate limit + audit log vô nghĩa.
// Chỉ tin đúng số hop cấu hình (không dùng `true` để tránh IP spoofing).
app.set("trust proxy", env.TRUST_PROXY_HOPS);

app.use(
  helmet({
    // API thuần JSON: chặn nhúng chéo và không cho trình duyệt đoán kiểu nội dung.
    crossOriginResourcePolicy: { policy: "same-site" },
    referrerPolicy: { policy: "no-referrer" },
  }),
);
app.use(
  cors({
    origin: env.CORS_ORIGINS,
    credentials: true,
  }),
);
app.use(express.json({ limit: "1mb" }));
// Parser errors can contain raw request fragments/passwords; never log or echo them.
app.use((error: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  const parserError = error as { type?: string; status?: number };
  if (parserError.type && [400, 413, 415].includes(parserError.status ?? 0)) {
    return res.status(parserError.status!).json({
      detail: parserError.status === 413 ? "Request body too large" : "Invalid JSON request body",
    });
  }
  next(error);
});

// Morgan logging với Winston
morgan.token("safe-url", (req) => (req.url || "").split("?")[0]);
app.use(
  // Never retain query credentials, or a Referer copied from a verification URL.
  morgan(':remote-addr :method :safe-url :status :res[content-length] :response-time ms', {
    stream: {
      write: (message: string) => {
        logger.info(message.trim());
      },
    },
  })
);

app.get("/health", (_req, res) => res.json({ status: "healthy" }));

app.use(auditMiddleware);
app.use("/api", apiLimiter);

// Brute-force protection cho các endpoint không cần token.
app.use(["/api/auth/login", "/api/auth/register", "/api/auth/setup"], authLimiter);

app.use("/api/analytics", analyticsRouter);
app.use("/api/audit", auditRouter);
app.use("/api/auth", authRouter);
app.use("/api/changes", changesRouter);
app.use("/api/cf", cloudflareLimiter, cfRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/domains", cloudflareLimiter, domainsRouter);
app.use("/api/invites", invitesRouter);
app.use("/api/jobs", jobsRouter);
app.use("/api/pages", cloudflareLimiter, pagesRouter);
app.use("/api/rules", rulesRouter);
app.use("/api/tags", tagsRouter);
app.use("/api/templates", templatesRouter);
app.use("/api/tunnels", cloudflareLimiter, tunnelsRouter);
app.use("/api/turnstile", cloudflareLimiter, turnstileRouter);
app.use("/api/users", usersRouter);
app.use("/api/workers", cloudflareLimiter, workersRouter);
app.use("/api", domainsConfigRouter);

// Error handler với logging chi tiết
app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const error = err as Error;

  // KHÔNG log body/query thô: chúng chứa password, Global API Key, API token.
  logger.error("Unhandled error", {
    error: error.message,
    stack: error.stack,
    url: req.originalUrl.split("?")[0],
    method: req.method,
    body: redactSensitive(req.body),
    query: redactSensitive(req.query),
    params: redactSensitive(req.params),
    userId: req.auth?.userId,
  });

  // Chỉ lộ chi tiết lỗi khi bật DEBUG_ERRORS tường minh (mặc định an toàn kể cả
  // khi NODE_ENV không được set).
  const verbose = process.env.DEBUG_ERRORS === "true";
  res.status(500).json({
    detail: verbose ? error.message : "Internal server error",
    ...(verbose && { stack: error.stack }),
  });
});

