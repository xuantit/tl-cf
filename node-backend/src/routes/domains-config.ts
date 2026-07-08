import { Router } from "express";
import { z } from "zod";

import { requireAuth, type AuthUser } from "../middleware/auth.js";
import { cloudflareService } from "../services/cloudflare.js";
import { configService } from "../services/configService.js";
import { getCredentials } from "./cf.js";
import logger from "../utils/logger.js";

export const domainsConfigRouter = Router();

domainsConfigRouter.use(requireAuth);

/** Returns true when the account exists and belongs to the user. */
async function accountOwnedByUser(accountId: string, userId: string): Promise<boolean> {
  const account = await configService.getAccountById(accountId, userId);
  return !!account;
}

// List all domains for an account
domainsConfigRouter.get("/accounts/:accountId/domains", async (req, res) => {
  const auth = req.auth as AuthUser;
  try {
    await configService.loadConfig();
    if (!(await accountOwnedByUser(req.params.accountId, auth.userId))) {
      return res.status(404).json({ detail: "Account not found" });
    }
    const domains = await configService.getAllDomains(req.params.accountId);
    res.json(domains);
  } catch (error: any) {
    logger.error("Failed to list domains", { error: error.message });
    res.status(500).json({ detail: error.message || "Failed to list domains" });
  }
});

// Get domain details and settings
domainsConfigRouter.get("/accounts/:accountId/domains/:domainId", async (req, res) => {
  const auth = req.auth as AuthUser;
  try {
    await configService.loadConfig();
    if (!(await accountOwnedByUser(req.params.accountId, auth.userId))) {
      return res.status(404).json({ detail: "Account not found" });
    }
    const domain = await configService.getDomainById(req.params.accountId, req.params.domainId);
    if (!domain) {
      return res.status(404).json({ detail: "Domain not found" });
    }
    res.json(domain);
  } catch (error: any) {
    logger.error("Failed to get domain", { error: error.message });
    res.status(500).json({ detail: error.message || "Failed to get domain" });
  }
});

// Add domain (sync from Cloudflare)
domainsConfigRouter.post("/accounts/:accountId/domains", async (req, res) => {
  const auth = req.auth as AuthUser;
  try {
    const bodySchema = z.object({
      zoneId: z.string(),
    });
    const body = bodySchema.parse(req.body);

    await configService.loadConfig();
    const account = await configService.getAccountById(req.params.accountId, auth.userId);
    if (!account) {
      return res.status(404).json({ detail: "Account not found" });
    }

    // Get credentials and fetch zone details
    const credentials = await getCredentials(auth.userId, req.params.accountId);
    const zone = await cloudflareService.getZoneDetails(credentials, body.zoneId);

    // Fetch settings from Cloudflare
    const cacheSettings = await cloudflareService.getCacheSettings(credentials, body.zoneId);
    const dnsRecords = await cloudflareService.listDnsRecords(credentials, body.zoneId);
    const pageRules = await cloudflareService.listPageRules(credentials, body.zoneId);

    // Create domain with settings
    const domain = await configService.addDomain(req.params.accountId, {
      name: zone.name,
      zoneId: zone.id,
      status: zone.status,
      settings: {
        sslMode: undefined, // Would need to fetch from Cloudflare API
        cache: {
          cacheLevel: cacheSettings.cache_level,
          browserCacheTtl: cacheSettings.browser_cache_ttl,
        },
        dnsRecords: dnsRecords.map((r) => ({
          id: r.id,
          type: r.type,
          name: r.name,
          content: r.content,
          ttl: r.ttl,
          proxied: r.proxied,
          priority: r.priority,
        })),
        pageRules: pageRules.map((r) => ({
          id: r.id,
          priority: r.priority,
          status: r.status,
          targets: r.targets,
          actions: r.actions,
        })),
      },
    });

    res.status(201).json(domain);
  } catch (error: any) {
    logger.error("Failed to add domain", { error: error.message });
    res.status(400).json({ detail: error.message || "Failed to add domain" });
  }
});

// Update domain settings
domainsConfigRouter.put("/accounts/:accountId/domains/:domainId", async (req, res) => {
  const auth = req.auth as AuthUser;
  try {
    const bodySchema = z.object({
      name: z.string().optional(),
      status: z.string().optional(),
      settings: z.any().optional(),
    });
    const body = bodySchema.parse(req.body);

    await configService.loadConfig();
    if (!(await accountOwnedByUser(req.params.accountId, auth.userId))) {
      return res.status(404).json({ detail: "Account not found" });
    }
    const domain = await configService.updateDomain(req.params.accountId, req.params.domainId, body);
    res.json(domain);
  } catch (error: any) {
    logger.error("Failed to update domain", { error: error.message });
    if (error.message.includes("not found")) {
      return res.status(404).json({ detail: error.message });
    }
    res.status(400).json({ detail: error.message || "Failed to update domain" });
  }
});

// Delete domain from config
domainsConfigRouter.delete("/accounts/:accountId/domains/:domainId", async (req, res) => {
  const auth = req.auth as AuthUser;
  try {
    await configService.loadConfig();
    if (!(await accountOwnedByUser(req.params.accountId, auth.userId))) {
      return res.status(404).json({ detail: "Account not found" });
    }
    await configService.deleteDomain(req.params.accountId, req.params.domainId);
    res.status(204).send();
  } catch (error: any) {
    logger.error("Failed to delete domain", { error: error.message });
    if (error.message.includes("not found")) {
      return res.status(404).json({ detail: error.message });
    }
    res.status(500).json({ detail: error.message || "Failed to delete domain" });
  }
});

// Sync domain settings from Cloudflare API
domainsConfigRouter.post("/accounts/:accountId/domains/:domainId/sync", async (req, res) => {
  const auth = req.auth as AuthUser;
  try {
    await configService.loadConfig();
    const account = await configService.getAccountById(req.params.accountId, auth.userId);
    if (!account) {
      return res.status(404).json({ detail: "Account not found" });
    }

    const domain = await configService.getDomainById(req.params.accountId, req.params.domainId);
    if (!domain || !domain.zoneId) {
      return res.status(404).json({ detail: "Domain not found or missing zoneId" });
    }

    const credentials = await getCredentials(auth.userId, req.params.accountId);

    // Fetch current settings from Cloudflare
    const zone = await cloudflareService.getZoneDetails(credentials, domain.zoneId);
    const cacheSettings = await cloudflareService.getCacheSettings(credentials, domain.zoneId);
    const dnsRecords = await cloudflareService.listDnsRecords(credentials, domain.zoneId);
    const pageRules = await cloudflareService.listPageRules(credentials, domain.zoneId);

    // Update domain with synced settings
    const updated = await configService.updateDomain(req.params.accountId, req.params.domainId, {
      status: zone.status,
      settings: {
        cache: {
          cacheLevel: cacheSettings.cache_level,
          browserCacheTtl: cacheSettings.browser_cache_ttl,
        },
        dnsRecords: dnsRecords.map((r) => ({
          id: r.id,
          type: r.type,
          name: r.name,
          content: r.content,
          ttl: r.ttl,
          proxied: r.proxied,
          priority: r.priority,
        })),
        pageRules: pageRules.map((r) => ({
          id: r.id,
          priority: r.priority,
          status: r.status,
          targets: r.targets,
          actions: r.actions,
        })),
      },
    });

    res.json(updated);
  } catch (error: any) {
    logger.error("Failed to sync domain", { error: error.message });
    res.status(400).json({ detail: error.message || "Failed to sync domain" });
  }
});

// Apply saved settings to Cloudflare
domainsConfigRouter.post("/accounts/:accountId/domains/:domainId/apply", async (req, res) => {
  const auth = req.auth as AuthUser;
  try {
    await configService.loadConfig();
    if (!(await accountOwnedByUser(req.params.accountId, auth.userId))) {
      return res.status(404).json({ detail: "Account not found" });
    }
    const domain = await configService.getDomainById(req.params.accountId, req.params.domainId);
    if (!domain || !domain.zoneId || !domain.settings) {
      return res.status(404).json({ detail: "Domain not found or missing settings" });
    }

    const credentials = await getCredentials(auth.userId, req.params.accountId);
    const results: any = {};

    // Apply cache settings
    if (domain.settings.cache) {
      try {
        const cacheResult = await cloudflareService.updateCacheSettings(credentials, domain.zoneId, {
          cache_level: domain.settings.cache.cacheLevel,
          browser_cache_ttl: domain.settings.cache.browserCacheTtl,
        });
        results.cache = { success: true, result: cacheResult };
      } catch (error: any) {
        results.cache = { success: false, error: error.message };
      }
    }

    // Note: DNS records and page rules would need more complex logic to apply
    // For now, we'll just return what was attempted

    res.json({
      success: true,
      results,
    });
  } catch (error: any) {
    logger.error("Failed to apply domain settings", { error: error.message });
    res.status(400).json({ detail: error.message || "Failed to apply domain settings" });
  }
});
