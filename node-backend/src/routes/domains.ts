import { Router } from "express";
import { isIP } from "node:net";
import { z } from "zod";

import { requireAuth, type AuthUser } from "../middleware/auth.js";
import { cloudflareService, type CloudflareCredentials, type DnsRecord } from "../services/cloudflare.js";
import { createJob } from "../services/jobRunner.js";
import { getCredentials } from "./cf.js";
import { configService } from "../services/configService.js";
import { createChangeSet, recordChangeSafe, type ChangeItemPayload } from "../services/changes.js";
import { collectZoneConfig, applyZoneConfig, summarizeApplySteps, type ApplyStepResult } from "../services/zoneConfig.js";
import { db } from "../services/db.js";
import { tagRules as tagRulesTable } from "../db/schema.js";
import { and, eq } from "drizzle-orm";
import { matchTagRules } from "../services/tags.js";
import { sendApiError } from "../utils/apiError.js";
import { isCloudflareError } from "../services/cloudflare.js";
import logger from "../utils/logger.js";

export const domainsRouter = Router();

domainsRouter.use(requireAuth);

// Look up a single DNS record's current state (used to snapshot "before" for change history)
async function findDnsRecord(
  credentials: CloudflareCredentials,
  zoneId: string,
  recordId: string,
): Promise<DnsRecord | null> {
  try {
    const records = await cloudflareService.listDnsRecords(credentials, zoneId);
    return records.find((record) => record.id === recordId) ?? null;
  } catch (error: any) {
    logger.warn("Failed to snapshot DNS record before mutation", { zoneId, recordId, error: error.message });
    return null;
  }
}

// Persist a change history entry; never let history failures break the primary operation
async function recordChangeSet(payload: {
  ownerId: string;
  accountId: string | null;
  zoneId: string;
  action: string;
  reversible: boolean;
  items: ChangeItemPayload[];
}): Promise<void> {
  try {
    await createChangeSet({
      ownerId: payload.ownerId,
      accountId: payload.accountId ?? undefined,
      zoneId: payload.zoneId,
      action: payload.action,
      status: "done",
      reversible: payload.reversible,
      finishedAt: new Date(),
      items: payload.items,
    });
  } catch (error: any) {
    logger.warn("Failed to record change set", { action: payload.action, zoneId: payload.zoneId, error: error.message });
  }
}

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

    // Users without any Cloudflare account should see an empty list, not a 500 error.
    await configService.loadConfig();
    const userAccounts = await configService.getAllAccounts(auth.userId);
    if (userAccounts.length === 0) {
      return res.json([]);
    }

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

    // Merge enabled rules for this user on read; never persist derived tags.
    try {
      const tagRules = await db.query.tagRules.findMany({
        where: and(eq(tagRulesTable.userId, auth.userId), eq(tagRulesTable.enabled, true)),
      });
      for (const zone of zones) {
        const matched = matchTagRules(tagRules, zone);
        if (matched.length > 0) {
          const saved: string[] = (zone as any).tags ?? [];
          (zone as any).tags = [...new Set([...saved, ...matched])];
        }
      }
    } catch (error: any) {
      logger.warn("Failed to apply auto-tag rules", { error: error.message });
    }

    // Fetch live SSL mode for zones that still lack it (saved settings only exist after the
    // user changes SSL through this tool). Fetch in parallel, capped to avoid rate limits.
    const zonesMissingSsl = zones.filter((zone) => !(zone as any).sslMode).slice(0, 10);
    await Promise.all(
      zonesMissingSsl.map(async (zone) => {
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
      }),
    );

    res.json(zones);
  } catch (error: any) {
    sendApiError(res, error, {
      status: 500,
      code: "DOMAINS_LIST_FAILED",
      detail: "Failed to fetch domains",
    });
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
    sendApiError(res, error, {
      status: 400,
      code: "DOMAIN_CREATE_FAILED",
      detail: "Failed to create domain",
    });
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
    sendApiError(res, error, {
      status: 400,
      code: "BULK_OPERATION_FAILED",
      detail: "Bulk operation failed",
    });
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
      return sendApiError(res, new Error(`Tên domain không hợp lệ: ${invalid.join(", ")}`), {
        status: 400,
        code: "DOMAIN_VALIDATION_FAILED",
        detail: "Domain validation failed",
      });
    }
    if (names.length === 0) {
      return sendApiError(res, new Error("Danh sách domain trống"), {
        status: 400,
        code: "DOMAIN_LIST_EMPTY",
        detail: "Domain list is empty",
      });
    }

    const credentials = await getCredentials(auth.userId, accountId, label);
    const resolvedAccountId = await getAccountIdForCredentials(auth.userId, credentials, accountId);

    // Resolve the Cloudflare account id once to avoid repeated listAccounts calls
    const cfAccounts = await cloudflareService.listAccounts(credentials);
    if (cfAccounts.length === 0) {
      return sendApiError(res, new Error("Không tìm thấy Cloudflare account để tạo zone"), {
        status: 400,
        code: "CLOUDFLARE_ACCOUNT_NOT_FOUND",
        detail: "No Cloudflare account available for zone creation",
      });
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
    sendApiError(res, error, {
      status: 400,
      code: "BULK_CREATE_FAILED",
      detail: "Bulk create failed",
    });
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
    sendApiError(res, error, {
      status: 400,
      code: "BULK_DNS_PREVIEW_FAILED",
      detail: "Preview failed",
    });
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
    sendApiError(res, error, {
      status: 400,
      code: "BULK_DNS_REPLACE_FAILED",
      detail: "Bulk DNS replace failed",
    });
  }
});

// Copy/clone accepts only the established component allowlist and safe path segments.
const configZoneIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const configHostnameSchema = z.string().trim().toLowerCase().min(1).max(253).refine((name) =>
  DOMAIN_NAME_REGEX.test(name) && isIP(name) === 0 && name.split(".").every((label) =>
    /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)), "Invalid domain name");
const configScopeSchema = z.object({
  accountId: z.string().trim().min(1).max(256).optional(),
  label: z.string().trim().min(1).max(256).optional(),
});
const configRequestFields = {
  sourceZoneId: configZoneIdSchema,
  sourceZoneName: configHostnameSchema,
  components: z.array(z.enum(["dns", "settings", "rules", "securityRules", "pageRules"])).min(1).max(5)
    .transform((items) => [...new Set(items)]),
  dnsMode: z.enum(["skip", "overwrite"]).default("skip"),
};

class ZoneConfigRequestError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}

async function resolveConfigScope(userId: string, query: unknown) {
  const scope = configScopeSchema.parse(query);
  // Resolve the exact saved account once, including token-only and label/default scopes.
  // Never fall back to another tenant/account when an explicit selection is invalid.
  const account = scope.accountId
    ? await configService.getAccountById(scope.accountId, userId)
    : scope.label
      ? await configService.getAccountByLabel(scope.label, userId)
      : (await configService.getAllAccounts(userId)).find((candidate) => candidate.isActive);
  if (!account?.isActive || (scope.label && scope.label !== account.label)) {
    throw new ZoneConfigRequestError(403, "ACCOUNT_FORBIDDEN", "An active owned Cloudflare account is required");
  }
  return { accountId: account.id, credentials: await getCredentials(userId, account.id) };
}

async function verifyConfigZone(credentials: CloudflareCredentials, zoneId: string, zoneName: string) {
  const zone = await cloudflareService.getZoneDetails(credentials, zoneId);
  if (zone.id !== zoneId || zone.name.toLowerCase() !== zoneName) {
    throw new ZoneConfigRequestError(400, "ZONE_NAME_MISMATCH", "Zone ID and hostname do not match");
  }
  return zone;
}

// The generic runner retries rejected workers. Copy/clone writes are additive and
// non-idempotent: cache each attempt (including rejection) within this job instead
// of creating duplicate rules/zones on those retries. Preserve partial step results.
function createConfigJob(
  type: string, ownerId: string, inputs: Array<{ key: string; label: string }>,
  worker: (item: { key: string; label?: string }) => Promise<{ steps: ApplyStepResult[]; [key: string]: unknown }>,
) {
  const attempts = new Map<string, Promise<{ steps: ApplyStepResult[]; [key: string]: unknown }>>();
  let job: ReturnType<typeof createJob> | undefined;
  job = createJob(type, ownerId, inputs, (item) => {
    let attempt = attempts.get(item.key);
    if (!attempt) {
      attempt = worker(item).then((result) => {
        const errors = result.steps.filter((step) => step.status === "error");
        if (errors.length > 0) {
          const jobItem = job?.items.find((entry) => entry.key === item.key);
          if (jobItem) jobItem.result = result;
          throw new Error(errors.map((step) => `${step.step}: ${step.detail ?? "Failed"}`).join("; "));
        }
        return result;
      });
      attempts.set(item.key, attempt);
    }
    return attempt;
  });
  return job;
}

domainsRouter.post("/copy-config", async (req, res) => {
  const auth = req.auth as AuthUser;
  try {
    const body = z.object({
      ...configRequestFields,
      targets: z.array(z.object({ zoneId: configZoneIdSchema, zoneName: configHostnameSchema }).strict()).min(1).max(100),
    }).strict().parse(req.body);
    const targetIds = body.targets.map((target) => target.zoneId);
    if (targetIds.includes(body.sourceZoneId) || new Set(targetIds).size !== targetIds.length) {
      throw new ZoneConfigRequestError(400, "COPY_TARGETS_INVALID", "Targets must be distinct and must not include the source");
    }
    const { accountId, credentials } = await resolveConfigScope(auth.userId, req.query);
    await verifyConfigZone(credentials, body.sourceZoneId, body.sourceZoneName);
    // Preflight every target under these credentials before creating any mutation job.
    for (const target of body.targets) await verifyConfigZone(credentials, target.zoneId, target.zoneName);
    const snapshot = await collectZoneConfig(credentials, body.sourceZoneId, body.sourceZoneName, body.components);
    const job = createConfigJob("copy-config", auth.userId,
      body.targets.map((target) => ({ key: target.zoneId, label: target.zoneName })), async (item) => {
        const target = body.targets.find((candidate) => candidate.zoneId === item.key)!;
        const steps = await applyZoneConfig(credentials, target, snapshot, body.sourceZoneName, {
          dnsMode: body.dnsMode, components: body.components,
        });
        await recordChangeSafe({
          ownerId: auth.userId, accountId, zoneId: target.zoneId, action: "config.copy",
          status: steps.some((step) => step.status === "error") ? "error" : "done",
          items: [{ resourceType: "zone_config", resourceId: target.zoneId,
            after: { source: body.sourceZoneName, components: body.components, steps: summarizeApplySteps(steps) } }],
        });
        return { zoneId: target.zoneId, steps };
      });
    res.status(202).json({ jobId: job.id });
  } catch (error) {
    sendApiError(res, error, {
      status: error instanceof ZoneConfigRequestError ? error.status : 400,
      code: error instanceof ZoneConfigRequestError ? error.code : "COPY_CONFIG_FAILED",
      detail: "Copy config failed",
    });
  }
});

domainsRouter.post("/clone", async (req, res) => {
  const auth = req.auth as AuthUser;
  try {
    const body = z.object({ ...configRequestFields, newDomains: z.array(z.string().max(1024)).min(1).max(50) }).strict().parse(req.body);
    const names = [...new Set(body.newDomains.map((name) => name.trim().toLowerCase()).filter(Boolean))];
    if (names.length === 0) throw new ZoneConfigRequestError(400, "DOMAIN_LIST_EMPTY", "Domain list is empty");
    if (names.some((name) => !configHostnameSchema.safeParse(name).success)) {
      throw new ZoneConfigRequestError(400, "DOMAIN_VALIDATION_FAILED", "Invalid new domain name");
    }
    if (names.includes(body.sourceZoneName)) {
      throw new ZoneConfigRequestError(400, "DOMAIN_VALIDATION_FAILED", "Cannot clone a zone onto itself");
    }
    const { accountId, credentials } = await resolveConfigScope(auth.userId, req.query);
    const source = await verifyConfigZone(credentials, body.sourceZoneId, body.sourceZoneName);
    // A credential may access multiple CF accounts. Use the source account, never
    // accounts[0], and fail closed if the upstream zone omitted its account identity.
    if (!source.accountId || !/^[a-f0-9]{32}$/i.test(source.accountId)) {
      throw new ZoneConfigRequestError(400, "CLOUDFLARE_ACCOUNT_NOT_FOUND", "Source zone account is unavailable");
    }
    const cfAccountId = source.accountId;
    const snapshot = await collectZoneConfig(credentials, body.sourceZoneId, body.sourceZoneName, body.components);
    let sourceTags: string[] | undefined;
    try {
      sourceTags = (await configService.getDomainByZoneId(accountId, body.sourceZoneId))?.settings?.tags;
    } catch (error: any) {
      logger.warn("Failed to read source domain tags for clone", { error: error.message });
    }
    const job = createConfigJob("clone-domain", auth.userId, names.map((name) => ({ key: name, label: name })), async (item) => {
      const zone = await cloudflareService.createZone(credentials, item.key, cfAccountId, false);
      // Sync immediately after creation: even a partially applied clone remains discoverable.
      try {
        const existing = await configService.getDomainByZoneId(accountId, zone.id);
        if (!existing) {
          await configService.addDomain(accountId, {
            name: zone.name, zoneId: zone.id, status: zone.status,
            settings: sourceTags?.length ? { tags: sourceTags } : undefined,
          });
        } else if (sourceTags?.length) {
          await configService.updateDomainSettings(accountId, existing.id, { tags: sourceTags });
        }
      } catch (error: any) {
        logger.warn("Failed to sync cloned zone to config", { zoneId: zone.id, error: error.message });
      }
      const steps = await applyZoneConfig(credentials, { zoneId: zone.id, zoneName: zone.name }, snapshot, body.sourceZoneName, {
        dnsMode: body.dnsMode, components: body.components,
      });
      await recordChangeSafe({
        ownerId: auth.userId, accountId, zoneId: zone.id, action: "domain.clone",
        status: steps.some((step) => step.status === "error") ? "error" : "done",
        items: [{ resourceType: "zone_config", resourceId: zone.id,
          after: { source: body.sourceZoneName, components: body.components, steps: summarizeApplySteps(steps) } }],
      });
      // Same result contract as bulk-create: the shared nameserver table/CSV
      // expects name, status and camel-case nameServers. Keep the old alias.
      return { name: zone.name, zoneId: zone.id, status: zone.status,
        nameServers: zone.nameServers || [], nameservers: zone.nameServers || [], steps };
    });
    res.status(202).json({ jobId: job.id });
  } catch (error) {
    sendApiError(res, error, {
      status: error instanceof ZoneConfigRequestError ? error.status : 400,
      code: error instanceof ZoneConfigRequestError ? error.code : "CLONE_DOMAIN_FAILED",
      detail: "Clone domain failed",
    });
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
    sendApiError(res, error, {
      status: 500,
      code: "DOMAIN_DETAIL_FAILED",
      detail: "Failed to fetch domain details",
    });
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
    sendApiError(res, error, {
      status: 400,
      code: "DOMAIN_DELETE_FAILED",
      detail: "Failed to delete domain",
    });
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
      return sendApiError(res, new Error("Account not found"), {
        status: 404,
        code: "ACCOUNT_NOT_FOUND",
        detail: "Account not found",
      });
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
    sendApiError(res, error, {
      status: 400,
      code: "DOMAIN_TAGS_UPDATE_FAILED",
      detail: "Failed to update tags",
    });
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
    sendApiError(res, error, {
      status: 500,
      code: "DNS_LIST_FAILED",
      detail: "Failed to fetch DNS records",
    });
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

    await recordChangeSet({
      ownerId: auth.userId,
      accountId: await getAccountIdForCredentials(auth.userId, credentials, accountId),
      zoneId,
      action: "dns.create",
      reversible: true,
      items: [
        {
          resourceType: "dns_record",
          resourceId: record.id,
          before: undefined,
          after: record,
        },
      ],
    });

    res.status(201).json(record);
  } catch (error: any) {
    sendApiError(res, error, {
      status: 400,
      code: "DNS_CREATE_FAILED",
      detail: "Failed to create DNS record",
    });
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
    const before = await findDnsRecord(credentials, zoneId, recordId);
    const record = await cloudflareService.updateDnsRecord(credentials, zoneId, recordId, body);

    await recordChangeSet({
      ownerId: auth.userId,
      accountId: await getAccountIdForCredentials(auth.userId, credentials, accountId),
      zoneId,
      action: "dns.update",
      reversible: before !== null,
      items: [
        {
          resourceType: "dns_record",
          resourceId: recordId,
          before: before ?? undefined,
          after: record,
        },
      ],
    });

    res.json(record);
  } catch (error: any) {
    sendApiError(res, error, {
      status: 400,
      code: "DNS_UPDATE_FAILED",
      detail: "Failed to update DNS record",
    });
  }
});

domainsRouter.delete("/:zoneId/dns/:recordId", async (req, res) => {
  const auth = req.auth as AuthUser;
  const { zoneId, recordId } = req.params;
  const accountId = req.query.accountId as string | undefined;
  const label = req.query.label as string | undefined;
  try {
    const credentials = await getCredentials(auth.userId, accountId, label);
    const before = await findDnsRecord(credentials, zoneId, recordId);
    await cloudflareService.deleteDnsRecord(credentials, zoneId, recordId);

    await recordChangeSet({
      ownerId: auth.userId,
      accountId: await getAccountIdForCredentials(auth.userId, credentials, accountId),
      zoneId,
      action: "dns.delete",
      reversible: before !== null,
      items: [
        {
          resourceType: "dns_record",
          resourceId: recordId,
          before: before ?? undefined,
          after: undefined,
        },
      ],
    });

    res.status(204).send();
  } catch (error: any) {
    sendApiError(res, error, {
      status: 400,
      code: "DNS_DELETE_FAILED",
      detail: "Failed to delete DNS record",
    });
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
    sendApiError(res, error, {
      status: 500,
      code: "CACHE_SETTINGS_READ_FAILED",
      detail: "Failed to fetch cache settings",
    });
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
    const beforeSettings = await cloudflareService.getCacheSettings(credentials, zoneId).catch(() => null);
    const settings = await cloudflareService.updateCacheSettings(credentials, zoneId, body);

    await recordChangeSet({
      ownerId: auth.userId,
      accountId: await getAccountIdForCredentials(auth.userId, credentials, accountId),
      zoneId,
      action: "cache.update",
      reversible: beforeSettings !== null,
      items: [
        {
          resourceType: "zone_cache_config",
          resourceId: zoneId,
          before: beforeSettings ?? undefined,
          after: settings,
        },
      ],
    });

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
    sendApiError(res, error, {
      status: 400,
      code: "CACHE_SETTINGS_UPDATE_FAILED",
      detail: "Failed to update cache settings",
    });
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
    sendApiError(res, error, {
      status: 400,
      code: "CACHE_PURGE_FAILED",
      detail: "Failed to purge cache",
    });
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
    sendApiError(res, error, {
      status: 500,
      code: "SECURITY_SETTINGS_READ_FAILED",
      detail: "Failed to fetch security settings",
    });
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
    sendApiError(res, error, {
      status: 400,
      code: "SECURITY_SETTINGS_UPDATE_FAILED",
      detail: "Failed to update security settings",
    });
  }
});

// IP Access Rules (restored zone-level firewall API).
const accessRuleModeSchema = z.enum(["block", "challenge", "whitelist", "js_challenge", "managed_challenge"]);
const accessRuleTargetSchema = z.enum(["ip", "ip_range", "country", "asn"]);

function normalizeAccessRuleValue(target: z.infer<typeof accessRuleTargetSchema>, value: string): string | null {
  const trimmed = value.trim();
  switch (target) {
    case "ip": return !trimmed.includes("%") && isIP(trimmed) !== 0 ? trimmed : null;
    case "country": return /^[a-z]{2}$/i.test(trimmed) ? trimmed.toUpperCase() : null;
    case "asn": return /^AS\d+$/i.test(trimmed) ? trimmed.toUpperCase() : null;
    case "ip_range": {
      const [address, prefix, extra] = trimmed.split("/");
      const version = isIP(address);
      return version && !address.includes("%") && extra === undefined && /^\d{1,3}$/.test(prefix ?? "") &&
        Number(prefix) <= (version === 4 ? 32 : 128) ? trimmed : null;
    }
  }
}

domainsRouter.get("/:zoneId/access-rules", async (req, res) => {
  const auth = req.auth as AuthUser;
  try {
    const zoneId = configZoneIdSchema.parse(req.params.zoneId);
    const scope = configScopeSchema.parse(req.query);
    const credentials = await getCredentials(auth.userId, scope.accountId, scope.label);
    res.json({ rules: await cloudflareService.listAccessRules(credentials, zoneId) });
  } catch (error) {
    sendApiError(res, error, { status: error instanceof z.ZodError ? 400 : 500,
      code: "ACCESS_RULES_LIST_FAILED", detail: "Failed to fetch access rules" });
  }
});

domainsRouter.post("/:zoneId/access-rules", async (req, res) => {
  const auth = req.auth as AuthUser;
  try {
    const zoneId = configZoneIdSchema.parse(req.params.zoneId);
    const scope = configScopeSchema.parse(req.query);
    const body = z.object({ mode: accessRuleModeSchema, target: accessRuleTargetSchema,
      value: z.string().min(1).max(100), notes: z.string().max(200).optional() }).strict().parse(req.body);
    const value = normalizeAccessRuleValue(body.target, body.value);
    if (value === null) {
      return sendApiError(res, new Error("Invalid access rule value"), {
        status: 400, code: "ACCESS_RULE_INVALID_VALUE", detail: "Invalid access rule value",
      });
    }
    const credentials = await getCredentials(auth.userId, scope.accountId, scope.label);
    const rule = await cloudflareService.createAccessRule(credentials, zoneId, {
      mode: body.mode, configuration: { target: body.target, value }, notes: body.notes,
    });
    await recordChangeSet({
      ownerId: auth.userId, accountId: await getAccountIdForCredentials(auth.userId, credentials, scope.accountId),
      zoneId, action: "access_rule.create", reversible: false,
      items: [{ resourceType: "access_rule", resourceId: rule.id, after: rule }],
    });
    res.status(201).json(rule);
  } catch (error) {
    sendApiError(res, error, { status: 400, code: "ACCESS_RULE_CREATE_FAILED", detail: "Failed to create access rule" });
  }
});

domainsRouter.patch("/:zoneId/access-rules/:ruleId", async (req, res) => {
  const auth = req.auth as AuthUser;
  try {
    const zoneId = configZoneIdSchema.parse(req.params.zoneId);
    const ruleId = configZoneIdSchema.parse(req.params.ruleId);
    const scope = configScopeSchema.parse(req.query);
    const body = z.object({ mode: accessRuleModeSchema.optional(), notes: z.string().max(200).optional() })
      .strict().refine((value) => Object.keys(value).length > 0, "No updates provided").parse(req.body);
    const credentials = await getCredentials(auth.userId, scope.accountId, scope.label);
    res.json(await cloudflareService.updateAccessRule(credentials, zoneId, ruleId, body));
  } catch (error) {
    sendApiError(res, error, { status: 400, code: "ACCESS_RULE_UPDATE_FAILED", detail: "Failed to update access rule" });
  }
});

domainsRouter.delete("/:zoneId/access-rules/:ruleId", async (req, res) => {
  const auth = req.auth as AuthUser;
  try {
    const zoneId = configZoneIdSchema.parse(req.params.zoneId);
    const ruleId = configZoneIdSchema.parse(req.params.ruleId);
    const scope = configScopeSchema.parse(req.query);
    const credentials = await getCredentials(auth.userId, scope.accountId, scope.label);
    await cloudflareService.deleteAccessRule(credentials, zoneId, ruleId);
    await recordChangeSet({
      ownerId: auth.userId, accountId: await getAccountIdForCredentials(auth.userId, credentials, scope.accountId),
      zoneId, action: "access_rule.delete", reversible: false,
      items: [{ resourceType: "access_rule", resourceId: ruleId }],
    });
    res.status(204).send();
  } catch (error) {
    sendApiError(res, error, { status: 400, code: "ACCESS_RULE_DELETE_FAILED", detail: "Failed to delete access rule" });
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
    sendApiError(res, error, {
      status: 500,
      code: "SSL_SETTINGS_READ_FAILED",
      detail: "Failed to fetch SSL settings",
    });
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
    const beforeSsl = await cloudflareService.getSslMode(credentials, zoneId).catch(() => null);
    const sslSettings = await cloudflareService.updateSslMode(credentials, zoneId, body.mode);

    await recordChangeSet({
      ownerId: auth.userId,
      accountId: await getAccountIdForCredentials(auth.userId, credentials, accountId),
      zoneId,
      action: "ssl.update",
      reversible: beforeSsl !== null,
      items: [
        {
          resourceType: "zone_setting_ssl",
          resourceId: zoneId,
          before: beforeSsl ?? undefined,
          after: sslSettings,
        },
      ],
    });

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
    sendApiError(res, error, {
      status: 400,
      code: "SSL_SETTINGS_UPDATE_FAILED",
      detail: "Failed to update SSL settings",
    });
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
    res.json({ ...tieredCache, available: true });
  } catch (error: any) {
    // Token lacks the tiered cache permission (or plan doesn't include it):
    // degrade gracefully so the UI can disable the control instead of erroring.
    if (isCloudflareError(error) && (error.status === 403 || error.status === 401)) {
      res.json({ topology: null, available: false });
      return;
    }
    sendApiError(res, error, {
      status: 500,
      code: "TIERED_CACHE_READ_FAILED",
      detail: "Failed to fetch tiered cache topology",
    });
  }
});

domainsRouter.patch("/:zoneId/tiered-cache", async (req, res) => {
  const auth = req.auth as AuthUser;
  const { zoneId } = req.params;
  const accountId = req.query.accountId as string | undefined;
  const label = req.query.label as string | undefined;
  const bodySchema = z.object({
    topology: z.enum(["off", "smart", "generic"]),
  });
  try {
    const body = bodySchema.parse(req.body);
    const credentials = await getCredentials(auth.userId, accountId, label);

    // Generic Global topology is Enterprise-only; verify the zone plan before calling Cloudflare.
    if (body.topology === "generic") {
      try {
        const zone = await cloudflareService.getZoneDetails(credentials, zoneId);
        if (zone.plan && zone.plan !== "enterprise") {
          res.status(403).json({
            code: "PLAN_UPGRADE_REQUIRED",
            detail: "Generic Global Tiered Cache requires an Enterprise plan",
            retryable: false,
            requiredPermission: null,
            planRequirement: "enterprise",
            cf: null,
          });
          return;
        }
      } catch {
        // If the plan check fails, let Cloudflare decide.
      }
    }

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

    res.json({ ...tieredCache, available: true });
  } catch (error: any) {
    sendApiError(res, error, {
      status: 400,
      code: "TIERED_CACHE_UPDATE_FAILED",
      detail: "Failed to update tiered cache topology",
    });
  }
});

// Rules (Page Rules)
const pageRuleTargetSchema = z.object({
  target: z.literal("url"),
  constraint: z.object({
    operator: z.enum(["matches", "contains", "equals", "not_equal", "not_contain"]),
    value: z.string().min(1),
  }),
});

const pageRuleActionSchema = z.object({
  id: z.string().min(1),
  value: z.unknown().optional(),
});

const pageRuleStatusSchema = z.enum(["active", "disabled"]);

const createPageRuleBodySchema = z.object({
  targets: z.array(pageRuleTargetSchema).min(1),
  actions: z.array(pageRuleActionSchema).min(1),
  priority: z.number().int().nonnegative().optional(),
  status: pageRuleStatusSchema.optional(),
});

const updatePageRuleBodySchema = z.object({
  status: pageRuleStatusSchema.optional(),
  priority: z.number().int().nonnegative().optional(),
  targets: z.array(pageRuleTargetSchema).min(1).optional(),
  actions: z.array(pageRuleActionSchema).min(1).optional(),
});

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
    sendApiError(res, error, {
      status: 500,
      code: "RULES_LIST_FAILED",
      detail: "Failed to fetch rules",
    });
  }
});

domainsRouter.post("/:zoneId/rules", async (req, res) => {
  const auth = req.auth as AuthUser;
  const { zoneId } = req.params;
  const accountId = req.query.accountId as string | undefined;
  const label = req.query.label as string | undefined;
  try {
    const body = createPageRuleBodySchema.parse(req.body);
    const credentials = await getCredentials(auth.userId, accountId, label);
    const rule = await cloudflareService.createPageRule(credentials, zoneId, {
      targets: body.targets,
      actions: body.actions,
      priority: body.priority ?? 1,
      status: body.status ?? "active",
    });
    res.status(201).json(rule);
  } catch (error: any) {
    sendApiError(res, error, {
      status: 400,
      code: "RULE_CREATE_FAILED",
      detail: "Failed to create rule",
    });
  }
});

domainsRouter.put("/:zoneId/rules/:ruleId", async (req, res) => {
  const auth = req.auth as AuthUser;
  const { zoneId, ruleId } = req.params;
  const accountId = req.query.accountId as string | undefined;
  const label = req.query.label as string | undefined;
  try {
    const body = updatePageRuleBodySchema.parse(req.body);
    const credentials = await getCredentials(auth.userId, accountId, label);
    const rule = await cloudflareService.updatePageRule(credentials, zoneId, ruleId, body);
    res.json(rule);
  } catch (error: any) {
    sendApiError(res, error, {
      status: 400,
      code: "RULE_UPDATE_FAILED",
      detail: "Failed to update rule",
    });
  }
});

domainsRouter.delete("/:zoneId/rules/:ruleId", async (req, res) => {
  const auth = req.auth as AuthUser;
  const { zoneId, ruleId } = req.params;
  const accountId = req.query.accountId as string | undefined;
  const label = req.query.label as string | undefined;
  try {
    const credentials = await getCredentials(auth.userId, accountId, label);
    await cloudflareService.deletePageRule(credentials, zoneId, ruleId);
    res.status(204).send();
  } catch (error: any) {
    sendApiError(res, error, {
      status: 400,
      code: "RULE_DELETE_FAILED",
      detail: "Failed to delete rule",
    });
  }
});
