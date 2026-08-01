import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";

import { env } from "./utils/env.js";
import logger from "./utils/logger.js";
import { auditMiddleware } from "./middleware/audit.js";
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
import { rulesRouter } from "./routes/rules.js";
import { tagsRouter } from "./routes/tags.js";
import { templatesRouter } from "./routes/templates.js";
import { usersRouter } from "./routes/users.js";

export const app = express();

app.use(helmet());
app.use(
  cors({
    origin: env.CORS_ORIGINS,
    credentials: true,
  }),
);
app.use(express.json({ limit: "1mb" }));

// Morgan logging với Winston
app.use(
  morgan("combined", {
    stream: {
      write: (message: string) => {
        logger.info(message.trim());
      },
    },
  })
);

app.get("/health", (_req, res) => res.json({ status: "healthy" }));

app.use(auditMiddleware);

app.use("/api/analytics", analyticsRouter);
app.use("/api/audit", auditRouter);
app.use("/api/auth", authRouter);
app.use("/api/changes", changesRouter);
app.use("/api/cf", cfRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/domains", domainsRouter);
app.use("/api/invites", invitesRouter);
app.use("/api/jobs", jobsRouter);
app.use("/api/rules", rulesRouter);
app.use("/api/tags", tagsRouter);
app.use("/api/templates", templatesRouter);
app.use("/api/users", usersRouter);
app.use("/api", domainsConfigRouter);

// Error handler với logging chi tiết
app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const error = err as Error;

  logger.error("Unhandled error", {
    error: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    body: req.body,
    query: req.query,
    params: req.params,
  });

  res.status(500).json({
    detail: process.env.NODE_ENV === "production" ? "Internal server error" : error.message,
    ...(process.env.NODE_ENV !== "production" && { stack: error.stack }),
  });
});

