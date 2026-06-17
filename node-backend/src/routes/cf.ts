import { Router } from "express";
import { z } from "zod";

import { requireAuth, type AuthUser } from "../middleware/auth.js";
import { cloudflareService } from "../services/cloudflare.js";
import { decrypt, encrypt } from "../utils/encryption.js";
import { configService } from "../services/configService.js";
import logger from "../utils/logger.js";

export const cfRouter = Router();

cfRouter.use(requireAuth);

cfRouter.post("/credentials", async (req, res) => {
  try {
    const auth = req.auth as AuthUser;
    
    // Validate request body
    let body;
    try {
      const bodySchema = z.object({
        email: z.string().email(),
        globalApiKey: z.string().min(1),
        label: z.string().optional(),
      });
      body = bodySchema.parse(req.body);
    } catch (error: any) {
      logger.warn("Invalid credentials request", { error: error.errors, body: req.body });
      return res.status(400).json({ detail: "Invalid request: " + (error.errors?.[0]?.message || error.message) });
    }

    logger.info("Testing Cloudflare connection", { email: body.email });

    // Test connection
    let isValid = false;
    try {
      isValid = await cloudflareService.testConnection({
        email: body.email,
        globalApiKey: body.globalApiKey,
      });
    } catch (error: any) {
      logger.error("Cloudflare connection test failed", { error: error.message, email: body.email });
      return res.status(400).json({ detail: "Failed to connect to Cloudflare: " + (error.message || "Unknown error") });
    }

    if (!isValid) {
      logger.warn("Invalid Cloudflare credentials", { email: body.email });
      return res.status(400).json({ detail: "Invalid Cloudflare credentials. Please check your email and API key." });
    }

    logger.info("Cloudflare credentials validated, saving...", { email: body.email, userId: auth.userId });

    // Encrypt and save to JSON config
    try {
      await configService.loadConfig();
      const encryptedKey = encrypt(body.globalApiKey);
      
      // Check if account with this email already exists
      const existingAccounts = await configService.getAllAccounts();
      const existingAccount = existingAccounts.find((acc) => acc.email === body.email);
      
      if (existingAccount) {
        // Update existing account
        await configService.updateAccount(existingAccount.id, {
          globalApiKeyEncrypted: encryptedKey,
          label: body.label || existingAccount.label,
        });
        logger.info("Cloudflare credentials updated", { accountId: existingAccount.id, email: body.email });
      } else {
        // Create new account
        await configService.addAccount({
          email: body.email,
          globalApiKeyEncrypted: encryptedKey,
          label: body.label,
        });
        logger.info("Cloudflare credentials saved", { email: body.email });
      }
    } catch (error: any) {
      logger.error("Failed to save credentials", { error: error.message, userId: auth.userId });
      return res.status(500).json({ detail: "Failed to save credentials: " + error.message });
    }

    res.json({ success: true });
  } catch (error: any) {
    logger.error("Unexpected error in /credentials", { error: error.message, stack: error.stack });
    res.status(500).json({ detail: "Internal server error: " + error.message });
  }
});

cfRouter.get("/credentials", async (req, res) => {
  const auth = req.auth as AuthUser;
  try {
    await configService.loadConfig();
    const accounts = await configService.getAllAccounts();
    
    // Get first active account (or all accounts for listing)
    const accountId = req.query.accountId as string | undefined;
    const label = req.query.label as string | undefined;
    
    let account;
    if (accountId) {
      account = await configService.getAccountById(accountId);
    } else if (label) {
      account = await configService.getAccountByLabel(label);
    } else {
      // Return first active account or all accounts
      account = accounts.find((acc) => acc.isActive) || accounts[0];
    }

    if (!account) {
      return res.status(404).json({ detail: "No credentials found" });
    }

    res.json({
      id: account.id,
      email: account.email,
      label: account.label,
      isActive: account.isActive,
      createdAt: account.createdAt,
      domainsCount: account.domains.length,
    });
  } catch (error: any) {
    logger.error("Failed to get credentials", { error: error.message });
    res.status(500).json({ detail: error.message || "Failed to get credentials" });
  }
});

export async function getCredentials(
  userId: string,
  accountId?: string,
  label?: string
): Promise<{ email: string; globalApiKey: string }> {
  await configService.loadConfig();
  const accounts = await configService.getAllAccounts();
  
  let account;
  if (accountId) {
    account = await configService.getAccountById(accountId);
  } else if (label) {
    account = await configService.getAccountByLabel(label);
  } else {
    // Fallback to first active account
    account = accounts.find((acc) => acc.isActive) || accounts[0];
  }

  if (!account) {
    throw new Error("Cloudflare credentials not configured");
  }

  return {
    email: account.email,
    globalApiKey: decrypt(account.globalApiKeyEncrypted),
  };
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
    res.status(400).json({ detail: error.message || "Failed to test connection" });
  }
});

// ========== Account Management Endpoints ==========

cfRouter.get("/accounts", async (req, res) => {
  try {
    await configService.loadConfig();
    const accounts = await configService.getAllAccounts();
    res.json(
      accounts.map((acc) => ({
        id: acc.id,
        label: acc.label,
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
    const bodySchema = z.object({
      label: z.string().optional(),
      email: z.string().email(),
      globalApiKey: z.string().min(1),
    });
    const body = bodySchema.parse(req.body);

    // Test connection first
    const isValid = await cloudflareService.testConnection({
      email: body.email,
      globalApiKey: body.globalApiKey,
    });

    if (!isValid) {
      return res.status(400).json({ detail: "Invalid Cloudflare credentials" });
    }

    await configService.loadConfig();
    const encryptedKey = encrypt(body.globalApiKey);
    const account = await configService.addAccount({
      email: body.email,
      globalApiKeyEncrypted: encryptedKey,
      label: body.label,
    });

    res.status(201).json({
      id: account.id,
      label: account.label,
      email: account.email,
      isActive: account.isActive,
      createdAt: account.createdAt,
    });
  } catch (error: any) {
    logger.error("Failed to create account", { error: error.message });
    res.status(400).json({ detail: error.message || "Failed to create account" });
  }
});

cfRouter.get("/accounts/:id", async (req, res) => {
  try {
    await configService.loadConfig();
    const account = await configService.getAccountById(req.params.id);
    if (!account) {
      return res.status(404).json({ detail: "Account not found" });
    }

    res.json({
      id: account.id,
      label: account.label,
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
      email: z.string().email().optional(),
      globalApiKey: z.string().min(1).optional(),
      isActive: z.boolean().optional(),
    });
    const body = bodySchema.parse(req.body);

    await configService.loadConfig();
    const account = await configService.getAccountById(req.params.id);
    if (!account) {
      return res.status(404).json({ detail: "Account not found" });
    }

    const updates: any = {};
    if (body.label !== undefined) updates.label = body.label;
    if (body.isActive !== undefined) updates.isActive = body.isActive;
    if (body.email !== undefined) updates.email = body.email;
    if (body.globalApiKey !== undefined) {
      // Test new credentials if provided
      const isValid = await cloudflareService.testConnection({
        email: body.email || account.email,
        globalApiKey: body.globalApiKey,
      });
      if (!isValid) {
        return res.status(400).json({ detail: "Invalid Cloudflare credentials" });
      }
      updates.globalApiKeyEncrypted = encrypt(body.globalApiKey);
    }

    const updated = await configService.updateAccount(req.params.id, updates);
    res.json({
      id: updated.id,
      label: updated.label,
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
    await configService.loadConfig();
    await configService.deleteAccount(req.params.id);
    res.status(204).send();
  } catch (error: any) {
    logger.error("Failed to delete account", { error: error.message });
    if (error.message.includes("not found")) {
      return res.status(404).json({ detail: error.message });
    }
    res.status(500).json({ detail: error.message || "Failed to delete account" });
  }
});

// ========== Import/Export Endpoints ==========

cfRouter.post("/accounts/import", async (req, res) => {
  try {
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
    await configService.loadConfig();
    const config = await configService.loadConfig();
    res.json(config);
  } catch (error: any) {
    logger.error("Failed to export config", { error: error.message });
    res.status(500).json({ detail: error.message || "Failed to export config" });
  }
});
