import { Router } from "express";
import { z } from "zod";

import { requireAuth, type AuthUser } from "../middleware/auth.js";
import { cloudflareService } from "../services/cloudflare.js";
import { createJob } from "../services/jobRunner.js";
import { getCredentials } from "./cf.js";
import { configService } from "../services/configService.js";
import logger from "../utils/logger.js";

export const domainsRouter = Router();

domainsRouter.use(requireAuth);

// Helper to get account ID from query or find by credentials (scoped to the requesting user)
async function getAccountIdForCredentials(
  userId: string,
  credentials: { email?: string },
  accountId?: string
): Promise<string | null> {
  await configService.loadConfig();
  if (accountId) {
    const account = await configService.getAccountById(accountId, userId);
    if (account) {
      return account.id;
    }
  }
  // Find account by email (only meaningful for Global API Key accounts)
  if (!credentials.email) return null;
  const accounts = await configService.getAllAccounts(userId);
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
    const resolvedAccountId = await getAccountIdForCredentials(auth.userId, credentials, accountId);
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
            // Enrich zone with tags from saved settings
            (zone as any).tags = existingDomain.settings?.tags ?? [];
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

// Create a new zone (domain) under the selected account
domainsRouter.post("/", async (req, res) => {
  const auth = req.auth as AuthUser;
  const accountId = req.query.accountId as string | undefined;
  const label = req.query.label as string | undefined;
  const bodySchema = z.object({
    name: z.string().min(1),
    cfAccountId: z.string().optional(),
    jumpStart: z.boolean().optional(),
  });
  try {
    const body = bodySchema.parse(req.body);
    const credentials = await getCredentials(auth.userId, accountId, label);
    const zone = await cloudflareService.createZone(credentials, body.name, body.cfAccountId, body.jumpStart);

    // Sync new zone into local config
    const resolvedAccountId = await getAccountIdForCredentials(auth.userId, credentials, accountId);
    if (resolvedAccountId) {
      try {
        const existing = await configService.getDomainByZoneId(resolvedAccountId, zone.id);
        if (!existing) {
          await configService.addDomain(resolvedAccountId, {
            name: zone.name,
            zoneId: zone.id,
            status: zone.status,
          });
        }
      } catch (error: any) {
        logger.warn("Failed to sync new zone to config", { error: error.message });
      }
    }

    res.status(201).json(zone);
  } catch (error: any) {
    logger.error("Failed to create zone", { error: error.message });
    res.status(400).json({ detail: error.message || "Failed to create domain" });
  }
});

// Bulk operations across multiple zones under the selected account
domainsRouter.post("/bulk", async (req, res) => {
  const auth = req.auth as AuthUser;
  const accountId = req.query.accountId as string | undefined;
  const label = req.query.label as string | undefined;
  const bodySchema = z.discriminatedUnion("action", [
    z.object({ action: z.literal("purge"), zoneIds: z.array(z.string()).min(1) }),
    z.object({ action: z.literal("delete"), zoneIds: z.array(z.string()).min(1) }),
  ]);
  try {
    const body = bodySchema.parse(req.body);
    const credentials = await getCredentials(auth.userId, accountId, label);
    const resolvedAccountId = await getAccountIdForCredentials(auth.userId, credentials, accountId);

    const job = createJob(
      body.action === "purge" ? "bulk-purge" : "bulk-delete",
      auth.userId,
      body.zoneIds.map((zoneId) => ({ key: zoneId })),
      async (item) => {
        const zoneId = item.key;
        if (body.action === "purge") {
          await cloudflareService.purgeCache(credentials, zoneId);
        } else {
          await cloudflareService.deleteZone(credentials, zoneId);
          if (resolvedAccountId) {
            try {
              const domain = await configService.getDomainByZoneId(resolvedAccountId, zoneId);
              if (domain) {
                await configService.deleteDomain(resolvedAccountId, domain.id);
              }
            } catch (error: any) {
              logger.warn("Failed to remove zone from config during bulk delete", {
                error: error.message,
              });
            }
          }
        }
        return { zoneId };
      },
    );

    res.status(202).json({ jobId: job.id });
  } catch (error: any) {
    res.status(400).json({ detail: error.message || "Bulk operation failed" });
  }
});

// Bulk create zones from a pasted list of domain names
const DOMAIN_NAME_REGEX = /^([a-z0-9-]+\.)+[a-z]{2,}$/;

domainsRouter.post("/bulk-create", async (req, res) => {
  const auth = req.auth as AuthUser;
  const accountId = req.query.accountId as string | undefined;
  const label = req.query.label as string | undefined;
  const bodySchema = z.object({
    names: z.array(z.string()).min(1).max(500),
    jumpStart: z.boolean().optional(),
  });
  try {
    const body = bodySchema.parse(req.body);

    // Normalize: trim, lowercase, dedupe, validate
    const names = [...new Set(body.names.map((n) => n.trim().toLowerCase()).filter(Boolean))];
    const invalid = names.filter((n) => !DOMAIN_NAME_REGEX.test(n));
    if (invalid.length > 0) {
      return res.status(400).json({ detail: `Tên domain không hợp lệ: ${invalid.join(", ")}` });
    }
    if (names.length === 0) {
      return res.status(400).json({ detail: "Danh sách domain trống" });
    }

    const credentials = await getCredentials(auth.userId, accountId, label);
    const resolvedAccountId = await getAccountIdForCredentials(auth.userId, credentials, accountId);

    // Resolve the Cloudflare account id once to avoid repeated listAccounts calls
    const cfAccounts = await cloudflareService.listAccounts(credentials);
    if (cfAccounts.length === 0) {
      return res.status(400).json({ detail: "Không tìm thấy Cloudflare account để tạo zone" });
    }
    const cfAccountId = cfAccounts[0].id;

    const job = createJob(
      "create-zones",
      auth.userId,
      names.map((name) => ({ key: name, label: name })),
      async (item) => {
        const zone = await cloudflareService.createZone(credentials, item.key, cfAccountId, body.jumpStart);
        if (resolvedAccountId) {
          try {
            const existing = await configService.getDomainByZoneId(resolvedAccountId, zone.id);
            if (!existing) {
              await configService.addDomain(resolvedAccountId, {
                name: zone.name,
                zoneId: zone.id,
                status: zone.status,
              });
            }
          } catch (error: any) {
            logger.warn("Failed to sync bulk-created zone to config", { error: error.message });
          }
        }
        return {
          name: zone.name,
          zoneId: zone.id,
          nameServers: zone.nameServers || [],
          status: zone.status,
        };
      },
    );

    res.status(202).json({ jobId: job.id });
  } catch (error: any) {
    res.status(400).json({ detail: error.message || "Bulk create failed" });
  }
});

// Bulk DNS find & replace — preview (dry-run, read-only)
const dnsRecordTypeSchema = z.enum(["A", "AAAA", "CNAME", "TXT", "MX"]);

domainsRouter.post("/bulk-dns/preview", async (req, res) => {
  const auth = req.auth as AuthUser;
  const accountId = req.query.accountId as string | undefined;
  const label = req.query.label as string | undefined;
  const bodySchema = z.object({
    zoneIds: z.array(z.string()).min(1),
    recordType: dnsRecordTypeSchema.optional(),
    matchContent: z.string().optional(),
    matchName: z.string().optional(),
  });
  try {
    const body = bodySchema.parse(req.body);
    const credentials = await getCredentials(auth.userId, accountId, label);

    const matches: Array<{
      zoneId: string;
      zoneName?: string;
      recordId: string;
      type: string;
      name: string;
      content: string;
      ttl: number;
      proxied?: boolean;
      priority?: number;
    }> = [];

    await Promise.all(
      body.zoneIds.map(async (zoneId) => {
        try {
          const records = await cloudflareService.listDnsRecords(credentials, zoneId);
          for (const record of records) {
            if (body.recordType && record.type !== body.recordType) continue;
            if (body.matchContent && record.content !== body.matchContent) continue;
            if (body.matchName && !record.name.includes(body.matchName)) continue;
            matches.push({
              zoneId,
              recordId: record.id,
              type: record.type,
              name: record.name,
              content: record.content,
              ttl: record.ttl,
              proxied: record.proxied,
              priority: record.priority,
            });
          }
        } catch (error: any) {
          logger.warn("Failed to list DNS records during bulk preview", {
            zoneId,
            error: error.message,
          });
        }
      }),
    );

    res.json({ matches, total: matches.length });
  } catch (error: any) {
    res.status(400).json({ detail: error.message || "Preview failed" });
  }
});

// Bulk DNS find & replace — apply
domainsRouter.post("/bulk-dns/replace", async (req, res) => {
  const auth = req.auth as AuthUser;
  const accountId = req.query.accountId as string | undefined;
  const label = req.query.label as string | undefined;
  const bodySchema = z.object({
    records: z
      .array(
        z.object({
          zoneId: z.string(),
          recordId: z.string(),
          type: z.string(),
          name: z.string(),
          ttl: z.number().optional(),
          proxied: z.boolean().optional(),
          priority: z.number().optional(),
        }),
      )
      .min(1),
    newContent: z.string().min(1),
    proxied: z.boolean().optional(),
  });
  try {
    const body = bodySchema.parse(req.body);
    const credentials = await getCredentials(auth.userId, accountId, label);

    const job = createJob(
      "dns-replace",
      auth.userId,
      body.records.map((record) => ({
        key: `${record.zoneId}:${record.recordId}`,
        label: `${record.name} (${record.type})`,
      })),
      async (item) => {
        const record = body.records.find((r) => `${r.zoneId}:${r.recordId}` === item.key)!;
        const updated = await cloudflareService.updateDnsRecord(credentials, record.zoneId, record.recordId, {
          type: record.type,
          name: record.name,
          content: body.newContent,
          ttl: record.ttl,
          proxied: body.proxied ?? record.proxied,
          priority: record.priority,
        });
        return { zoneId: record.zoneId, recordId: updated.id, content: updated.content };
      },
    );

    res.status(202).json({ jobId: job.id });
  } catch (error: any) {
    res.status(400).json({ detail: error.message || "Bulk DNS replace failed" });
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
    const resolvedAccountId = await getAccountIdForCredentials(auth.userId, credentials, accountId);
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

// Delete a zone (domain)
domainsRouter.delete("/:zoneId", async (req, res) => {
  const auth = req.auth as AuthUser;
  const { zoneId } = req.params;
  const accountId = req.query.accountId as string | undefined;
  const label = req.query.label as string | undefined;
  try {
    const credentials = await getCredentials(auth.userId, accountId, label);
    await cloudflareService.deleteZone(credentials, zoneId);

    // Remove from local config if present
    const resolvedAccountId = await getAccountIdForCredentials(auth.userId, credentials, accountId);
    if (resolvedAccountId) {
      try {
        const domain = await configService.getDomainByZoneId(resolvedAccountId, zoneId);
        if (domain) {
          await configService.deleteDomain(resolvedAccountId, domain.id);
        }
      } catch (error: any) {
        logger.warn("Failed to remove zone from config", { error: error.message });
      }
    }

    res.status(204).send();
  } catch (error: any) {
    logger.error("Failed to delete zone", { error: error.message });
    res.status(400).json({ detail: error.message || "Failed to delete domain" });
  }
});

// Update tags for a zone (stored locally in DomainSettings, not on Cloudflare)
domainsRouter.put("/:zoneId/tags", async (req, res) => {
  const auth = req.auth as AuthUser;
  const { zoneId } = req.params;
  const accountId = req.query.accountId as string | undefined;
  const label = req.query.label as string | undefined;
  try {
    const bodySchema = z.object({
      tags: z.array(z.string().trim().min(1).max(40)).max(20),
    });
    const body = bodySchema.parse(req.body);
    const tags = [...new Set(body.tags)];

    const credentials = await getCredentials(auth.userId, accountId, label);
    const resolvedAccountId = await getAccountIdForCredentials(auth.userId, credentials, accountId);
    if (!resolvedAccountId) {
      return res.status(404).json({ detail: "Account not found" });
    }

    let domain = await configService.getDomainByZoneId(resolvedAccountId, zoneId);
    if (!domain) {
      // Zone chưa sync vào DB — lấy từ CF rồi tạo record
      const zone = await cloudflareService.getZoneDetails(credentials, zoneId);
      domain = await configService.addDomain(resolvedAccountId, {
        name: zone.name,
        zoneId: zone.id,
        status: zone.status,
      });
    }

    await configService.updateDomainSettings(resolvedAccountId, domain.id, { tags });
    res.json({ zoneId, tags });
  } catch (error: any) {
    logger.error("Failed to update tags", { error: error.message, zoneId });
    res.status(400).json({ detail: error.message || "Failed to update tags" });
  }
});

// DNS Records
domainsRouter.get("/:zoneId/dns", async (req, res) => {
  const auth = req.auth as AuthUser;
  const { zoneId } = req.params;
  const accountId = req.query.accountId as string | undefined;
  const label = req.query.label as string | undefined;
  try {
    const credentials = await getCredentials(auth.userId, accountId, label);
    const records = await cloudflareService.listDnsRecords(credentials, zoneId);
    res.json(records);
  } catch (error: any) {
    res.status(500).json({ detail: error.message || "Failed to fetch DNS records" });
  }
});

domainsRouter.post("/:zoneId/dns", async (req, res) => {
  const auth = req.auth as AuthUser;
  const { zoneId } = req.params;
  const accountId = req.query.accountId as string | undefined;
  const label = req.query.label as string | undefined;
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
    const credentials = await getCredentials(auth.userId, accountId, label);
    const record = await cloudflareService.createDnsRecord(credentials, zoneId, body);
    res.status(201).json(record);
  } catch (error: any) {
    res.status(400).json({ detail: error.message || "Failed to create DNS record" });
  }
});

domainsRouter.put("/:zoneId/dns/:recordId", async (req, res) => {
  const auth = req.auth as AuthUser;
  const { zoneId, recordId } = req.params;
  const accountId = req.query.accountId as string | undefined;
  const label = req.query.label as string | undefined;
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
    const credentials = await getCredentials(auth.userId, accountId, label);
    const record = await cloudflareService.updateDnsRecord(credentials, zoneId, recordId, body);
    res.json(record);
  } catch (error: any) {
    res.status(400).json({ detail: error.message || "Failed to update DNS record" });
  }
});

domainsRouter.delete("/:zoneId/dns/:recordId", async (req, res) => {
  const auth = req.auth as AuthUser;
  const { zoneId, recordId } = req.params;
  const accountId = req.query.accountId as string | undefined;
  const label = req.query.label as string | undefined;
  try {
    const credentials = await getCredentials(auth.userId, accountId, label);
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
  const accountId = req.query.accountId as string | undefined;
  const label = req.query.label as string | undefined;
  try {
    const credentials = await getCredentials(auth.userId, accountId, label);
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
    const resolvedAccountId = await getAccountIdForCredentials(auth.userId, credentials, accountId);
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
  const accountId = req.query.accountId as string | undefined;
  const label = req.query.label as string | undefined;
  const bodySchema = z.object({
    files: z.array(z.string().url()).optional(),
  });
  try {
    const body = bodySchema.parse(req.body ?? {});
    const credentials = await getCredentials(auth.userId, accountId, label);
    if (body.files && body.files.length > 0) {
      await cloudflareService.purgeCacheByUrls(credentials, zoneId, body.files);
    } else {
      await cloudflareService.purgeCache(credentials, zoneId);
    }
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ detail: error.message || "Failed to purge cache" });
  }
});

// Security & Speed settings (always_use_https, automatic_https_rewrites, security_level, development_mode)
domainsRouter.get("/:zoneId/security", async (req, res) => {
  const auth = req.auth as AuthUser;
  const { zoneId } = req.params;
  const accountId = req.query.accountId as string | undefined;
  const label = req.query.label as string | undefined;
  try {
    const credentials = await getCredentials(auth.userId, accountId, label);
    const settings = await cloudflareService.getSecuritySettings(credentials, zoneId);
    res.json(settings);
  } catch (error: any) {
    res.status(500).json({ detail: error.message || "Failed to fetch security settings" });
  }
});

domainsRouter.patch("/:zoneId/security", async (req, res) => {
  const auth = req.auth as AuthUser;
  const { zoneId } = req.params;
  const accountId = req.query.accountId as string | undefined;
  const label = req.query.label as string | undefined;
  const onOff = z.enum(["on", "off"]);
  const bodySchema = z
    .object({
      always_use_https: onOff.optional(),
      automatic_https_rewrites: onOff.optional(),
      security_level: z
        .enum(["off", "essentially_off", "low", "medium", "high", "under_attack"])
        .optional(),
      development_mode: onOff.optional(),
    })
    .refine((v) => Object.keys(v).length > 0, { message: "No settings provided" });
  try {
    const body = bodySchema.parse(req.body);
    const credentials = await getCredentials(auth.userId, accountId, label);

    const entries = Object.entries(body) as [
      "always_use_https" | "automatic_https_rewrites" | "security_level" | "development_mode",
      string,
    ][];
    for (const [key, value] of entries) {
      await cloudflareService.updateZoneSetting(credentials, zoneId, key, value);
    }

    const settings = await cloudflareService.getSecuritySettings(credentials, zoneId);
    res.json(settings);
  } catch (error: any) {
    res.status(400).json({ detail: error.message || "Failed to update security settings" });
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
    const resolvedAccountId = await getAccountIdForCredentials(auth.userId, credentials, accountId);
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
    const resolvedAccountId = await getAccountIdForCredentials(auth.userId, credentials, accountId);
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
  const accountId = req.query.accountId as string | undefined;
  const label = req.query.label as string | undefined;
  try {
    const credentials = await getCredentials(auth.userId, accountId, label);
    const rules = await cloudflareService.listPageRules(credentials, zoneId);
    res.json(rules);
  } catch (error: any) {
    res.status(500).json({ detail: error.message || "Failed to fetch rules" });
  }
});

domainsRouter.put("/:zoneId/rules/:ruleId", async (req, res) => {
  const auth = req.auth as AuthUser;
  const { zoneId, ruleId } = req.params;
  const accountId = req.query.accountId as string | undefined;
  const label = req.query.label as string | undefined;
  const bodySchema = z.object({
    status: z.string().optional(),
    priority: z.number().optional(),
    targets: z.array(z.any()).optional(),
    actions: z.array(z.any()).optional(),
  });
  try {
    const body = bodySchema.parse(req.body);
    const credentials = await getCredentials(auth.userId, accountId, label);
    const rule = await cloudflareService.updatePageRule(credentials, zoneId, ruleId, body);
    res.json(rule);
  } catch (error: any) {
    res.status(400).json({ detail: error.message || "Failed to update rule" });
  }
});
