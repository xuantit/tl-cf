import { Router } from "express";
import { z } from "zod";

import { requireAuth, type AuthUser } from "../middleware/auth.js";
import {
  cloudflareService,
  type CloudflareCredentials,
} from "../services/cloudflare.js";
import { decrypt, encrypt } from "../utils/encryption.js";
import { sendApiError, apiErrorEnvelope } from "../utils/apiError.js";
import { featureFromCloudflareError, type FeatureState } from "../utils/capabilities.js";
import { configService } from "../services/configService.js";
import logger from "../utils/logger.js";

export const cfRouter = Router();

cfRouter.use(requireAuth);

// Zod schema shared by credential/account create endpoints
const credentialInputSchema = z
  .object({
    authType: z.enum(["globalApiKey", "apiToken"]).optional().default("globalApiKey"),
    label: z.string().optional(),
    email: z.string().email().optional(),
    globalApiKey: z.string().min(1).optional(),
    apiToken: z.string().min(1).optional(),
  })
  .refine(
    (data) =>
      data.authType === "apiToken"
        ? !!data.apiToken
        : !!data.email && !!data.globalApiKey,
    {
      message:
        "apiToken is required for authType 'apiToken'; email and globalApiKey are required for 'globalApiKey'",
    }
  );

function buildCredentials(input: {
  authType?: "globalApiKey" | "apiToken";
  email?: string;
  globalApiKey?: string;
  apiToken?: string;
}): CloudflareCredentials {
  if (input.authType === "apiToken") {
    return { authType: "apiToken", apiToken: input.apiToken };
  }
  return { authType: "globalApiKey", email: input.email, globalApiKey: input.globalApiKey };
}

cfRouter.post("/credentials", async (req, res) => {
  try {
    const auth = req.auth as AuthUser;

    // Validate request body
    let body;
    try {
      body = credentialInputSchema.parse(req.body);
    } catch (error: any) {
      logger.warn("Invalid credentials request", { error: error.errors, body: { ...req.body, globalApiKey: undefined, apiToken: undefined } });
      return res.status(400).json({ detail: "Invalid request: " + (error.errors?.[0]?.message || error.message) });
    }

    const credentials = buildCredentials(body);
    const secret = body.authType === "apiToken" ? body.apiToken! : body.globalApiKey!;

    logger.info("Testing Cloudflare connection", { authType: body.authType, email: body.email });

    // Test connection
    let isValid = false;
    try {
      isValid = await cloudflareService.testConnection(credentials);
    } catch (error: any) {
      logger.error("Cloudflare connection test failed", { error: error.message });
      return sendApiError(res, error, {
        status: 400,
        code: "CLOUDFLARE_CONNECTION_FAILED",
        detail: "Failed to connect to Cloudflare",
      });
    }

    if (!isValid) {
      logger.warn("Invalid Cloudflare credentials", { authType: body.authType });
      return res.status(400).json({ detail: "Invalid Cloudflare credentials. Please check your input." });
    }

    // Encrypt and save
    try {
      await configService.loadConfig();
      const encrypted = encrypt(secret);

      // For Global API Key, dedupe by email; for API token, dedupe by label
      const existingAccounts = await configService.getAllAccounts(auth.userId);
      const existingAccount =
        body.authType === "apiToken"
          ? existingAccounts.find((acc) => acc.authType === "apiToken" && body.label && acc.label === body.label)
          : existingAccounts.find((acc) => acc.email === body.email);

      if (existingAccount) {
        await configService.updateAccount(existingAccount.id, {
          authType: body.authType,
          email: body.email,
          globalApiKeyEncrypted: encrypted,
          label: body.label || existingAccount.label,
        }, auth.userId);
        logger.info("Cloudflare credentials updated", { accountId: existingAccount.id });
      } else {
        await configService.addAccount({
          userId: auth.userId,
          authType: body.authType,
          email: body.email,
          globalApiKeyEncrypted: encrypted,
          label: body.label,
        });
        logger.info("Cloudflare credentials saved", { authType: body.authType });
      }
    } catch (error: any) {
      logger.error("Failed to save credentials", { error: error.message, userId: auth.userId });
      return sendApiError(res, error, {
        status: 500,
        code: "CREDENTIAL_SAVE_FAILED",
        detail: "Failed to save credentials",
      });
    }

    res.json({ success: true });
  } catch (error: any) {
    logger.error("Unexpected error in /credentials", { error: error.message, stack: error.stack });
    sendApiError(res, error, {
      status: 500,
      code: "INTERNAL_SERVER_ERROR",
      detail: "Internal server error",
    });
  }
});

cfRouter.get("/credentials", async (req, res) => {
  const auth = req.auth as AuthUser;
  try {
    await configService.loadConfig();
    const accounts = await configService.getAllAccounts(auth.userId);

    // Get first active account (or all accounts for listing)
    const accountId = req.query.accountId as string | undefined;
    const label = req.query.label as string | undefined;

    let account;
    if (accountId) {
      account = await configService.getAccountById(accountId, auth.userId);
    } else if (label) {
      account = await configService.getAccountByLabel(label, auth.userId);
    } else {
      // Return first active account or all accounts
      account = accounts.find((acc) => acc.isActive) || accounts[0];
    }

    if (!account) {
      return res.status(404).json({ detail: "No credentials found" });
    }

    res.json({
      id: account.id,
      authType: account.authType,
      email: account.email,
      label: account.label,
      isActive: account.isActive,
      createdAt: account.createdAt,
      domainsCount: account.domains.length,
    });
  } catch (error: any) {
    logger.error("Failed to get credentials", { error: error.message });
    sendApiError(res, error, {
      status: 500,
      code: "CREDENTIAL_READ_FAILED",
      detail: "Failed to get credentials",
    });
  }
});

export async function getCredentials(
  userId: string,
  accountId?: string,
  label?: string
): Promise<CloudflareCredentials> {
  await configService.loadConfig();

  let account;
  if (accountId) {
    account = await configService.getAccountById(accountId, userId);
  } else if (label) {
    account = await configService.getAccountByLabel(label, userId);
  } else {
    // Fallback to the user's first active account
    const accounts = await configService.getAllAccounts(userId);
    account = accounts.find((acc) => acc.isActive) || accounts[0];
  }

  if (!account) {
    throw new Error("Cloudflare credentials not configured");
  }

  const secret = decrypt(account.globalApiKeyEncrypted);
  if (account.authType === "apiToken") {
    return { authType: "apiToken", apiToken: secret };
  }
  return { authType: "globalApiKey", email: account.email, globalApiKey: secret };
}

cfRouter.get("/test", async (req, res) => {
  const auth = req.auth as AuthUser;
  try {
    const accountId = req.query.accountId as string | undefined;
    const label = req.query.label as string | undefined;
    const credentials = await getCredentials(auth.userId, accountId, label);
    const isValid = await cloudflareService.testConnection(credentials);
    res.json({ valid: isValid });
  } catch (error: any) {
    sendApiError(res, error, {
      status: 400,
      code: "CONNECTION_TEST_FAILED",
      detail: "Failed to test connection",
    });
  }
});

cfRouter.get("/capabilities", async (req, res) => {
  const auth = req.auth as AuthUser;
  const zoneId = req.query.zoneId as string | undefined;
  const accountId = req.query.accountId as string | undefined;
  const label = req.query.label as string | undefined;

  try {
    const credentials = await getCredentials(auth.userId, accountId, label);
    const token = {
      valid: true,
      authType: credentials.authType,
      accountId: accountId || null,
    };

    let zone: { id: string; plan: string | null } | null = null;

    const unknownFeature = (requiredPermission: string) => ({
      state: "unknown" as FeatureState,
      requiredPermission,
      reason: zoneId ? null : "zoneId is required",
    });

    const features: Record<string, { state: FeatureState; requiredPermission: string; reason: string | null }> = {
      dns: unknownFeature("DNS Write"),
      cachePurge: unknownFeature("Cache Purge"),
      ssl: unknownFeature("Zone Settings Write"),
      pageRules: unknownFeature("Page Rules Write"),
      modernRules: unknownFeature("Zone Rulesets Write"),
    };

    // Non-destructive probe: run a read, mark available on success, classify the CF error otherwise.
    const probeFeature = async (
      name: keyof typeof features,
      requiredPermission: string,
      probe: () => Promise<unknown>,
    ) => {
      try {
        await probe();
        features[name] = { state: "available", requiredPermission, reason: null };
      } catch (error) {
        features[name] = featureFromCloudflareError(error, requiredPermission);
      }
    };

    if (zoneId) {
      try {
        const zoneDetails = await cloudflareService.getZoneDetails(credentials, zoneId);
        zone = { id: zoneDetails.id, plan: zoneDetails.plan ?? null };
      } catch (error) {
        zone = { id: zoneId, plan: null };
      }

      await Promise.all([
        probeFeature("dns", "DNS Write", () => cloudflareService.listDnsRecords(credentials, zoneId)),
        probeFeature("cachePurge", "Cache Purge", () => cloudflareService.getCacheSettings(credentials, zoneId)),
        probeFeature("ssl", "Zone Settings Write", () => cloudflareService.getSslMode(credentials, zoneId)),
        probeFeature("pageRules", "Page Rules Write", () => cloudflareService.listPageRules(credentials, zoneId)),
        probeFeature("modernRules", "Zone Rulesets Write", () =>
          cloudflareService.getRulesetRules(credentials, zoneId, "http_request_dynamic_redirect"),
        ),
      ]);
    }

    return res.json({ token, zone, features });
  } catch (error) {
    return sendApiError(res, error, {
      status: 400,
      code: "CAPABILITY_PROBE_FAILED",
      detail: "Failed to evaluate Cloudflare capabilities",
    });
  }
});

// ========== Account Management Endpoints ==========

cfRouter.get("/accounts", async (req, res) => {
  try {
    const auth = req.auth as AuthUser;
    await configService.loadConfig();
    const accounts = await configService.getAllAccounts(auth.userId);
    res.json(
      accounts.map((acc) => ({
        id: acc.id,
        label: acc.label,
        authType: acc.authType,
        email: acc.email,
        isActive: acc.isActive,
        createdAt: acc.createdAt,
        updatedAt: acc.updatedAt,
        domainsCount: acc.domains.length,
      }))
    );
  } catch (error: any) {
    logger.error("Failed to list accounts", { error: error.message });
    res.status(500).json({ detail: error.message || "Failed to list accounts" });
  }
});

cfRouter.post("/accounts", async (req, res) => {
  try {
    const auth = req.auth as AuthUser;
    const body = credentialInputSchema.parse(req.body);

    const credentials = buildCredentials(body);
    const secret = body.authType === "apiToken" ? body.apiToken! : body.globalApiKey!;

    // Test connection first
    const isValid = await cloudflareService.testConnection(credentials);
    if (!isValid) {
      return res.status(400).json({ detail: "Invalid Cloudflare credentials" });
    }

    await configService.loadConfig();

    // Prevent duplicate accounts: Global API Key dedupes by email, API Token dedupes by label.
    const existingAccounts = await configService.getAllAccounts(auth.userId);
    const duplicate =
      body.authType === "apiToken"
        ? body.label
          ? existingAccounts.find((acc) => acc.authType === "apiToken" && acc.label === body.label)
          : undefined
        : existingAccounts.find((acc) => acc.authType !== "apiToken" && acc.email === body.email);

    if (duplicate) {
      const reason =
        body.authType === "apiToken"
          ? `Tài khoản API Token với nhãn "${body.label}" đã tồn tại`
          : `Tài khoản Global API Key với email "${body.email}" đã tồn tại`;
      return res.status(409).json(apiErrorEnvelope(new Error(reason), "ACCOUNT_DUPLICATE", reason));
    }

    const encrypted = encrypt(secret);
    const account = await configService.addAccount({
      userId: auth.userId,
      authType: body.authType,
      email: body.email,
      globalApiKeyEncrypted: encrypted,
      label: body.label,
    });

    res.status(201).json({
      id: account.id,
      label: account.label,
      authType: account.authType,
      email: account.email,
      isActive: account.isActive,
      createdAt: account.createdAt,
    });
  } catch (error: any) {
    logger.error("Failed to create account", { error: error.message });
    sendApiError(res, error, {
      status: 400,
      code: "ACCOUNT_CREATE_FAILED",
      detail: "Failed to create account",
    });
  }
});

cfRouter.get("/accounts/:id", async (req, res) => {
  try {
    const auth = req.auth as AuthUser;
    await configService.loadConfig();
    const account = await configService.getAccountById(req.params.id, auth.userId);
    if (!account) {
      return res.status(404).json({ detail: "Account not found" });
    }

    res.json({
      id: account.id,
      label: account.label,
      authType: account.authType,
      email: account.email,
      isActive: account.isActive,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
      domainsCount: account.domains.length,
    });
  } catch (error: any) {
    logger.error("Failed to get account", { error: error.message });
    res.status(500).json({ detail: error.message || "Failed to get account" });
  }
});

cfRouter.put("/accounts/:id", async (req, res) => {
  try {
    const bodySchema = z.object({
      label: z.string().optional(),
      authType: z.enum(["globalApiKey", "apiToken"]).optional(),
      email: z.string().email().optional(),
      globalApiKey: z.string().min(1).optional(),
      apiToken: z.string().min(1).optional(),
      isActive: z.boolean().optional(),
    });
    const body = bodySchema.parse(req.body);

    const auth = req.auth as AuthUser;
    await configService.loadConfig();
    const account = await configService.getAccountById(req.params.id, auth.userId);
    if (!account) {
      return res.status(404).json({ detail: "Account not found" });
    }

    const updates: any = {};
    if (body.label !== undefined) updates.label = body.label;
    if (body.isActive !== undefined) updates.isActive = body.isActive;
    if (body.email !== undefined) updates.email = body.email;

    const nextAuthType = body.authType || account.authType;
    const newSecret = nextAuthType === "apiToken" ? body.apiToken : body.globalApiKey;

    if (body.authType !== undefined) updates.authType = body.authType;

    if (newSecret !== undefined) {
      // Test new credentials if provided
      const credentials: CloudflareCredentials =
        nextAuthType === "apiToken"
          ? { authType: "apiToken", apiToken: newSecret }
          : { authType: "globalApiKey", email: body.email || account.email, globalApiKey: newSecret };

      const isValid = await cloudflareService.testConnection(credentials);
      if (!isValid) {
        return res.status(400).json({ detail: "Invalid Cloudflare credentials" });
      }
      updates.globalApiKeyEncrypted = encrypt(newSecret);
    }

    const updated = await configService.updateAccount(req.params.id, updates, auth.userId);
    res.json({
      id: updated.id,
      label: updated.label,
      authType: updated.authType,
      email: updated.email,
      isActive: updated.isActive,
      updatedAt: updated.updatedAt,
    });
  } catch (error: any) {
    logger.error("Failed to update account", { error: error.message });
    res.status(400).json({ detail: error.message || "Failed to update account" });
  }
});

cfRouter.delete("/accounts/:id", async (req, res) => {
  try {
    const auth = req.auth as AuthUser;
    await configService.loadConfig();
    await configService.deleteAccount(req.params.id, auth.userId);
    res.status(204).send();
  } catch (error: any) {
    logger.error("Failed to delete account", { error: error.message });
    if (error.message.includes("not found")) {
      return res.status(404).json({ detail: error.message });
    }
    res.status(500).json({ detail: error.message || "Failed to delete account" });
  }
});

// ========== Import/Export Endpoints (admin only — they touch ALL users' data) ==========

cfRouter.post("/accounts/import", async (req, res) => {
  try {
    const auth = req.auth as AuthUser;
    if (auth.role !== "admin") {
      return res.status(403).json({ detail: "Admin role required" });
    }
    const bodySchema = z.object({
      config: z.any(), // ConfigFile JSON
    });
    const body = bodySchema.parse(req.body);

    // Validate config structure
    const { ConfigFileSchema } = await import("../models/configAccount.js");
    const validated = ConfigFileSchema.parse(body.config);

    // Replace with imported config
    await configService.setConfig(validated);

    res.json({
      success: true,
      accountsImported: validated.accounts.length,
    });
  } catch (error: any) {
    logger.error("Failed to import config", { error: error.message });
    res.status(400).json({ detail: error.message || "Failed to import config" });
  }
});

cfRouter.get("/accounts/export", async (req, res) => {
  try {
    const auth = req.auth as AuthUser;
    if (auth.role !== "admin") {
      return res.status(403).json({ detail: "Admin role required" });
    }
    const config = await configService.loadConfig();
    res.json(config);
  } catch (error: any) {
    logger.error("Failed to export config", { error: error.message });
    res.status(500).json({ detail: error.message || "Failed to export config" });
  }
});
