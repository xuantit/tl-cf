import { Router } from "express";
import { z } from "zod";

import { requireAuth, type AuthUser } from "../middleware/auth.js";
import { cloudflareService } from "../services/cloudflare.js";
import { getCredentials } from "./cf.js";
import { configService } from "../services/configService.js";
import logger from "../utils/logger.js";

export const domainsRouter = Router();

domainsRouter.use(requireAuth);

// Helper to get account ID from query or find by credentials
async function getAccountIdForCredentials(
  credentials: { email: string },
  accountId?: string
): Promise<string | null> {
  await configService.loadConfig();
  if (accountId) {
    const account = await configService.getAccountById(accountId);
    if (account && account.email === credentials.email) {
      return account.id;
    }
  }
  // Find account by email
  const accounts = await configService.getAllAccounts();
  const account = accounts.find((acc) => acc.email === credentials.email);
  return account?.id || null;
}

domainsRouter.get("/", async (req, res) => {
  const auth = req.auth as AuthUser;
  try {
    const accountId = req.query.accountId as string | undefined;
    const label = req.query.label as string | undefined;
    const credentials = await getCredentials(auth.userId, accountId, label);
    const zones = await cloudflareService.listZones(credentials);
    
    // Sync zones to JSON config if accountId is provided and enrich with SSL mode
    const resolvedAccountId = await getAccountIdForCredentials(credentials, accountId);
    if (resolvedAccountId) {
      try {
        await configService.loadConfig();
        for (const zone of zones) {
          const existingDomain = await configService.getDomainByZoneId(resolvedAccountId, zone.id);
          if (!existingDomain) {
            await configService.addDomain(resolvedAccountId, {
              name: zone.name,
              zoneId: zone.id,
              status: zone.status,
            });
          } else {
            // Enrich zone with SSL mode from saved settings
            if (existingDomain.settings?.sslMode) {
              (zone as any).sslMode = existingDomain.settings.sslMode;
              if (zone.ssl) {
                zone.ssl.status = existingDomain.settings.sslMode !== 'off' ? 'active' : 'off';
              } else {
                (zone as any).ssl = {
                  status: existingDomain.settings.sslMode !== 'off' ? 'active' : 'off',
                  mode: existingDomain.settings.sslMode,
                };
              }
            }
          }
        }
      } catch (error: any) {
        logger.warn("Failed to sync zones to config", { error: error.message });
      }
    }
    
    // If no accountId, try to get SSL mode from API for each zone (with rate limiting)
    if (!resolvedAccountId) {
      try {
        // Limit to first 10 zones to avoid too many API calls
        const zonesToEnrich = zones.slice(0, 10);
        for (const zone of zonesToEnrich) {
          try {
            const sslSettings = await cloudflareService.getSslMode(credentials, zone.id);
            (zone as any).sslMode = sslSettings.mode;
            if (zone.ssl) {
              zone.ssl.status = sslSettings.mode !== 'off' ? 'active' : 'off';
            } else {
              (zone as any).ssl = {
                status: sslSettings.mode !== 'off' ? 'active' : 'off',
                mode: sslSettings.mode,
              };
            }
          } catch (error: any) {
            // Skip if SSL fetch fails for this zone
            logger.debug("Failed to get SSL mode for zone", { zoneId: zone.id, error: error.message });
          }
        }
      } catch (error: any) {
        logger.warn("Failed to enrich zones with SSL mode", { error: error.message });
      }
    }
    
    res.json(zones);
  } catch (error: any) {
    res.status(500).json({ detail: error.message || "Failed to fetch domains" });
  }
});

domainsRouter.get("/:zoneId", async (req, res) => {
  const auth = req.auth as AuthUser;
  const { zoneId } = req.params;
  const accountId = req.query.accountId as string | undefined;
  const label = req.query.label as string | undefined;
  try {
    const credentials = await getCredentials(auth.userId, accountId, label);
    const zone = await cloudflareService.getZoneDetails(credentials, zoneId);
    
    // Try to get saved settings from config and include SSL mode
    const resolvedAccountId = await getAccountIdForCredentials(credentials, accountId);
    if (resolvedAccountId) {
      try {
        const domain = await configService.getDomainByZoneId(resolvedAccountId, zoneId);
        if (domain && domain.settings) {
          (zone as any).savedSettings = domain.settings;
          // Include SSL mode in zone response for frontend display
          if (domain.settings.sslMode) {
            (zone as any).sslMode = domain.settings.sslMode;
            // Update SSL status based on mode
            if (zone.ssl) {
              zone.ssl.status = domain.settings.sslMode !== 'off' ? 'active' : 'off';
            } else {
              (zone as any).ssl = {
                status: domain.settings.sslMode !== 'off' ? 'active' : 'off',
                mode: domain.settings.sslMode,
              };
            }
          }
        }
      } catch (error: any) {
        logger.warn("Failed to load saved settings", { error: error.message });
      }
    }
    
    // If no saved settings, try to get SSL mode directly from Cloudflare API
    if (!(zone as any).sslMode) {
      try {
        const sslSettings = await cloudflareService.getSslMode(credentials, zoneId);
        (zone as any).sslMode = sslSettings.mode;
        if (zone.ssl) {
          zone.ssl.status = sslSettings.mode !== 'off' ? 'active' : 'off';
        } else {
          (zone as any).ssl = {
            status: sslSettings.mode !== 'off' ? 'active' : 'off',
            mode: sslSettings.mode,
          };
        }
      } catch (error: any) {
        logger.warn("Failed to get SSL mode", { error: error.message });
      }
    }
    
    res.json(zone);
  } catch (error: any) {
    res.status(500).json({ detail: error.message || "Failed to fetch domain details" });
  }
});

// DNS Records
domainsRouter.get("/:zoneId/dns", async (req, res) => {
  const auth = req.auth as AuthUser;
  const { zoneId } = req.params;
  try {
    const credentials = await getCredentials(auth.userId);
    const records = await cloudflareService.listDnsRecords(credentials, zoneId);
    res.json(records);
  } catch (error: any) {
    res.status(500).json({ detail: error.message || "Failed to fetch DNS records" });
  }
});

domainsRouter.post("/:zoneId/dns", async (req, res) => {
  const auth = req.auth as AuthUser;
  const { zoneId } = req.params;
  const bodySchema = z.object({
    type: z.string(),
    name: z.string(),
    content: z.string(),
    ttl: z.number().default(3600),
    proxied: z.boolean().optional(),
    priority: z.number().optional(),
  });
  try {
    const body = bodySchema.parse(req.body);
    const credentials = await getCredentials(auth.userId);
    const record = await cloudflareService.createDnsRecord(credentials, zoneId, body);
    res.status(201).json(record);
  } catch (error: any) {
    res.status(400).json({ detail: error.message || "Failed to create DNS record" });
  }
});

domainsRouter.put("/:zoneId/dns/:recordId", async (req, res) => {
  const auth = req.auth as AuthUser;
  const { zoneId, recordId } = req.params;
  const bodySchema = z.object({
    type: z.string().optional(),
    name: z.string().optional(),
    content: z.string().optional(),
    ttl: z.number().optional(),
    proxied: z.boolean().optional(),
    priority: z.number().optional(),
  });
  try {
    const body = bodySchema.parse(req.body);
    const credentials = await getCredentials(auth.userId);
    const record = await cloudflareService.updateDnsRecord(credentials, zoneId, recordId, body);
    res.json(record);
  } catch (error: any) {
    res.status(400).json({ detail: error.message || "Failed to update DNS record" });
  }
});

domainsRouter.delete("/:zoneId/dns/:recordId", async (req, res) => {
  const auth = req.auth as AuthUser;
  const { zoneId, recordId } = req.params;
  try {
    const credentials = await getCredentials(auth.userId);
    await cloudflareService.deleteDnsRecord(credentials, zoneId, recordId);
    res.status(204).send();
  } catch (error: any) {
    res.status(400).json({ detail: error.message || "Failed to delete DNS record" });
  }
});

// Cache Config
domainsRouter.get("/:zoneId/cache-config", async (req, res) => {
  const auth = req.auth as AuthUser;
  const { zoneId } = req.params;
  try {
    const credentials = await getCredentials(auth.userId);
    const settings = await cloudflareService.getCacheSettings(credentials, zoneId);
    res.json(settings);
  } catch (error: any) {
    res.status(500).json({ detail: error.message || "Failed to fetch cache settings" });
  }
});

domainsRouter.put("/:zoneId/cache-config", async (req, res) => {
  const auth = req.auth as AuthUser;
  const { zoneId } = req.params;
  const accountId = req.query.accountId as string | undefined;
  const label = req.query.label as string | undefined;
  const bodySchema = z.object({
    cache_level: z.string().optional(),
    browser_cache_ttl: z.number().optional(),
    tiered_cache_topology: z.string().optional(),
  });
  try {
    const body = bodySchema.parse(req.body);
    const credentials = await getCredentials(auth.userId, accountId, label);
    const settings = await cloudflareService.updateCacheSettings(credentials, zoneId, body);
    
    // Save to JSON config
    const resolvedAccountId = await getAccountIdForCredentials(credentials, accountId);
    if (resolvedAccountId) {
      try {
        let domain = await configService.getDomainByZoneId(resolvedAccountId, zoneId);
        if (!domain) {
          // Create domain entry if it doesn't exist
          const zone = await cloudflareService.getZoneDetails(credentials, zoneId);
          domain = await configService.addDomain(resolvedAccountId, {
            name: zone.name,
            zoneId: zone.id,
            status: zone.status,
          });
        }
        
        await configService.updateDomainSettings(resolvedAccountId, domain.id, {
          cache: {
            cacheLevel: settings.cache_level,
            browserCacheTtl: settings.browser_cache_ttl,
            tieredCacheTopology: settings.tiered_cache_topology,
          },
        });
      } catch (error: any) {
        logger.warn("Failed to save cache settings to config", { error: error.message });
      }
    }
    
    res.json(settings);
  } catch (error: any) {
    res.status(400).json({ detail: error.message || "Failed to update cache settings" });
  }
});

domainsRouter.post("/:zoneId/cache-config/purge", async (req, res) => {
  const auth = req.auth as AuthUser;
  const { zoneId } = req.params;
  try {
    const credentials = await getCredentials(auth.userId);
    await cloudflareService.purgeCache(credentials, zoneId);
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ detail: error.message || "Failed to purge cache" });
  }
});

// SSL Settings
domainsRouter.get("/:zoneId/ssl", async (req, res) => {
  const auth = req.auth as AuthUser;
  const { zoneId } = req.params;
  const accountId = req.query.accountId as string | undefined;
  const label = req.query.label as string | undefined;
  try {
    const credentials = await getCredentials(auth.userId, accountId, label);
    const sslSettings = await cloudflareService.getSslMode(credentials, zoneId);
    res.json(sslSettings);
  } catch (error: any) {
    res.status(500).json({ detail: error.message || "Failed to fetch SSL settings" });
  }
});

domainsRouter.patch("/:zoneId/ssl", async (req, res) => {
  const auth = req.auth as AuthUser;
  const { zoneId } = req.params;
  const accountId = req.query.accountId as string | undefined;
  const label = req.query.label as string | undefined;
  const bodySchema = z.object({
    mode: z.enum(["off", "flexible", "full", "strict"]),
  });
  try {
    const body = bodySchema.parse(req.body);
    const credentials = await getCredentials(auth.userId, accountId, label);
    const sslSettings = await cloudflareService.updateSslMode(credentials, zoneId, body.mode);
    
    // Save to JSON config
    const resolvedAccountId = await getAccountIdForCredentials(credentials, accountId);
    if (resolvedAccountId) {
      try {
        let domain = await configService.getDomainByZoneId(resolvedAccountId, zoneId);
        if (!domain) {
          const zone = await cloudflareService.getZoneDetails(credentials, zoneId);
          domain = await configService.addDomain(resolvedAccountId, {
            name: zone.name,
            zoneId: zone.id,
            status: zone.status,
          });
        }
        
        await configService.updateDomainSettings(resolvedAccountId, domain.id, {
          sslMode: body.mode,
        });
      } catch (error: any) {
        logger.warn("Failed to save SSL settings to config", { error: error.message });
      }
    }
    
    res.json(sslSettings);
  } catch (error: any) {
    res.status(400).json({ detail: error.message || "Failed to update SSL settings" });
  }
});

// Tiered Cache Topology
domainsRouter.get("/:zoneId/tiered-cache", async (req, res) => {
  const auth = req.auth as AuthUser;
  const { zoneId } = req.params;
  const accountId = req.query.accountId as string | undefined;
  const label = req.query.label as string | undefined;
  try {
    const credentials = await getCredentials(auth.userId, accountId, label);
    const tieredCache = await cloudflareService.getTieredCacheTopology(credentials, zoneId);
    res.json(tieredCache);
  } catch (error: any) {
    res.status(500).json({ detail: error.message || "Failed to fetch tiered cache topology" });
  }
});

domainsRouter.patch("/:zoneId/tiered-cache", async (req, res) => {
  const auth = req.auth as AuthUser;
  const { zoneId } = req.params;
  const accountId = req.query.accountId as string | undefined;
  const label = req.query.label as string | undefined;
  const bodySchema = z.object({
    topology: z.string(),
  });
  try {
    const body = bodySchema.parse(req.body);
    const credentials = await getCredentials(auth.userId, accountId, label);
    const tieredCache = await cloudflareService.updateTieredCacheTopology(credentials, zoneId, body.topology);
    
    // Save to JSON config
    const resolvedAccountId = await getAccountIdForCredentials(credentials, accountId);
    if (resolvedAccountId) {
      try {
        let domain = await configService.getDomainByZoneId(resolvedAccountId, zoneId);
        if (!domain) {
          const zone = await cloudflareService.getZoneDetails(credentials, zoneId);
          domain = await configService.addDomain(resolvedAccountId, {
            name: zone.name,
            zoneId: zone.id,
            status: zone.status,
          });
        }
        
        await configService.updateDomainSettings(resolvedAccountId, domain.id, {
          cache: {
            ...domain.settings?.cache,
            tieredCacheTopology: body.topology,
          },
        });
      } catch (error: any) {
        logger.warn("Failed to save tiered cache settings to config", { error: error.message });
      }
    }
    
    res.json(tieredCache);
  } catch (error: any) {
    res.status(400).json({ detail: error.message || "Failed to update tiered cache topology" });
  }
});

// Rules (Page Rules)
domainsRouter.get("/:zoneId/rules", async (req, res) => {
  const auth = req.auth as AuthUser;
  const { zoneId } = req.params;
  try {
    const credentials = await getCredentials(auth.userId);
    const rules = await cloudflareService.listPageRules(credentials, zoneId);
    res.json(rules);
  } catch (error: any) {
    res.status(500).json({ detail: error.message || "Failed to fetch rules" });
  }
});

domainsRouter.put("/:zoneId/rules/:ruleId", async (req, res) => {
  const auth = req.auth as AuthUser;
  const { zoneId, ruleId } = req.params;
  const bodySchema = z.object({
    status: z.string().optional(),
    priority: z.number().optional(),
    targets: z.array(z.any()).optional(),
    actions: z.array(z.any()).optional(),
  });
  try {
    const body = bodySchema.parse(req.body);
    const credentials = await getCredentials(auth.userId);
    const rule = await cloudflareService.updatePageRule(credentials, zoneId, ruleId, body);
    res.json(rule);
  } catch (error: any) {
    res.status(400).json({ detail: error.message || "Failed to update rule" });
  }
});
