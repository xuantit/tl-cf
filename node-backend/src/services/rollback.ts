import { cloudflareService, type CloudflareCredentials, type DnsRecord } from "./cloudflare.js";

export type RollbackOperationResult = {
  resourceType: string;
  resourceId: string;
  action: string;
  status: "success" | "error" | "skipped";
  error?: string;
};

type RollbackChangeItem = {
  resourceType: string;
  resourceId: string;
  before?: unknown;
  after?: unknown;
};

type RollbackChangeSet = {
  zoneId?: string | null;
  items: RollbackChangeItem[];
};

type SslSnapshot = { mode?: "off" | "flexible" | "full" | "strict" | string };
type CacheSnapshot = {
  cache_level?: string;
  browser_cache_ttl?: number;
  tiered_cache_topology?: string;
};

// Execute rollback for a change set: DNS records, SSL mode, and cache configuration.
// Recreate deleted records, restore updated records, and delete records that were created.
export async function executeDnsRollback(
  changeSet: RollbackChangeSet,
  credentials: CloudflareCredentials,
): Promise<RollbackOperationResult[]> {
  const zoneId = changeSet.zoneId;
  const results: RollbackOperationResult[] = [];

  if (!zoneId) {
    return changeSet.items.map((item) => ({
      resourceType: item.resourceType,
      resourceId: item.resourceId,
      action: "skipped",
      status: "skipped" as const,
      error: "Missing zoneId",
    }));
  }

  for (const item of changeSet.items) {
    if (item.resourceType === "zone_setting_ssl") {
      results.push(await rollbackSslItem(item, credentials, zoneId));
      continue;
    }
    if (item.resourceType === "zone_cache_config") {
      results.push(await rollbackCacheItem(item, credentials, zoneId));
      continue;
    }
    if (item.resourceType !== "dns_record") {
      results.push({
        resourceType: item.resourceType,
        resourceId: item.resourceId,
        action: "skipped",
        status: "skipped",
        error: "Unsupported resource type for rollback",
      });
      continue;
    }

    const before = (item.before as DnsRecord | null | undefined) ?? null;
    const after = (item.after as DnsRecord | null | undefined) ?? null;

    try {
      if (before && after) {
        // Updated record -> restore previous state
        await cloudflareService.updateDnsRecord(credentials, zoneId, item.resourceId, {
          type: before.type,
          name: before.name,
          content: before.content,
          ttl: before.ttl,
          proxied: before.proxied,
          priority: before.priority,
        });
        results.push({ resourceType: item.resourceType, resourceId: item.resourceId, action: "restore", status: "success" });
      } else if (before && !after) {
        // Deleted record -> recreate it
        await cloudflareService.createDnsRecord(credentials, zoneId, {
          type: before.type,
          name: before.name,
          content: before.content,
          ttl: before.ttl,
          proxied: before.proxied,
          priority: before.priority,
        });
        results.push({ resourceType: item.resourceType, resourceId: item.resourceId, action: "recreate", status: "success" });
      } else if (!before && after) {
        // Created record -> delete it
        await cloudflareService.deleteDnsRecord(credentials, zoneId, item.resourceId);
        results.push({ resourceType: item.resourceType, resourceId: item.resourceId, action: "delete_created", status: "success" });
      } else {
        results.push({
          resourceType: item.resourceType,
          resourceId: item.resourceId,
          action: "skipped",
          status: "skipped",
          error: "No snapshot available",
        });
      }
    } catch (error: any) {
      results.push({
        resourceType: item.resourceType,
        resourceId: item.resourceId,
        action: "error",
        status: "error",
        error: error?.message || "Rollback operation failed",
      });
    }
  }

  return results;
}

async function rollbackSslItem(
  item: RollbackChangeItem,
  credentials: CloudflareCredentials,
  zoneId: string,
): Promise<RollbackOperationResult> {
  const before = item.before as SslSnapshot | null | undefined;
  const mode = before?.mode;
  if (!mode || !["off", "flexible", "full", "strict"].includes(mode)) {
    return {
      resourceType: item.resourceType,
      resourceId: item.resourceId,
      action: "skipped",
      status: "skipped",
      error: "No previous SSL mode to restore",
    };
  }
  try {
    await cloudflareService.updateSslMode(credentials, zoneId, mode as "off" | "flexible" | "full" | "strict");
    return { resourceType: item.resourceType, resourceId: item.resourceId, action: "restore", status: "success" };
  } catch (error: any) {
    return {
      resourceType: item.resourceType,
      resourceId: item.resourceId,
      action: "error",
      status: "error",
      error: error?.message || "Rollback operation failed",
    };
  }
}

async function rollbackCacheItem(
  item: RollbackChangeItem,
  credentials: CloudflareCredentials,
  zoneId: string,
): Promise<RollbackOperationResult> {
  const before = item.before as CacheSnapshot | null | undefined;
  if (!before) {
    return {
      resourceType: item.resourceType,
      resourceId: item.resourceId,
      action: "skipped",
      status: "skipped",
      error: "No previous cache settings to restore",
    };
  }
  try {
    await cloudflareService.updateCacheSettings(credentials, zoneId, {
      cache_level: before.cache_level,
      browser_cache_ttl: before.browser_cache_ttl,
      tiered_cache_topology: before.tiered_cache_topology,
    });
    return { resourceType: item.resourceType, resourceId: item.resourceId, action: "restore", status: "success" };
  } catch (error: any) {
    return {
      resourceType: item.resourceType,
      resourceId: item.resourceId,
      action: "error",
      status: "error",
      error: error?.message || "Rollback operation failed",
    };
  }
}

