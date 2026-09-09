import {
  cloudflareService,
  defaultActionForKind,
  rulePhaseForKind,
  type CloudflareCredentials,
  type DnsRecord,
  type PageRule,
  type RuleKind,
  type RulesetRule,
} from "./cloudflare.js";
import logger from "../utils/logger.js";

export type ZoneConfigComponent = "dns" | "settings" | "rules" | "securityRules" | "pageRules";

export const ZONE_CONFIG_COMPONENTS: ZoneConfigComponent[] = ["dns", "settings", "rules", "securityRules", "pageRules"];

// "rules" = redirect/cache/configuration; "securityRules" = WAF custom rules (tách riêng để user chọn)
const RULE_KINDS_BY_COMPONENT: Partial<Record<ZoneConfigComponent, RuleKind[]>> = {
  rules: ["redirect", "cache", "configuration"],
  securityRules: ["security"],
};

function ruleKindsFor(components: ZoneConfigComponent[]): RuleKind[] {
  return components.flatMap((c) => RULE_KINDS_BY_COMPONENT[c] ?? []);
}

export interface ZoneConfigSettings {
  sslMode: string | null;
  cacheLevel: string | null;
  browserCacheTtl: number | null;
  alwaysUseHttps: string | null;
  automaticHttpsRewrites: string | null;
  securityLevel: string | null;
}

export interface ZoneConfigSnapshot {
  sourceZoneId: string;
  sourceZoneName: string;
  dnsRecords: DnsRecord[];
  settings: ZoneConfigSettings | null;
  rules: Partial<Record<RuleKind, RulesetRule[]>>;
  pageRules: PageRule[];
}

export interface ApplyStepResult {
  step: string;
  status: "success" | "error" | "skipped";
  detail?: string;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Replace every occurrence of sourceZone with targetZone in a string.
 *
 * Semantics (boundary-safe plain-string replacement):
 * - Case-insensitive match on sourceZone.
 * - A match must NOT be preceded or followed by a hostname-label character
 *   ([A-Za-z0-9-]), so "notsource.com" is never mangled when source is
 *   "source.com", while "www.source.com" (preceded by ".") is replaced.
 * - Non-hostname contexts (quotes, "/", "=", start/end of string) count as
 *   boundaries, so URLs and rule expressions are substituted too.
 */
export function substituteHostname(value: string, sourceZone: string, targetZone: string): string {
  if (!value || !sourceZone || sourceZone === targetZone) return value;
  const pattern = new RegExp(`(^|[^A-Za-z0-9-])${escapeRegExp(sourceZone)}(?![A-Za-z0-9-])`, "gi");
  return value.replace(pattern, (_match, prefix: string) => `${prefix}${targetZone}`);
}

/** substituteHostname over a JSON-serializable object (stringify → replace → parse). */
function substituteInJson<T>(value: T, sourceZone: string, targetZone: string): T {
  return JSON.parse(substituteHostname(JSON.stringify(value), sourceZone, targetZone)) as T;
}

function errorMessage(error: unknown): string {
  return (error as Error)?.message || "Unknown error";
}

/** Read the configured components from the source zone. Throws on hard failures (DNS/rules/pageRules). */
export async function collectZoneConfig(
  credentials: CloudflareCredentials,
  zoneId: string,
  zoneName: string,
  components: ZoneConfigComponent[],
): Promise<ZoneConfigSnapshot> {
  const snapshot: ZoneConfigSnapshot = {
    sourceZoneId: zoneId,
    sourceZoneName: zoneName,
    dnsRecords: [],
    settings: null,
    rules: {},
    pageRules: [],
  };

  if (components.includes("dns")) {
    snapshot.dnsRecords = await cloudflareService.listDnsRecords(credentials, zoneId);
  }

  if (components.includes("settings")) {
    const settings: ZoneConfigSettings = {
      sslMode: null,
      cacheLevel: null,
      browserCacheTtl: null,
      alwaysUseHttps: null,
      automaticHttpsRewrites: null,
      securityLevel: null,
    };
    // Each read is tolerant: an unreadable setting stays null and is skipped on apply.
    try {
      settings.sslMode = (await cloudflareService.getSslMode(credentials, zoneId)).mode ?? null;
    } catch (error) {
      logger.warn("collectZoneConfig: failed to read SSL mode", { zoneId, error: errorMessage(error) });
    }
    try {
      const cache = await cloudflareService.getCacheSettings(credentials, zoneId);
      settings.cacheLevel = cache.cache_level ?? null;
      settings.browserCacheTtl = cache.browser_cache_ttl ?? null;
    } catch (error) {
      logger.warn("collectZoneConfig: failed to read cache settings", { zoneId, error: errorMessage(error) });
    }
    try {
      const security = await cloudflareService.getSecuritySettings(credentials, zoneId);
      settings.alwaysUseHttps = security.always_use_https ?? null;
      settings.automaticHttpsRewrites = security.automatic_https_rewrites ?? null;
      settings.securityLevel = security.security_level ?? null;
    } catch (error) {
      logger.warn("collectZoneConfig: failed to read security settings", { zoneId, error: errorMessage(error) });
    }
    snapshot.settings = settings;
  }

  const ruleKinds = ruleKindsFor(components);
  for (const kind of ruleKinds) {
    const result = await cloudflareService.getRulesetRules(credentials, zoneId, rulePhaseForKind(kind));
    snapshot.rules[kind] = result.rules;
  }

  if (components.includes("pageRules")) {
    snapshot.pageRules = await cloudflareService.listPageRules(credentials, zoneId);
  }

  return snapshot;
}

function dnsKey(type: string, name: string): string {
  return `${type.toUpperCase()}|${name.toLowerCase()}`;
}

async function applyDns(
  credentials: CloudflareCredentials,
  target: { zoneId: string; zoneName: string },
  snapshot: ZoneConfigSnapshot,
  sourceZoneName: string,
  dnsMode: "skip" | "overwrite",
): Promise<ApplyStepResult> {
  const records = snapshot.dnsRecords.filter((r) => r.type !== "NS" && r.type !== "SOA");
  if (records.length === 0) {
    return { step: "dns", status: "skipped", detail: "No DNS records to copy" };
  }

  let existingByKey: Map<string, DnsRecord[]>;
  try {
    const existing = await cloudflareService.listDnsRecords(credentials, target.zoneId);
    existingByKey = new Map();
    for (const record of existing) {
      const key = dnsKey(record.type, record.name);
      const list = existingByKey.get(key) ?? [];
      list.push(record);
      existingByKey.set(key, list);
    }
  } catch (error) {
    return { step: "dns", status: "error", detail: `Failed to list target DNS records: ${errorMessage(error)}` };
  }

  let created = 0;
  let skipped = 0;
  const errors: string[] = [];
  const deletedKeys = new Set<string>();

  for (const record of records) {
    const name = substituteHostname(record.name, sourceZoneName, target.zoneName);
    const content = substituteHostname(record.content, sourceZoneName, target.zoneName);
    const key = dnsKey(record.type, name);
    const conflicts = existingByKey.get(key) ?? [];
    try {
      if (conflicts.length > 0) {
        if (dnsMode === "skip") {
          skipped += 1;
          continue;
        }
        // overwrite: delete every existing record with the same type+name once, then create.
        if (!deletedKeys.has(key)) {
          deletedKeys.add(key);
          for (const conflict of conflicts) {
            await cloudflareService.deleteDnsRecord(credentials, target.zoneId, conflict.id);
          }
        }
      }
      await cloudflareService.createDnsRecord(credentials, target.zoneId, {
        type: record.type,
        name,
        content,
        ttl: record.ttl,
        proxied: record.proxied,
        priority: record.priority,
      });
      created += 1;
    } catch (error) {
      errors.push(`${record.type} ${name}: ${errorMessage(error)}`);
    }
  }

  const summary = `created ${created}, skipped ${skipped}, errors ${errors.length}`;
  if (errors.length > 0) {
    return { step: "dns", status: "error", detail: `${summary} — ${errors.slice(0, 5).join("; ")}` };
  }
  return { step: "dns", status: "success", detail: summary };
}

async function applySettings(
  credentials: CloudflareCredentials,
  targetZoneId: string,
  settings: ZoneConfigSettings,
): Promise<ApplyStepResult[]> {
  const results: ApplyStepResult[] = [];

  const apply = async (step: string, value: unknown, fn: () => Promise<unknown>): Promise<void> => {
    if (value === null || value === undefined) {
      results.push({ step, status: "skipped", detail: "Not available on source zone" });
      return;
    }
    try {
      await fn();
      results.push({ step, status: "success" });
    } catch (error) {
      results.push({ step, status: "error", detail: errorMessage(error) });
    }
  };

  await apply("settings.sslMode", settings.sslMode, () =>
    cloudflareService.updateSslMode(credentials, targetZoneId, settings.sslMode as "off" | "flexible" | "full" | "strict"),
  );
  await apply("settings.cacheLevel", settings.cacheLevel, () =>
    cloudflareService.updateCacheSettings(credentials, targetZoneId, { cache_level: settings.cacheLevel! }),
  );
  await apply("settings.browserCacheTtl", settings.browserCacheTtl, () =>
    cloudflareService.updateCacheSettings(credentials, targetZoneId, { browser_cache_ttl: settings.browserCacheTtl! }),
  );
  await apply("settings.alwaysUseHttps", settings.alwaysUseHttps, () =>
    cloudflareService.updateZoneSetting(credentials, targetZoneId, "always_use_https", settings.alwaysUseHttps!),
  );
  await apply("settings.automaticHttpsRewrites", settings.automaticHttpsRewrites, () =>
    cloudflareService.updateZoneSetting(credentials, targetZoneId, "automatic_https_rewrites", settings.automaticHttpsRewrites!),
  );
  await apply("settings.securityLevel", settings.securityLevel, () =>
    cloudflareService.updateZoneSetting(credentials, targetZoneId, "security_level", settings.securityLevel!),
  );

  return results;
}

async function applyRules(
  credentials: CloudflareCredentials,
  target: { zoneId: string; zoneName: string },
  snapshot: ZoneConfigSnapshot,
  sourceZoneName: string,
  kinds: RuleKind[],
): Promise<ApplyStepResult[]> {
  const results: ApplyStepResult[] = [];

  for (const kind of kinds) {
    const rules = snapshot.rules[kind] ?? [];
    if (rules.length === 0) {
      results.push({ step: `rules.${kind}`, status: "skipped", detail: "No rules to copy" });
      continue;
    }
    let created = 0;
    const errors: string[] = [];
    for (const rule of rules) {
      try {
        // Additive: append to the target zone's phase entrypoint via the same adapter the rules routes use.
        await cloudflareService.createRulesetRule(credentials, target.zoneId, rulePhaseForKind(kind), {
          enabled: rule.enabled,
          description: rule.description,
          expression: substituteHostname(rule.expression, sourceZoneName, target.zoneName),
          action: rule.action || defaultActionForKind(kind),
          actionParameters: rule.actionParameters
            ? substituteInJson(rule.actionParameters, sourceZoneName, target.zoneName)
            : undefined,
        });
        created += 1;
      } catch (error) {
        errors.push(`${rule.description || rule.id}: ${errorMessage(error)}`);
      }
    }
    const summary = `created ${created}/${rules.length}`;
    if (errors.length > 0) {
      results.push({ step: `rules.${kind}`, status: "error", detail: `${summary} — ${errors.slice(0, 5).join("; ")}` });
    } else {
      results.push({ step: `rules.${kind}`, status: "success", detail: summary });
    }
  }

  return results;
}

async function applyPageRules(
  credentials: CloudflareCredentials,
  target: { zoneId: string; zoneName: string },
  snapshot: ZoneConfigSnapshot,
  sourceZoneName: string,
): Promise<ApplyStepResult> {
  if (snapshot.pageRules.length === 0) {
    return { step: "pageRules", status: "skipped", detail: "No page rules to copy" };
  }

  let created = 0;
  const errors: string[] = [];
  for (const rule of snapshot.pageRules) {
    try {
      const targets = substituteInJson(rule.targets, sourceZoneName, target.zoneName);
      const actions = substituteInJson(rule.actions, sourceZoneName, target.zoneName);
      await cloudflareService.createPageRule(credentials, target.zoneId, {
        targets,
        actions,
        priority: rule.priority,
        status: rule.status,
      });
      created += 1;
    } catch (error) {
      const label = rule.targets?.[0]?.constraint?.value || rule.id;
      errors.push(`${label}: ${errorMessage(error)}`);
    }
  }

  const summary = `created ${created}/${snapshot.pageRules.length}`;
  if (errors.length > 0) {
    return { step: "pageRules", status: "error", detail: `${summary} — ${errors.slice(0, 5).join("; ")}` };
  }
  return { step: "pageRules", status: "success", detail: summary };
}

/**
 * Apply a collected snapshot to a target zone. Every Cloudflare failure is captured
 * as an error step result — this function never throws for per-step CF errors.
 */
export async function applyZoneConfig(
  credentials: CloudflareCredentials,
  target: { zoneId: string; zoneName: string },
  snapshot: ZoneConfigSnapshot,
  sourceZoneName: string,
  opts: { dnsMode: "skip" | "overwrite"; components: ZoneConfigComponent[] },
): Promise<ApplyStepResult[]> {
  const results: ApplyStepResult[] = [];

  if (opts.components.includes("dns")) {
    results.push(await applyDns(credentials, target, snapshot, sourceZoneName, opts.dnsMode));
  }

  if (opts.components.includes("settings")) {
    if (snapshot.settings) {
      results.push(...(await applySettings(credentials, target.zoneId, snapshot.settings)));
    } else {
      results.push({ step: "settings", status: "skipped", detail: "No settings in snapshot" });
    }
  }

  const applyRuleKinds = ruleKindsFor(opts.components);
  if (applyRuleKinds.length > 0) {
    results.push(...(await applyRules(credentials, target, snapshot, sourceZoneName, applyRuleKinds)));
  }

  if (opts.components.includes("pageRules")) {
    results.push(await applyPageRules(credentials, target, snapshot, sourceZoneName));
  }

  return results;
}

/** Compact per-status counts for change history entries. */
export function summarizeApplySteps(steps: ApplyStepResult[]): { success: number; error: number; skipped: number } {
  const summary = { success: 0, error: 0, skipped: 0 };
  for (const step of steps) {
    summary[step.status] += 1;
  }
  return summary;
}
