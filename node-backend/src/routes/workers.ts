import { Router } from "express";
import { z } from "zod";

import { requireAuth, type AuthUser } from "../middleware/auth.js";
import { sendApiError } from "../utils/apiError.js";
import logger from "../utils/logger.js";
import { getCredentials } from "./cf.js";
import { cloudflareService } from "../services/cloudflare.js";
import { recordChangeSafe } from "../services/changes.js";

export const workersRouter = Router();

workersRouter.use(requireAuth);

const createRouteSchema = z.object({
  pattern: z.string().trim().min(1).max(500),
  script: z.string().trim().min(1),
});

// Chặn path traversal: param được nội suy thẳng vào path gọi Cloudflare,
// giá trị chứa '/' (từ %2F) có thể đổi endpoint đích.
const SAFE_SEGMENT = /^[A-Za-z0-9._-]{1,256}$/;
function badSegment(res: Parameters<typeof sendApiError>[0], name: string) {
  return res.status(400).json({ detail: `Invalid ${name}` });
}

function credentialSelector(req: { query: Record<string, unknown> }): { accountId?: string; label?: string } {
  return {
    accountId: req.query.accountId as string | undefined,
    label: req.query.label as string | undefined,
  };
}

// GET /api/workers/scripts
workersRouter.get("/scripts", async (req, res) => {
  const auth = req.auth as AuthUser;
  const { accountId, label } = credentialSelector(req);
  try {
    const credentials = await getCredentials(auth.userId, accountId, label);
    const scripts = await cloudflareService.listWorkerScripts(credentials);
    // Subdomain là thông tin phụ: nếu lấy thất bại vẫn trả danh sách scripts.
    let subdomain: string | null = null;
    try {
      subdomain = await cloudflareService.getWorkersSubdomain(credentials);
    } catch (error) {
      logger.warn("Failed to fetch Workers subdomain", {
        userId: auth.userId,
        error: (error as Error).message,
      });
    }
    return res.json({ scripts, subdomain });
  } catch (error) {
    return sendApiError(res, error, {
      status: 500,
      code: "WORKERS_LIST_FAILED",
      detail: "Failed to fetch Worker scripts",
    });
  }
});

// DELETE /api/workers/scripts/:scriptName
workersRouter.delete("/scripts/:scriptName", async (req, res) => {
  const auth = req.auth as AuthUser;
  const { scriptName } = req.params;
  if (!SAFE_SEGMENT.test(scriptName)) return badSegment(res, "script name");
  const { accountId, label } = credentialSelector(req);
  try {
    const credentials = await getCredentials(auth.userId, accountId, label);
    await cloudflareService.deleteWorkerScript(credentials, scriptName);
    await recordChangeSafe({
      ownerId: auth.userId,
      accountId: accountId ?? undefined,
      action: "worker.delete",
      items: [{ resourceType: "worker_script", resourceId: scriptName }],
    });
    return res.status(204).send();
  } catch (error) {
    return sendApiError(res, error, {
      status: 500,
      code: "WORKER_DELETE_FAILED",
      detail: "Failed to delete Worker script",
    });
  }
});

// GET /api/workers/zones/:zoneId/routes
workersRouter.get("/zones/:zoneId/routes", async (req, res) => {
  const auth = req.auth as AuthUser;
  const { zoneId } = req.params;
  if (!SAFE_SEGMENT.test(zoneId)) return badSegment(res, "zone id");
  const { accountId, label } = credentialSelector(req);
  try {
    const credentials = await getCredentials(auth.userId, accountId, label);
    const routes = await cloudflareService.listWorkerRoutes(credentials, zoneId);
    return res.json({ routes });
  } catch (error) {
    return sendApiError(res, error, {
      status: 500,
      code: "WORKER_ROUTES_LIST_FAILED",
      detail: "Failed to fetch Worker routes",
    });
  }
});

// POST /api/workers/zones/:zoneId/routes
workersRouter.post("/zones/:zoneId/routes", async (req, res) => {
  const auth = req.auth as AuthUser;
  const { zoneId } = req.params;
  if (!SAFE_SEGMENT.test(zoneId)) return badSegment(res, "zone id");
  const { accountId, label } = credentialSelector(req);
  try {
    const body = createRouteSchema.parse(req.body);
    const credentials = await getCredentials(auth.userId, accountId, label);
    const route = await cloudflareService.createWorkerRoute(credentials, zoneId, body.pattern, body.script);
    await recordChangeSafe({
      ownerId: auth.userId,
      accountId: accountId ?? undefined,
      zoneId,
      action: "worker.route.create",
      items: [
        {
          resourceType: "worker_route",
          resourceId: route.id || body.pattern,
          after: { pattern: body.pattern, script: body.script },
        },
      ],
    });
    return res.status(201).json(route);
  } catch (error) {
    return sendApiError(res, error, {
      status: 400,
      code: "WORKER_ROUTE_CREATE_FAILED",
      detail: "Failed to create Worker route",
    });
  }
});

// DELETE /api/workers/zones/:zoneId/routes/:routeId
workersRouter.delete("/zones/:zoneId/routes/:routeId", async (req, res) => {
  const auth = req.auth as AuthUser;
  const { zoneId, routeId } = req.params;
  if (!SAFE_SEGMENT.test(zoneId)) return badSegment(res, "zone id");
  if (!SAFE_SEGMENT.test(routeId)) return badSegment(res, "route id");
  const { accountId, label } = credentialSelector(req);
  try {
    const credentials = await getCredentials(auth.userId, accountId, label);
    await cloudflareService.deleteWorkerRoute(credentials, zoneId, routeId);
    await recordChangeSafe({
      ownerId: auth.userId,
      accountId: accountId ?? undefined,
      zoneId,
      action: "worker.route.delete",
      items: [{ resourceType: "worker_route", resourceId: routeId }],
    });
    return res.status(204).send();
  } catch (error) {
    return sendApiError(res, error, {
      status: 500,
      code: "WORKER_ROUTE_DELETE_FAILED",
      detail: "Failed to delete Worker route",
    });
  }
});

// GET /api/workers/scripts/:scriptName/content
workersRouter.get("/scripts/:scriptName/content", async (req, res) => {
  const auth = req.auth as AuthUser;
  const { scriptName } = req.params;
  if (!SAFE_SEGMENT.test(scriptName)) return badSegment(res, "script name");
  const { accountId, label } = credentialSelector(req);
  try {
    const credentials = await getCredentials(auth.userId, accountId, label);
    const content = await cloudflareService.getWorkerScriptContent(credentials, scriptName);
    return res.type("text/plain").send(content);
  } catch (error) {
    return sendApiError(res, error, {
      status: 500,
      code: "WORKER_CONTENT_FETCH_FAILED",
      detail: "Failed to fetch Worker script content",
    });
  }
});

const putSchedulesSchema = z.object({
  schedules: z
    .array(
      z
        .string()
        .trim()
        .min(1)
        .max(100)
        .refine((value) => value.split(/\s+/).length === 5, {
          message: "Cron expression must have exactly 5 space-separated fields",
        }),
    )
    .max(10),
});

// GET /api/workers/scripts/:scriptName/schedules
workersRouter.get("/scripts/:scriptName/schedules", async (req, res) => {
  const auth = req.auth as AuthUser;
  const { scriptName } = req.params;
  if (!SAFE_SEGMENT.test(scriptName)) return badSegment(res, "script name");
  const { accountId, label } = credentialSelector(req);
  try {
    const credentials = await getCredentials(auth.userId, accountId, label);
    const schedules = await cloudflareService.getWorkerSchedules(credentials, scriptName);
    return res.json({ schedules });
  } catch (error) {
    return sendApiError(res, error, {
      status: 500,
      code: "WORKER_SCHEDULES_FETCH_FAILED",
      detail: "Failed to fetch Worker schedules",
    });
  }
});

// PUT /api/workers/scripts/:scriptName/schedules
workersRouter.put("/scripts/:scriptName/schedules", async (req, res) => {
  const auth = req.auth as AuthUser;
  const { scriptName } = req.params;
  if (!SAFE_SEGMENT.test(scriptName)) return badSegment(res, "script name");
  const { accountId, label } = credentialSelector(req);
  try {
    const body = putSchedulesSchema.parse(req.body);
    const credentials = await getCredentials(auth.userId, accountId, label);
    const schedules = await cloudflareService.putWorkerSchedules(credentials, scriptName, body.schedules);
    await recordChangeSafe({
      ownerId: auth.userId,
      accountId: accountId ?? undefined,
      action: "worker.schedules.update",
      items: [{ resourceType: "worker_script", resourceId: scriptName, after: { crons: body.schedules } }],
    });
    return res.json({ schedules });
  } catch (error) {
    return sendApiError(res, error, {
      status: 400,
      code: "WORKER_SCHEDULES_UPDATE_FAILED",
      detail: "Failed to update Worker schedules",
    });
  }
});

// GET /api/workers/scripts/:scriptName/subdomain
workersRouter.get("/scripts/:scriptName/subdomain", async (req, res) => {
  const auth = req.auth as AuthUser;
  const { scriptName } = req.params;
  if (!SAFE_SEGMENT.test(scriptName)) return badSegment(res, "script name");
  const { accountId, label } = credentialSelector(req);
  try {
    const credentials = await getCredentials(auth.userId, accountId, label);
    const setting = await cloudflareService.getWorkerSubdomainSetting(credentials, scriptName);
    return res.json(setting);
  } catch (error) {
    return sendApiError(res, error, {
      status: 500,
      code: "WORKER_SUBDOMAIN_FETCH_FAILED",
      detail: "Failed to fetch Worker subdomain setting",
    });
  }
});

const subdomainSchema = z.object({ enabled: z.boolean() });

// POST /api/workers/scripts/:scriptName/subdomain
workersRouter.post("/scripts/:scriptName/subdomain", async (req, res) => {
  const auth = req.auth as AuthUser;
  const { scriptName } = req.params;
  if (!SAFE_SEGMENT.test(scriptName)) return badSegment(res, "script name");
  const { accountId, label } = credentialSelector(req);
  try {
    const body = subdomainSchema.parse(req.body);
    const credentials = await getCredentials(auth.userId, accountId, label);
    const setting = await cloudflareService.setWorkerSubdomainSetting(credentials, scriptName, body.enabled);
    await recordChangeSafe({
      ownerId: auth.userId,
      accountId: accountId ?? undefined,
      action: "worker.subdomain.update",
      items: [{ resourceType: "worker_script", resourceId: scriptName, after: { enabled: setting.enabled } }],
    });
    return res.json({ enabled: setting.enabled });
  } catch (error) {
    return sendApiError(res, error, {
      status: 400,
      code: "WORKER_SUBDOMAIN_UPDATE_FAILED",
      detail: "Failed to update Worker subdomain setting",
    });
  }
});

// GET /api/workers/scripts/:scriptName/secrets
workersRouter.get("/scripts/:scriptName/secrets", async (req, res) => {
  const auth = req.auth as AuthUser;
  const { scriptName } = req.params;
  if (!SAFE_SEGMENT.test(scriptName)) return badSegment(res, "script name");
  const { accountId, label } = credentialSelector(req);
  try {
    const credentials = await getCredentials(auth.userId, accountId, label);
    const secrets = await cloudflareService.listWorkerSecrets(credentials, scriptName);
    return res.json({ secrets });
  } catch (error) {
    return sendApiError(res, error, {
      status: 500,
      code: "WORKER_SECRETS_LIST_FAILED",
      detail: "Failed to fetch Worker secrets",
    });
  }
});

// Field bắt buộc tên `secretValue` để audit middleware (SENSITIVE_KEYS /secret/i)
// tự redact khỏi audit log. KHÔNG bao giờ log giá trị này.
const putSecretSchema = z.object({
  name: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]{0,63}$/),
  secretValue: z.string().min(1).max(5000),
});

// PUT /api/workers/scripts/:scriptName/secrets
workersRouter.put("/scripts/:scriptName/secrets", async (req, res) => {
  const auth = req.auth as AuthUser;
  const { scriptName } = req.params;
  if (!SAFE_SEGMENT.test(scriptName)) return badSegment(res, "script name");
  const { accountId, label } = credentialSelector(req);
  try {
    const body = putSecretSchema.parse(req.body);
    const credentials = await getCredentials(auth.userId, accountId, label);
    await cloudflareService.putWorkerSecret(credentials, scriptName, body.name, body.secretValue);
    // Chỉ ghi TÊN secret vào history — không bao giờ ghi giá trị.
    await recordChangeSafe({
      ownerId: auth.userId,
      accountId: accountId ?? undefined,
      action: "worker.secret.set",
      items: [{ resourceType: "worker_secret", resourceId: body.name }],
    });
    return res.status(204).send();
  } catch (error) {
    return sendApiError(res, error, {
      status: 400,
      code: "WORKER_SECRET_PUT_FAILED",
      detail: "Failed to save Worker secret",
    });
  }
});

// DELETE /api/workers/scripts/:scriptName/secrets/:secretName
workersRouter.delete("/scripts/:scriptName/secrets/:secretName", async (req, res) => {
  const auth = req.auth as AuthUser;
  const { scriptName, secretName } = req.params;
  if (!SAFE_SEGMENT.test(scriptName)) return badSegment(res, "script name");
  if (!SAFE_SEGMENT.test(secretName)) return badSegment(res, "secret name");
  const { accountId, label } = credentialSelector(req);
  try {
    const credentials = await getCredentials(auth.userId, accountId, label);
    await cloudflareService.deleteWorkerSecret(credentials, scriptName, secretName);
    await recordChangeSafe({
      ownerId: auth.userId,
      accountId: accountId ?? undefined,
      action: "worker.secret.delete",
      items: [{ resourceType: "worker_secret", resourceId: secretName }],
    });
    return res.status(204).send();
  } catch (error) {
    return sendApiError(res, error, {
      status: 500,
      code: "WORKER_SECRET_DELETE_FAILED",
      detail: "Failed to delete Worker secret",
    });
  }
});
