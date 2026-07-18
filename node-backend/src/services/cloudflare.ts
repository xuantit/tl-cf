import axios, { AxiosError, AxiosInstance } from "axios";

export interface CloudflareApiIssue {
  code?: number;
  message: string;
}

export class CloudflareError extends Error {
  readonly code = "CLOUDFLARE_ERROR";
  readonly status?: number;
  readonly retryAfter?: number;
  readonly retryable: boolean;
  readonly cfErrors: CloudflareApiIssue[];

  constructor(params: {
    message: string;
    status?: number;
    retryAfter?: number;
    retryable?: boolean;
    cfErrors?: CloudflareApiIssue[];
  }) {
    super(params.message);
    this.name = "CloudflareError";
    this.status = params.status;
    this.retryAfter = params.retryAfter;
    this.retryable = params.retryable ?? false;
    this.cfErrors = params.cfErrors ?? [];
  }
}

export function isCloudflareError(error: unknown): error is CloudflareError {
  return error instanceof CloudflareError;
}

export type CloudflareAuthType = "globalApiKey" | "apiToken";

export interface CloudflareCredentials {
  authType?: CloudflareAuthType;
  email?: string;
  globalApiKey?: string;
  apiToken?: string;
}

export interface Zone {
  id: string;
  name: string;
  status: string;
  plan?: string; // "free" | "pro" | "business" | "enterprise"
  nameServers?: string[];
  ssl?: {
    status: string;
    certificate_authority?: string;
  };
}

export interface DnsRecord {
  id: string;
  type: string;
  name: string;
  content: string;
  ttl: number;
  proxied?: boolean;
  priority?: number;
}

export interface CacheSettings {
  cache_level?: string; // "aggressive" | "basic" | "simplified"
  browser_cache_ttl?: number; // seconds
  tiered_cache_topology?: string; // "smart" | "generic" | etc.
  purge_on_purge?: boolean;
}

export interface SslSettings {
  mode: string; // "off" | "flexible" | "full" | "strict"
}

export type ZoneSettingKey =
  | "always_use_https"
  | "automatic_https_rewrites"
  | "security_level"
  | "development_mode";

export interface SecuritySettings {
  always_use_https: string; // "on" | "off"
  automatic_https_rewrites: string; // "on" | "off"
  security_level: string; // "off" | "essentially_off" | "low" | "medium" | "high" | "under_attack"
  development_mode: string; // "on" | "off"
  development_mode_time_remaining?: number; // seconds left when "on"
}

export interface PageRule {
  id: string;
  priority: number;
  status: string;
  targets: Array<{ target: string; constraint: { operator: string; value: string } }>;
  actions: Array<{ id: string; value?: unknown }>;
}

export type RuleKind = "redirect" | "cache" | "configuration";

export interface RulesetRule {
  id: string;
  version?: string;
  enabled: boolean;
  description: string;
  expression: string;
  action: string;
  actionParameters?: Record<string, unknown>;
  position?: number;
}

export interface RulesetRulesResult {
  rulesetId: string | null;
  phase: string;
  rules: RulesetRule[];
}

const RULE_KIND_PHASE: Record<RuleKind, string> = {
  redirect: "http_request_dynamic_redirect",
  cache: "http_request_cache_settings",
  configuration: "http_config_settings",
};

const RULE_KIND_DEFAULT_ACTION: Record<RuleKind, string> = {
  redirect: "redirect",
  cache: "set_cache_settings",
  configuration: "set_config",
};

export function rulePhaseForKind(kind: RuleKind): string {
  return RULE_KIND_PHASE[kind];
}

export function defaultActionForKind(kind: RuleKind): string {
  return RULE_KIND_DEFAULT_ACTION[kind];
}

class CloudflareService {
  private readonly maxRetryAttempts = 2;
  private readonly maxRetryAfterSeconds = 15;

  private parseRetryAfter(header: string | string[] | undefined): number | undefined {
    if (!header) return undefined;
    const value = Array.isArray(header) ? header[0] : header;
    const seconds = Number(value);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.ceil(seconds);
    }
    const asDate = Date.parse(value);
    if (!Number.isNaN(asDate)) {
      const deltaSeconds = Math.ceil((asDate - Date.now()) / 1000);
      return deltaSeconds > 0 ? deltaSeconds : 0;
    }
    return undefined;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private shouldRetry(axiosError: AxiosError<any>, attempt: number, method?: string): boolean {
    if (attempt >= this.maxRetryAttempts) return false;
    const status = axiosError.response?.status;
    if (!(status === 429 || (status !== undefined && status >= 500))) {
      return false;
    }
    const upperMethod = (method || "get").toUpperCase();
    return upperMethod === "GET";
  }

  private getRetryDelayMs(axiosError: AxiosError<any>, attempt: number): number {
    const retryAfterSeconds = this.parseRetryAfter(axiosError.response?.headers?.["retry-after"] as string | string[] | undefined);
    if (retryAfterSeconds !== undefined) {
      return Math.min(retryAfterSeconds, this.maxRetryAfterSeconds) * 1000;
    }
    const backoffMs = Math.min(500 * 2 ** attempt, 4000);
    return backoffMs;
  }

  private mapCfIssues(data: any): CloudflareApiIssue[] {
    if (!data?.errors || !Array.isArray(data.errors)) return [];
    return data.errors
      .filter((item: any) => item && typeof item.message === "string")
      .map((item: any) => ({ code: item.code, message: item.message }));
  }

  private createCloudflareApiError(data: any, fallbackMessage: string, status?: number): CloudflareError {
    const cfErrors = this.mapCfIssues(data);
    const message = cfErrors[0]?.message || fallbackMessage;
    const retryable = status === 429 || (status !== undefined && status >= 500);
    return new CloudflareError({
      message,
      status,
      retryable,
      cfErrors,
    });
  }

  private toCloudflareError(error: unknown, fallbackMessage: string): CloudflareError {
    if (isCloudflareError(error)) return error;

    const axiosError = error as AxiosError<any>;
    const status = axiosError.response?.status;
    const retryAfter = this.parseRetryAfter(axiosError.response?.headers?.["retry-after"] as string | undefined);
    const cfErrors = this.mapCfIssues(axiosError.response?.data);
    const message =
      cfErrors[0]?.message ||
      (typeof axiosError.response?.data?.message === "string" ? axiosError.response.data.message : undefined) ||
      axiosError.message ||
      fallbackMessage;
    const retryable = status === 429 || (status !== undefined && status >= 500);

    return new CloudflareError({
      message,
      status,
      retryAfter,
      retryable,
      cfErrors,
    });
  }

  private mapPageRule(rule: any): PageRule {
    return {
      id: rule.id,
      priority: rule.priority,
      status: rule.status,
      targets: rule.targets,
      actions: rule.actions,
    };
  }

  private createClient(credentials: CloudflareCredentials): AxiosInstance {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (credentials.authType === "apiToken") {
      if (!credentials.apiToken) {
        throw new Error("API token is missing");
      }
      headers["Authorization"] = `Bearer ${credentials.apiToken}`;
    } else {
      if (!credentials.email || !credentials.globalApiKey) {
        throw new Error("Global API Key credentials are missing");
      }
      headers["X-Auth-Email"] = credentials.email;
      headers["X-Auth-Key"] = credentials.globalApiKey;
    }

    const client = axios.create({
      baseURL: "https://api.cloudflare.com/client/v4",
      headers,
    });

    client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError<any>) => {
        const requestConfig = error.config as any;
        if (!requestConfig) {
          return Promise.reject(error);
        }

        const attempt = Number(requestConfig.__cfRetryCount || 0);
        const method = requestConfig.method as string | undefined;
        if (!this.shouldRetry(error, attempt, method)) {
          return Promise.reject(error);
        }

        requestConfig.__cfRetryCount = attempt + 1;
        await this.sleep(this.getRetryDelayMs(error, attempt));
        return client.request(requestConfig);
      },
    );

    return client;
  }

  /** Fetch every page of a paginated CF list endpoint. */
  private async fetchAllPages(client: AxiosInstance, path: string, perPage: number): Promise<any[]> {
    const results: any[] = [];
    let page = 1;
    let totalPages = 1;
    do {
      let response;
      try {
        response = await client.get(path, { params: { page, per_page: perPage } });
      } catch (error) {
        throw this.toCloudflareError(error, `Failed to fetch ${path} from Cloudflare`);
      }
      if (!response.data.success) {
        throw this.createCloudflareApiError(response.data, `Failed to fetch ${path} from Cloudflare`);
      }
      results.push(...(response.data.result || []));
      totalPages = response.data.result_info?.total_pages ?? 1;
      page += 1;
    } while (page <= totalPages);
    return results;
  }

  async listZones(credentials: CloudflareCredentials): Promise<Zone[]> {
    const client = this.createClient(credentials);
    const zones = await this.fetchAllPages(client, "/zones", 50);
    return zones.map((zone: any) => ({
      id: zone.id,
      name: zone.name,
      status: zone.status,
      plan: zone.plan?.legacy_id || zone.plan?.name?.toLowerCase().replace(/\s+website$/, "") || undefined,
      ssl: {
        status: zone.ssl?.status || "unknown",
        certificate_authority: zone.ssl?.certificate_authority,
      },
    }));
  }

  async listAccounts(credentials: CloudflareCredentials): Promise<Array<{ id: string; name: string }>> {
    const client = this.createClient(credentials);
    let response;
    try {
      response = await client.get("/accounts");
    } catch (error) {
      throw this.toCloudflareError(error, "Failed to fetch Cloudflare accounts");
    }
    if (!response.data.success) {
      throw this.createCloudflareApiError(response.data, "Failed to fetch Cloudflare accounts");
    }
    return (response.data.result || []).map((acc: any) => ({ id: acc.id, name: acc.name }));
  }

  async createZone(
    credentials: CloudflareCredentials,
    name: string,
    accountId?: string,
    jumpStart = false,
  ): Promise<Zone> {
    const client = this.createClient(credentials);

    // Resolve the Cloudflare account id if not provided.
    let cfAccountId = accountId;
    if (!cfAccountId) {
      const accounts = await this.listAccounts(credentials);
      if (accounts.length === 0) {
        throw new Error("No Cloudflare account available to create the zone in");
      }
      cfAccountId = accounts[0].id;
    }

    let response;
    try {
      response = await client.post("/zones", {
        name,
        account: { id: cfAccountId },
        jump_start: jumpStart,
      });
    } catch (error) {
      throw this.toCloudflareError(error, "Failed to create zone");
    }
    if (!response.data.success) {
      throw this.createCloudflareApiError(response.data, "Failed to create zone");
    }
    const zone = response.data.result;
    return {
      id: zone.id,
      name: zone.name,
      status: zone.status,
      nameServers: zone.name_servers || [],
      ssl: {
        status: zone.ssl?.status || "unknown",
        certificate_authority: zone.ssl?.certificate_authority,
      },
    };
  }

  async deleteZone(credentials: CloudflareCredentials, zoneId: string): Promise<void> {
    const client = this.createClient(credentials);
    let response;
    try {
      response = await client.delete(`/zones/${zoneId}`);
    } catch (error) {
      throw this.toCloudflareError(error, "Failed to delete zone");
    }
    if (!response.data.success) {
      throw this.createCloudflareApiError(response.data, "Failed to delete zone");
    }
  }

  async getZoneDetails(credentials: CloudflareCredentials, zoneId: string): Promise<Zone> {
    const client = this.createClient(credentials);
    let response;
    try {
      response = await client.get(`/zones/${zoneId}`);
    } catch (error) {
      throw this.toCloudflareError(error, "Failed to fetch zone details");
    }
    if (!response.data.success) {
      throw this.createCloudflareApiError(response.data, "Failed to fetch zone details");
    }
    const zone = response.data.result;
    return {
      id: zone.id,
      name: zone.name,
      status: zone.status,
      plan: zone.plan?.legacy_id || zone.plan?.name?.toLowerCase().replace(/\s+website$/, "") || undefined,
      ssl: {
        status: zone.ssl?.status || "unknown",
        certificate_authority: zone.ssl?.certificate_authority,
      },
    };
  }

  async listDnsRecords(credentials: CloudflareCredentials, zoneId: string): Promise<DnsRecord[]> {
    const client = this.createClient(credentials);
    const records = await this.fetchAllPages(client, `/zones/${zoneId}/dns_records`, 100);
    return records.map((record: any) => ({
      id: record.id,
      type: record.type,
      name: record.name,
      content: record.content,
      ttl: record.ttl,
      proxied: record.proxied,
      priority: record.priority,
    }));
  }

  async createDnsRecord(
    credentials: CloudflareCredentials,
    zoneId: string,
    record: Omit<DnsRecord, "id">,
  ): Promise<DnsRecord> {
    const client = this.createClient(credentials);
    let response;
    try {
      response = await client.post(`/zones/${zoneId}/dns_records`, {
        type: record.type,
        name: record.name,
        content: record.content,
        ttl: record.ttl,
        proxied: record.proxied,
        priority: record.priority,
      });
    } catch (error) {
      throw this.toCloudflareError(error, "Failed to create DNS record");
    }
    if (!response.data.success) {
      throw this.createCloudflareApiError(response.data, "Failed to create DNS record");
    }
    const result = response.data.result;
    return {
      id: result.id,
      type: result.type,
      name: result.name,
      content: result.content,
      ttl: result.ttl,
      proxied: result.proxied,
      priority: result.priority,
    };
  }

  async updateDnsRecord(
    credentials: CloudflareCredentials,
    zoneId: string,
    recordId: string,
    updates: Partial<Omit<DnsRecord, "id">>,
  ): Promise<DnsRecord> {
    const client = this.createClient(credentials);
    let response;
    try {
      response = await client.put(`/zones/${zoneId}/dns_records/${recordId}`, updates);
    } catch (error) {
      throw this.toCloudflareError(error, "Failed to update DNS record");
    }
    if (!response.data.success) {
      throw this.createCloudflareApiError(response.data, "Failed to update DNS record");
    }
    const result = response.data.result;
    return {
      id: result.id,
      type: result.type,
      name: result.name,
      content: result.content,
      ttl: result.ttl,
      proxied: result.proxied,
      priority: result.priority,
    };
  }

  async deleteDnsRecord(credentials: CloudflareCredentials, zoneId: string, recordId: string): Promise<void> {
    const client = this.createClient(credentials);
    let response;
    try {
      response = await client.delete(`/zones/${zoneId}/dns_records/${recordId}`);
    } catch (error) {
      throw this.toCloudflareError(error, "Failed to delete DNS record");
    }
    if (!response.data.success) {
      throw this.createCloudflareApiError(response.data, "Failed to delete DNS record");
    }
  }

  async getCacheSettings(credentials: CloudflareCredentials, zoneId: string): Promise<CacheSettings> {
    const client = this.createClient(credentials);
    let response;
    try {
      response = await client.get(`/zones/${zoneId}/settings/cache_level`);
    } catch (error) {
      throw this.toCloudflareError(error, "Failed to fetch cache settings");
    }
    if (!response.data.success) {
      throw this.createCloudflareApiError(response.data, "Failed to fetch cache settings");
    }
    const cacheLevel = response.data.result?.value || "aggressive";

    let browserCacheResponse;
    try {
      browserCacheResponse = await client.get(`/zones/${zoneId}/settings/browser_cache_ttl`);
    } catch (error) {
      throw this.toCloudflareError(error, "Failed to fetch cache settings");
    }
    const browserCacheTtl = browserCacheResponse.data.success
      ? browserCacheResponse.data.result?.value
      : undefined;

    // Try to get tiered cache topology
    let tieredCacheTopology: string | undefined;
    try {
      const tieredCacheResponse = await this.getTieredCacheTopology(credentials, zoneId);
      tieredCacheTopology = tieredCacheResponse.topology;
    } catch (error) {
      // Tiered cache might not be available for all plans
      tieredCacheTopology = undefined;
    }

    return {
      cache_level: cacheLevel,
      browser_cache_ttl: browserCacheTtl,
      tiered_cache_topology: tieredCacheTopology,
    };
  }

  async getSslMode(credentials: CloudflareCredentials, zoneId: string): Promise<SslSettings> {
    const client = this.createClient(credentials);
    let response;
    try {
      response = await client.get(`/zones/${zoneId}/settings/ssl`);
    } catch (error) {
      throw this.toCloudflareError(error, "Failed to fetch SSL settings");
    }
    if (!response.data.success) {
      throw this.createCloudflareApiError(response.data, "Failed to fetch SSL settings");
    }
    const mode = response.data.result?.value || "flexible";
    return { mode };
  }

  async updateSslMode(
    credentials: CloudflareCredentials,
    zoneId: string,
    mode: "off" | "flexible" | "full" | "strict",
  ): Promise<SslSettings> {
    const client = this.createClient(credentials);
    let response;
    try {
      response = await client.patch(`/zones/${zoneId}/settings/ssl`, { value: mode });
    } catch (error) {
      throw this.toCloudflareError(error, "Failed to update SSL mode");
    }
    if (!response.data.success) {
      throw this.createCloudflareApiError(response.data, "Failed to update SSL mode");
    }
    return { mode };
  }

  // Tiered Cache (https://developers.cloudflare.com/cache/how-to/tiered-cache/)
  // - Enable/disable:      PATCH /zones/{id}/argo/tiered_caching            { value: "on" | "off" }
  // - Smart vs Generic:    PATCH /zones/{id}/cache/tiered_cache_smart_topology_enable { value: "on" | "off" }
  // Topology semantics: off = tiered caching disabled; smart = enabled + smart topology on;
  // generic = enabled + smart topology off (Generic Global, Enterprise only).
  async getTieredCacheTopology(
    credentials: CloudflareCredentials,
    zoneId: string,
  ): Promise<{ topology: "off" | "smart" | "generic"; enabled: boolean }> {
    const client = this.createClient(credentials);
    let response;
    try {
      response = await client.get(`/zones/${zoneId}/argo/tiered_caching`);
    } catch (error) {
      throw this.toCloudflareError(error, "Failed to fetch tiered cache setting");
    }
    if (!response.data.success) {
      throw this.createCloudflareApiError(response.data, "Failed to fetch tiered cache setting");
    }
    const enabled = response.data.result?.value === "on";
    if (!enabled) {
      return { topology: "off", enabled: false };
    }

    let smart = true; // non-Enterprise plans only support Smart topology, so default to smart
    try {
      const smartResponse = await client.get(`/zones/${zoneId}/cache/tiered_cache_smart_topology_enable`);
      if (smartResponse.data.success) {
        smart = smartResponse.data.result?.value === "on";
      }
    } catch {
      // Smart topology setting may not be readable on some plans; keep the smart default.
    }
    return { topology: smart ? "smart" : "generic", enabled: true };
  }

  async updateTieredCacheTopology(
    credentials: CloudflareCredentials,
    zoneId: string,
    topology: string,
  ): Promise<{ topology: "off" | "smart" | "generic"; enabled: boolean }> {
    if (topology !== "off" && topology !== "smart" && topology !== "generic") {
      throw new Error(`Invalid tiered cache topology: ${topology}`);
    }
    const client = this.createClient(credentials);

    if (topology === "off") {
      let response;
      try {
        response = await client.patch(`/zones/${zoneId}/argo/tiered_caching`, { value: "off" });
      } catch (error) {
        throw this.toCloudflareError(error, "Failed to disable tiered cache");
      }
      if (!response.data.success) {
        throw this.createCloudflareApiError(response.data, "Failed to disable tiered cache");
      }
      return { topology: "off", enabled: false };
    }

    let enableResponse;
    try {
      enableResponse = await client.patch(`/zones/${zoneId}/argo/tiered_caching`, { value: "on" });
    } catch (error) {
      throw this.toCloudflareError(error, "Failed to enable tiered cache");
    }
    if (!enableResponse.data.success) {
      throw this.createCloudflareApiError(enableResponse.data, "Failed to enable tiered cache");
    }

    let smartResponse;
    try {
      smartResponse = await client.patch(`/zones/${zoneId}/cache/tiered_cache_smart_topology_enable`, {
        value: topology === "smart" ? "on" : "off",
      });
    } catch (error) {
      throw this.toCloudflareError(error, "Failed to update tiered cache topology");
    }
    if (!smartResponse.data.success) {
      throw this.createCloudflareApiError(smartResponse.data, "Failed to update tiered cache topology");
    }
    return { topology, enabled: true };
  }

  async updateCacheSettings(
    credentials: CloudflareCredentials,
    zoneId: string,
    settings: CacheSettings,
  ): Promise<CacheSettings> {
    const client = this.createClient(credentials);
    const updates: Promise<any>[] = [];

    if (settings.cache_level) {
      updates.push(client.patch(`/zones/${zoneId}/settings/cache_level`, { value: settings.cache_level }));
    }
    if (settings.browser_cache_ttl !== undefined) {
      updates.push(
        client.patch(`/zones/${zoneId}/settings/browser_cache_ttl`, { value: settings.browser_cache_ttl }),
      );
    }
    if (settings.tiered_cache_topology) {
      updates.push(this.updateTieredCacheTopology(credentials, zoneId, settings.tiered_cache_topology));
    }

    await Promise.all(updates);
    const result = await this.getCacheSettings(credentials, zoneId);
    // Include tiered cache topology in result
    if (settings.tiered_cache_topology) {
      const tieredCache = await this.getTieredCacheTopology(credentials, zoneId);
      result.tiered_cache_topology = tieredCache.topology;
    }
    return result;
  }

  async purgeCache(credentials: CloudflareCredentials, zoneId: string, purgeEverything = true): Promise<void> {
    const client = this.createClient(credentials);
    let response;
    try {
      response = await client.post(`/zones/${zoneId}/purge_cache`, {
        purge_everything: purgeEverything,
      });
    } catch (error) {
      throw this.toCloudflareError(error, "Failed to purge cache");
    }
    if (!response.data.success) {
      throw this.createCloudflareApiError(response.data, "Failed to purge cache");
    }
  }

  async purgeCacheByUrls(credentials: CloudflareCredentials, zoneId: string, files: string[]): Promise<void> {
    const client = this.createClient(credentials);
    let response;
    try {
      response = await client.post(`/zones/${zoneId}/purge_cache`, { files });
    } catch (error) {
      throw this.toCloudflareError(error, "Failed to purge cache by URL");
    }
    if (!response.data.success) {
      throw this.createCloudflareApiError(response.data, "Failed to purge cache by URL");
    }
  }

  async getSecuritySettings(credentials: CloudflareCredentials, zoneId: string): Promise<SecuritySettings> {
    const client = this.createClient(credentials);
    const keys: ZoneSettingKey[] = [
      "always_use_https",
      "automatic_https_rewrites",
      "security_level",
      "development_mode",
    ];
    const responses = await Promise.all(
      keys.map((k) => client.get(`/zones/${zoneId}/settings/${k}`).catch(() => null)),
    );
    const resultOf = (i: number) =>
      responses[i]?.data?.success ? responses[i]!.data.result : undefined;
    const dev = resultOf(3);
    return {
      always_use_https: resultOf(0)?.value ?? "off",
      automatic_https_rewrites: resultOf(1)?.value ?? "off",
      security_level: resultOf(2)?.value ?? "medium",
      development_mode: dev?.value ?? "off",
      development_mode_time_remaining: dev?.time_remaining,
    };
  }

  async updateZoneSetting(
    credentials: CloudflareCredentials,
    zoneId: string,
    key: ZoneSettingKey,
    value: string,
  ): Promise<{ id: string; value: string }> {
    const client = this.createClient(credentials);
    let response;
    try {
      response = await client.patch(`/zones/${zoneId}/settings/${key}`, { value });
    } catch (error) {
      throw this.toCloudflareError(error, `Failed to update ${key}`);
    }
    if (!response.data.success) {
      throw this.createCloudflareApiError(response.data, `Failed to update ${key}`);
    }
    return { id: response.data.result?.id ?? key, value: response.data.result?.value ?? value };
  }

  async listPageRules(credentials: CloudflareCredentials, zoneId: string): Promise<PageRule[]> {
    const client = this.createClient(credentials);
    let response;
    try {
      response = await client.get(`/zones/${zoneId}/pagerules`);
    } catch (error) {
      throw this.toCloudflareError(error, "Failed to fetch page rules");
    }
    if (!response.data.success) {
      throw this.createCloudflareApiError(response.data, "Failed to fetch page rules");
    }
    return (response.data.result || []).map((rule: any) => this.mapPageRule(rule));
  }

  async createPageRule(
    credentials: CloudflareCredentials,
    zoneId: string,
    payload: Omit<PageRule, "id">,
  ): Promise<PageRule> {
    const client = this.createClient(credentials);
    let response;
    try {
      response = await client.post(`/zones/${zoneId}/pagerules`, payload);
    } catch (error) {
      throw this.toCloudflareError(error, "Failed to create page rule");
    }
    if (!response.data.success) {
      throw this.createCloudflareApiError(response.data, "Failed to create page rule");
    }
    return this.mapPageRule(response.data.result);
  }

  async updatePageRule(
    credentials: CloudflareCredentials,
    zoneId: string,
    ruleId: string,
    updates: Partial<Omit<PageRule, "id">>,
  ): Promise<PageRule> {
    const client = this.createClient(credentials);
    let response;
    try {
      response = await client.patch(`/zones/${zoneId}/pagerules/${ruleId}`, updates);
    } catch (error) {
      throw this.toCloudflareError(error, "Failed to update page rule");
    }
    if (!response.data.success) {
      throw this.createCloudflareApiError(response.data, "Failed to update page rule");
    }
    return this.mapPageRule(response.data.result);
  }

  async deletePageRule(credentials: CloudflareCredentials, zoneId: string, ruleId: string): Promise<void> {
    const client = this.createClient(credentials);
    let response;
    try {
      response = await client.delete(`/zones/${zoneId}/pagerules/${ruleId}`);
    } catch (error) {
      throw this.toCloudflareError(error, "Failed to delete page rule");
    }
    if (!response.data.success) {
      throw this.createCloudflareApiError(response.data, "Failed to delete page rule");
    }
  }

  private mapRulesetRule(rule: any): RulesetRule {
    return {
      id: rule.id,
      version: rule.version,
      enabled: rule.enabled !== false,
      description: rule.description || "",
      expression: rule.expression || "",
      action: rule.action || "",
      actionParameters: rule.action_parameters || undefined,
      position: undefined,
    };
  }

  private toRulePayload(rule: {
    enabled?: boolean;
    description?: string;
    expression: string;
    action: string;
    actionParameters?: Record<string, unknown>;
  }) {
    return {
      enabled: rule.enabled ?? true,
      description: rule.description ?? "",
      expression: rule.expression,
      action: rule.action,
      action_parameters: rule.actionParameters ?? {},
    };
  }

  // Resolve the concrete entrypoint ruleset id for a phase (needed for per-rule PATCH/DELETE).
  private async resolveRulesetId(
    credentials: CloudflareCredentials,
    zoneId: string,
    phase: string,
  ): Promise<string | null> {
    const result = await this.getRulesetRules(credentials, zoneId, phase);
    return result.rulesetId;
  }

  // Fetch the entrypoint ruleset for a phase. Returns empty rules if the entrypoint doesn't exist yet.
  async getRulesetRules(
    credentials: CloudflareCredentials,
    zoneId: string,
    phase: string,
  ): Promise<RulesetRulesResult> {
    const client = this.createClient(credentials);
    let response;
    try {
      response = await client.get(`/zones/${zoneId}/rulesets/phases/${phase}/entrypoint`);
    } catch (error) {
      const cfError = this.toCloudflareError(error, "Failed to fetch rules");
      // A missing entrypoint means no rules have been created for this phase yet.
      if (cfError.status === 404) {
        return { rulesetId: null, phase, rules: [] };
      }
      throw cfError;
    }
    if (!response.data.success) {
      throw this.createCloudflareApiError(response.data, "Failed to fetch rules");
    }
    const result = response.data.result;
    const rules: RulesetRule[] = (result.rules || []).map((rule: any, index: number) => ({
      ...this.mapRulesetRule(rule),
      position: index + 1,
    }));
    return { rulesetId: result.id ?? null, phase, rules };
  }

  async createRulesetRule(
    credentials: CloudflareCredentials,
    zoneId: string,
    phase: string,
    rule: {
      enabled?: boolean;
      description?: string;
      expression: string;
      action: string;
      actionParameters?: Record<string, unknown>;
    },
  ): Promise<RulesetRule> {
    const client = this.createClient(credentials);
    const rulesetId = await this.resolveRulesetId(credentials, zoneId, phase);

    // No entrypoint ruleset exists yet: create it (with this rule) via PUT.
    if (!rulesetId) {
      const result = await this.reorderRulesetRules(credentials, zoneId, phase, [
        {
          enabled: rule.enabled,
          description: rule.description,
          expression: rule.expression,
          action: rule.action,
          actionParameters: rule.actionParameters,
        },
      ]);
      const created = result.rules[result.rules.length - 1];
      if (!created) {
        throw new CloudflareError({ message: "Failed to create rule", status: 500, retryable: false });
      }
      return created;
    }

    // Append to the existing ruleset (POST to the concrete ruleset id, not the phase alias).
    let response;
    try {
      response = await client.post(
        `/zones/${zoneId}/rulesets/${rulesetId}/rules`,
        this.toRulePayload(rule),
      );
    } catch (error) {
      throw this.toCloudflareError(error, "Failed to create rule");
    }
    if (!response.data.success) {
      throw this.createCloudflareApiError(response.data, "Failed to create rule");
    }
    const rules = response.data.result?.rules || [];
    const created = rules[rules.length - 1];
    return this.mapRulesetRule(created);
  }

  async updateRulesetRule(
    credentials: CloudflareCredentials,
    zoneId: string,
    phase: string,
    ruleId: string,
    rule: {
      enabled?: boolean;
      description?: string;
      expression: string;
      action: string;
      actionParameters?: Record<string, unknown>;
    },
  ): Promise<RulesetRule> {
    const client = this.createClient(credentials);
    // Per-rule PATCH must target the concrete ruleset id, not the phase entrypoint alias.
    const rulesetId = await this.resolveRulesetId(credentials, zoneId, phase);
    if (!rulesetId) {
      throw new CloudflareError({ message: "Ruleset not found for phase", status: 404, retryable: false });
    }
    let response;
    try {
      response = await client.patch(
        `/zones/${zoneId}/rulesets/${rulesetId}/rules/${ruleId}`,
        this.toRulePayload(rule),
      );
    } catch (error) {
      throw this.toCloudflareError(error, "Failed to update rule");
    }
    if (!response.data.success) {
      throw this.createCloudflareApiError(response.data, "Failed to update rule");
    }
    const rules = response.data.result?.rules || [];
    const updated = rules.find((r: any) => r.id === ruleId) || rules[rules.length - 1];
    return this.mapRulesetRule(updated);
  }

  async deleteRulesetRule(
    credentials: CloudflareCredentials,
    zoneId: string,
    phase: string,
    ruleId: string,
  ): Promise<void> {
    const client = this.createClient(credentials);
    // Per-rule DELETE must target the concrete ruleset id, not the phase entrypoint alias.
    const rulesetId = await this.resolveRulesetId(credentials, zoneId, phase);
    if (!rulesetId) {
      throw new CloudflareError({ message: "Ruleset not found for phase", status: 404, retryable: false });
    }
    let response;
    try {
      response = await client.delete(`/zones/${zoneId}/rulesets/${rulesetId}/rules/${ruleId}`);
    } catch (error) {
      throw this.toCloudflareError(error, "Failed to delete rule");
    }
    if (!response.data.success) {
      throw this.createCloudflareApiError(response.data, "Failed to delete rule");
    }
  }

  // Replace the full ordered rule list for a phase (used for reordering).
  async reorderRulesetRules(
    credentials: CloudflareCredentials,
    zoneId: string,
    phase: string,
    rules: Array<{
      enabled?: boolean;
      description?: string;
      expression: string;
      action: string;
      actionParameters?: Record<string, unknown>;
    }>,
  ): Promise<RulesetRulesResult> {
    const client = this.createClient(credentials);
    let response;
    try {
      response = await client.put(`/zones/${zoneId}/rulesets/phases/${phase}/entrypoint`, {
        rules: rules.map((rule) => this.toRulePayload(rule)),
      });
    } catch (error) {
      throw this.toCloudflareError(error, "Failed to reorder rules");
    }
    if (!response.data.success) {
      throw this.createCloudflareApiError(response.data, "Failed to reorder rules");
    }
    const result = response.data.result;
    const mapped: RulesetRule[] = (result.rules || []).map((rule: any, index: number) => ({
      ...this.mapRulesetRule(rule),
      position: index + 1,
    }));
    return { rulesetId: result.id ?? null, phase, rules: mapped };
  }

  async testConnection(credentials: CloudflareCredentials): Promise<boolean> {
    try {
      const client = this.createClient(credentials);
      // API tokens are verified via /user/tokens/verify; Global API Key via /user
      const endpoint = credentials.authType === "apiToken" ? "/user/tokens/verify" : "/user";
      const response = await client.get(endpoint);
      return response.data.success === true;
    } catch (error: any) {
      throw this.toCloudflareError(error, "Failed to verify Cloudflare credentials");
    }
  }
}

export const cloudflareService = new CloudflareService();
