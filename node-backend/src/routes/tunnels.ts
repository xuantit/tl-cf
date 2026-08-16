import { Router } from "express";
import { z } from "zod";

import { requireAuth, type AuthUser } from "../middleware/auth.js";
import { sendApiError } from "../utils/apiError.js";
import logger from "../utils/logger.js";
import { getCredentials } from "./cf.js";
import { cloudflareService, type TunnelIngressRule } from "../services/cloudflare.js";
import { recordChangeSafe } from "../services/changes.js";

export const tunnelsRouter = Router();

tunnelsRouter.use(requireAuth);

// Chặn path traversal: tunnelId nội suy thẳng vào path gọi Cloudflare.
tunnelsRouter.param("tunnelId", (req, res, next, value) => {
  if (!/^[A-Za-z0-9-]{1,64}$/.test(value)) {
    return res.status(400).json({ detail: "Invalid tunnel id" });
  }
  return next();
});

const SERVICE_PATTERN = /^(https?|tcp|ssh|rdp|unix|unix\+tls|smb):\/\/.+$|^http_status:[1-5][0-9]{2}$/;

const createTunnelSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

const ingressRuleSchema = z.object({
  hostname: z.string().min(1).max(253).optional(),
  service: z
    .string()
    .regex(SERVICE_PATTERN, "Service must be a valid origin URL (http/https/tcp/ssh/rdp/unix/smb) or http_status:NNN"),
  path: z.string().optional(),
  originRequest: z.record(z.string(), z.unknown()).optional(),
});

const putConfigurationSchema = z.object({
  ingress: z.array(ingressRuleSchema),
});

function credentialSelector(req: { query: Record<string, unknown> }): { accountId?: string; label?: string } {
  return {
    accountId: req.query.accountId as string | undefined,
    label: req.query.label as string | undefined,
  };
}

// GET /api/tunnels
tunnelsRouter.get("/", async (req, res) => {
  const auth = req.auth as AuthUser;
  const { accountId, label } = credentialSelector(req);
  try {
    const credentials = await getCredentials(auth.userId, accountId, label);
    const tunnels = await cloudflareService.listTunnels(credentials);
    return res.json({ tunnels });
  } catch (error) {
    return sendApiError(res, error, {
      status: 500,
      code: "TUNNEL_LIST_FAILED",
      detail: "Failed to fetch tunnels",
    });
  }
});

// POST /api/tunnels
tunnelsRouter.post("/", async (req, res) => {
  const auth = req.auth as AuthUser;
  const { accountId, label } = credentialSelector(req);
  try {
    const body = createTunnelSchema.parse(req.body);
    const credentials = await getCredentials(auth.userId, accountId, label);
    const tunnel = await cloudflareService.createTunnel(credentials, body.name);
    await recordChangeSafe({
      ownerId: auth.userId,
      accountId: accountId ?? undefined,
      action: "tunnel.create",
      items: [{ resourceType: "tunnel", resourceId: tunnel.id, after: { name: tunnel.name } }],
    });
    return res.status(201).json(tunnel);
  } catch (error) {
    return sendApiError(res, error, {
      status: 400,
      code: "TUNNEL_CREATE_FAILED",
      detail: "Failed to create tunnel",
    });
  }
});

// DELETE /api/tunnels/:tunnelId
tunnelsRouter.delete("/:tunnelId", async (req, res) => {
  const auth = req.auth as AuthUser;
  const { tunnelId } = req.params;
  const { accountId, label } = credentialSelector(req);
  try {
    const credentials = await getCredentials(auth.userId, accountId, label);
    await cloudflareService.deleteTunnel(credentials, tunnelId);
    await recordChangeSafe({
      ownerId: auth.userId,
      accountId: accountId ?? undefined,
      action: "tunnel.delete",
      items: [{ resourceType: "tunnel", resourceId: tunnelId }],
    });
    return res.status(204).send();
  } catch (error) {
    return sendApiError(res, error, {
      status: 500,
      code: "TUNNEL_DELETE_FAILED",
      detail: "Failed to delete tunnel",
    });
  }
});

// GET /api/tunnels/:tunnelId/configurations
tunnelsRouter.get("/:tunnelId/configurations", async (req, res) => {
  const auth = req.auth as AuthUser;
  const { tunnelId } = req.params;
  const { accountId, label } = credentialSelector(req);
  try {
    const credentials = await getCredentials(auth.userId, accountId, label);
    const config = await cloudflareService.getTunnelConfiguration(credentials, tunnelId);
    return res.json(config);
  } catch (error) {
    return sendApiError(res, error, {
      status: 500,
      code: "TUNNEL_CONFIG_FETCH_FAILED",
      detail: "Failed to fetch tunnel configuration",
    });
  }
});

// PUT /api/tunnels/:tunnelId/configurations
tunnelsRouter.put("/:tunnelId/configurations", async (req, res) => {
  const auth = req.auth as AuthUser;
  const { tunnelId } = req.params;
  const { accountId, label } = credentialSelector(req);
  try {
    const body = putConfigurationSchema.parse(req.body);
    // Cloudflare yêu cầu rule CUỐI CÙNG là catch-all (không hostname).
    // Chuẩn hoá: các rule có hostname giữ nguyên thứ tự, catch-all (lấy cái
    // đầu tiên nếu client gửi) luôn được đưa xuống cuối; thiếu thì tự thêm 404.
    const hostnameRules = body.ingress.filter((rule) => !!rule.hostname);
    const catchAll = body.ingress.find((rule) => !rule.hostname) ?? { service: "http_status:404" };
    const ingress: TunnelIngressRule[] = [...hostnameRules, catchAll];
    const credentials = await getCredentials(auth.userId, accountId, label);
    const config = await cloudflareService.putTunnelConfiguration(credentials, tunnelId, ingress);
    await recordChangeSafe({
      ownerId: auth.userId,
      accountId: accountId ?? undefined,
      action: "tunnel.config.update",
      items: [
        {
          resourceType: "tunnel",
          resourceId: tunnelId,
          after: { hostnames: hostnameRules.map((rule) => rule.hostname).filter((h): h is string => !!h) },
        },
      ],
    });
    return res.json(config);
  } catch (error) {
    return sendApiError(res, error, {
      status: 400,
      code: "TUNNEL_CONFIG_UPDATE_FAILED",
      detail: "Failed to update tunnel configuration",
    });
  }
});

// GET /api/tunnels/:tunnelId/connections
tunnelsRouter.get("/:tunnelId/connections", async (req, res) => {
  const auth = req.auth as AuthUser;
  const { tunnelId } = req.params;
  const { accountId, label } = credentialSelector(req);
  try {
    const credentials = await getCredentials(auth.userId, accountId, label);
    const connections = await cloudflareService.listTunnelConnections(credentials, tunnelId);
    return res.json({ connections });
  } catch (error) {
    return sendApiError(res, error, {
      status: 500,
      code: "TUNNEL_CONNECTIONS_FETCH_FAILED",
      detail: "Failed to fetch tunnel connections",
    });
  }
});

// DELETE /api/tunnels/:tunnelId/connections
tunnelsRouter.delete("/:tunnelId/connections", async (req, res) => {
  const auth = req.auth as AuthUser;
  const { tunnelId } = req.params;
  const { accountId, label } = credentialSelector(req);
  try {
    const credentials = await getCredentials(auth.userId, accountId, label);
    await cloudflareService.deleteTunnelConnections(credentials, tunnelId);
    await recordChangeSafe({
      ownerId: auth.userId,
      accountId: accountId ?? undefined,
      action: "tunnel.connections.drop",
      items: [{ resourceType: "tunnel", resourceId: tunnelId }],
    });
    return res.status(204).send();
  } catch (error) {
    return sendApiError(res, error, {
      status: 500,
      code: "TUNNEL_CONNECTIONS_DELETE_FAILED",
      detail: "Failed to delete tunnel connections",
    });
  }
});

// POST /api/tunnels/:tunnelId/token/reveal
// Dùng POST (không phải GET) để audit middleware ghi lại hành động reveal;
// response body không bị audit nên token không lọt vào log.
tunnelsRouter.post("/:tunnelId/token/reveal", async (req, res) => {
  const auth = req.auth as AuthUser;
  const { tunnelId } = req.params;
  const { accountId, label } = credentialSelector(req);
  try {
    const credentials = await getCredentials(auth.userId, accountId, label);
    const token = await cloudflareService.getTunnelToken(credentials, tunnelId);
    logger.info("Tunnel token revealed", { userId: auth.userId, tunnelId });
    return res.json({ token });
  } catch (error) {
    return sendApiError(res, error, {
      status: 500,
      code: "TUNNEL_TOKEN_REVEAL_FAILED",
      detail: "Failed to fetch tunnel token",
    });
  }
});
