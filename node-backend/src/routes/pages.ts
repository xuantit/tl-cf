import { Router } from "express";
import { z } from "zod";

import { requireAuth, type AuthUser } from "../middleware/auth.js";
import { sendApiError } from "../utils/apiError.js";
import { getCredentials } from "./cf.js";
import { cloudflareService } from "../services/cloudflare.js";

export const pagesRouter = Router();

pagesRouter.use(requireAuth);

// Chặn path traversal: param nội suy thẳng vào path gọi Cloudflare.
const SAFE_SEGMENT = /^[A-Za-z0-9._-]{1,256}$/;
const HOSTNAME_SEGMENT = /^[A-Za-z0-9.-]{1,253}$/;

pagesRouter.param("projectName", (req, res, next, value) => {
  if (!SAFE_SEGMENT.test(value)) return res.status(400).json({ detail: "Invalid project name" });
  return next();
});
pagesRouter.param("deploymentId", (req, res, next, value) => {
  if (!SAFE_SEGMENT.test(value)) return res.status(400).json({ detail: "Invalid deployment id" });
  return next();
});
pagesRouter.param("domain", (req, res, next, value) => {
  if (!HOSTNAME_SEGMENT.test(value)) return res.status(400).json({ detail: "Invalid domain" });
  return next();
});

function credentialSelector(req: { query: Record<string, unknown> }): { accountId?: string; label?: string } {
  return {
    accountId: req.query.accountId as string | undefined,
    label: req.query.label as string | undefined,
  };
}

// GET /api/pages/projects
pagesRouter.get("/projects", async (req, res) => {
  const auth = req.auth as AuthUser;
  const { accountId, label } = credentialSelector(req);
  try {
    const credentials = await getCredentials(auth.userId, accountId, label);
    const projects = await cloudflareService.listPagesProjects(credentials);
    return res.json({ projects });
  } catch (error) {
    return sendApiError(res, error, {
      status: 500,
      code: "PAGES_LIST_FAILED",
      detail: "Failed to fetch Pages projects",
    });
  }
});

// GET /api/pages/projects/:projectName/deployments
pagesRouter.get("/projects/:projectName/deployments", async (req, res) => {
  const auth = req.auth as AuthUser;
  const { projectName } = req.params;
  const { accountId, label } = credentialSelector(req);
  const rawPage = Number.parseInt(String(req.query.page ?? "1"), 10);
  const page = Number.isFinite(rawPage) ? Math.min(Math.max(rawPage, 1), 1000) : 1;
  try {
    const credentials = await getCredentials(auth.userId, accountId, label);
    const result = await cloudflareService.listPagesDeployments(credentials, projectName, page);
    return res.json(result);
  } catch (error) {
    return sendApiError(res, error, {
      status: 500,
      code: "PAGES_DEPLOYMENTS_LIST_FAILED",
      detail: "Failed to fetch Pages deployments",
    });
  }
});

// POST /api/pages/projects/:projectName/deployments/:deploymentId/rollback
pagesRouter.post("/projects/:projectName/deployments/:deploymentId/rollback", async (req, res) => {
  const auth = req.auth as AuthUser;
  const { projectName, deploymentId } = req.params;
  const { accountId, label } = credentialSelector(req);
  try {
    const credentials = await getCredentials(auth.userId, accountId, label);
    const deployment = await cloudflareService.rollbackPagesDeployment(credentials, projectName, deploymentId);
    return res.json(deployment);
  } catch (error) {
    return sendApiError(res, error, {
      status: 500,
      code: "PAGES_ROLLBACK_FAILED",
      detail: "Failed to rollback Pages deployment",
    });
  }
});

// GET /api/pages/projects/:projectName/domains
pagesRouter.get("/projects/:projectName/domains", async (req, res) => {
  const auth = req.auth as AuthUser;
  const { projectName } = req.params;
  const { accountId, label } = credentialSelector(req);
  try {
    const credentials = await getCredentials(auth.userId, accountId, label);
    const domains = await cloudflareService.listPagesDomains(credentials, projectName);
    return res.json({ domains });
  } catch (error) {
    return sendApiError(res, error, {
      status: 500,
      code: "PAGES_DOMAINS_LIST_FAILED",
      detail: "Failed to fetch Pages domains",
    });
  }
});

// GET /api/pages/projects/:projectName
pagesRouter.get("/projects/:projectName", async (req, res) => {
  const auth = req.auth as AuthUser;
  const { projectName } = req.params;
  const { accountId, label } = credentialSelector(req);
  try {
    const credentials = await getCredentials(auth.userId, accountId, label);
    const project = await cloudflareService.getPagesProject(credentials, projectName);
    return res.json(project);
  } catch (error) {
    return sendApiError(res, error, {
      status: 500,
      code: "PAGES_PROJECT_FETCH_FAILED",
      detail: "Failed to fetch Pages project",
    });
  }
});

const ENV_KEY_REGEX = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;

// Client gửi secretValue (thay vì value) cho biến secret để audit middleware
// (SENSITIVE_KEYS /secret/i) redact giá trị khỏi audit log.
const envVarsSchema = z.object({
  envVars: z
    .array(
      z
        .object({
          key: z.string().regex(ENV_KEY_REGEX),
          value: z.string().max(5000).optional(),
          secretValue: z.string().max(5000).optional(),
          secret: z.boolean(),
        })
        .refine((item) => (item.secret ? typeof item.secretValue === "string" && item.secretValue.length > 0 : typeof item.value === "string"), {
          message: "Secret vars require secretValue; plain vars require value",
        }),
    )
    .max(100),
  removedKeys: z.array(z.string().regex(ENV_KEY_REGEX)).max(100).default([]),
});

// PATCH /api/pages/projects/:projectName/env
pagesRouter.patch("/projects/:projectName/env", async (req, res) => {
  const auth = req.auth as AuthUser;
  const { projectName } = req.params;
  const { accountId, label } = credentialSelector(req);
  try {
    const body = envVarsSchema.parse(req.body);
    const envVars = body.envVars.map((item) => ({
      key: item.key,
      value: item.secret ? (item.secretValue ?? "") : (item.value ?? ""),
      secret: item.secret,
    }));
    const credentials = await getCredentials(auth.userId, accountId, label);
    await cloudflareService.patchPagesEnvVars(credentials, projectName, envVars, body.removedKeys);
    return res.json({ ok: true });
  } catch (error) {
    return sendApiError(res, error, {
      status: 400,
      code: "PAGES_ENV_UPDATE_FAILED",
      detail: "Failed to update Pages environment variables",
    });
  }
});

// POST /api/pages/projects/:projectName/deployments/:deploymentId/retry
pagesRouter.post("/projects/:projectName/deployments/:deploymentId/retry", async (req, res) => {
  const auth = req.auth as AuthUser;
  const { projectName, deploymentId } = req.params;
  const { accountId, label } = credentialSelector(req);
  try {
    const credentials = await getCredentials(auth.userId, accountId, label);
    const deployment = await cloudflareService.retryPagesDeployment(credentials, projectName, deploymentId);
    return res.json(deployment);
  } catch (error) {
    return sendApiError(res, error, {
      status: 500,
      code: "PAGES_RETRY_FAILED",
      detail: "Failed to retry Pages deployment",
    });
  }
});

// DELETE /api/pages/projects/:projectName/deployments — deletes all deployments, live production last
pagesRouter.delete("/projects/:projectName/deployments", async (req, res) => {
  const auth = req.auth as AuthUser;
  const { projectName } = req.params;
  const { accountId, label } = credentialSelector(req);
  try {
    const credentials = await getCredentials(auth.userId, accountId, label);
    const result = await cloudflareService.deleteAllPagesDeployments(credentials, projectName);
    return res.json(result);
  } catch (error) {
    return sendApiError(res, error, {
      status: 500,
      code: "PAGES_DEPLOYMENTS_DELETE_ALL_FAILED",
      detail: "Failed to delete Pages deployments",
    });
  }
});

// DELETE /api/pages/projects/:projectName — deletes the whole Pages project
pagesRouter.delete("/projects/:projectName", async (req, res) => {
  const auth = req.auth as AuthUser;
  const { projectName } = req.params;
  const { accountId, label } = credentialSelector(req);
  try {
    const credentials = await getCredentials(auth.userId, accountId, label);
    await cloudflareService.deletePagesProject(credentials, projectName);
    return res.status(204).send();
  } catch (error) {
    return sendApiError(res, error, {
      status: 500,
      code: "PAGES_PROJECT_DELETE_FAILED",
      detail: "Failed to delete Pages project",
    });
  }
});

// DELETE /api/pages/projects/:projectName/deployments/:deploymentId
pagesRouter.delete("/projects/:projectName/deployments/:deploymentId", async (req, res) => {
  const auth = req.auth as AuthUser;
  const { projectName, deploymentId } = req.params;
  const { accountId, label } = credentialSelector(req);
  try {
    const credentials = await getCredentials(auth.userId, accountId, label);
    await cloudflareService.deletePagesDeployment(credentials, projectName, deploymentId);
    return res.status(204).send();
  } catch (error) {
    return sendApiError(res, error, {
      status: 500,
      code: "PAGES_DEPLOYMENT_DELETE_FAILED",
      detail: "Failed to delete Pages deployment",
    });
  }
});

const addDomainSchema = z.object({
  name: z.string().regex(HOSTNAME_SEGMENT),
});

// POST /api/pages/projects/:projectName/domains
pagesRouter.post("/projects/:projectName/domains", async (req, res) => {
  const auth = req.auth as AuthUser;
  const { projectName } = req.params;
  const { accountId, label } = credentialSelector(req);
  try {
    const body = addDomainSchema.parse(req.body);
    const credentials = await getCredentials(auth.userId, accountId, label);
    const domain = await cloudflareService.addPagesDomain(credentials, projectName, body.name);
    return res.status(201).json(domain);
  } catch (error) {
    return sendApiError(res, error, {
      status: 400,
      code: "PAGES_DOMAIN_ADD_FAILED",
      detail: "Failed to add Pages domain",
    });
  }
});

// DELETE /api/pages/projects/:projectName/domains/:domain
pagesRouter.delete("/projects/:projectName/domains/:domain", async (req, res) => {
  const auth = req.auth as AuthUser;
  const { projectName, domain } = req.params;
  const { accountId, label } = credentialSelector(req);
  try {
    const credentials = await getCredentials(auth.userId, accountId, label);
    await cloudflareService.deletePagesDomain(credentials, projectName, domain);
    return res.status(204).send();
  } catch (error) {
    return sendApiError(res, error, {
      status: 500,
      code: "PAGES_DOMAIN_DELETE_FAILED",
      detail: "Failed to delete Pages domain",
    });
  }
});
