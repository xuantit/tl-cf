import axios, { AxiosInstance } from "axios";

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

class CloudflareService {
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

    return axios.create({
      baseURL: "https://api.cloudflare.com/client/v4",
      headers,
    });
  }

  /** Fetch every page of a paginated CF list endpoint. */
  private async fetchAllPages(client: AxiosInstance, path: string, perPage: number): Promise<any[]> {
    const results: any[] = [];
    let page = 1;
    let totalPages = 1;
    do {
      const response = await client.get(path, { params: { page, per_page: perPage } });
      if (!response.data.success) {
        throw new Error(response.data.errors?.[0]?.message || `Failed to fetch ${path} from Cloudflare`);
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
      ssl: {
        status: zone.ssl?.status || "unknown",
        certificate_authority: zone.ssl?.certificate_authority,
      },
    }));
  }

  async listAccounts(credentials: CloudflareCredentials): Promise<Array<{ id: string; name: string }>> {
    const client = this.createClient(credentials);
    const response = await client.get("/accounts");
    if (!response.data.success) {
      throw new Error(response.data.errors?.[0]?.message || "Failed to fetch Cloudflare accounts");
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

    const response = await client.post("/zones", {
      name,
      account: { id: cfAccountId },
      jump_start: jumpStart,
    });
    if (!response.data.success) {
      throw new Error(response.data.errors?.[0]?.message || "Failed to create zone");
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
    const response = await client.delete(`/zones/${zoneId}`);
    if (!response.data.success) {
      throw new Error(response.data.errors?.[0]?.message || "Failed to delete zone");
    }
  }

  async getZoneDetails(credentials: CloudflareCredentials, zoneId: string): Promise<Zone> {
    const client = this.createClient(credentials);
    const response = await client.get(`/zones/${zoneId}`);
    if (!response.data.success) {
      throw new Error("Failed to fetch zone details");
    }
    const zone = response.data.result;
    return {
      id: zone.id,
      name: zone.name,
      status: zone.status,
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
    const response = await client.post(`/zones/${zoneId}/dns_records`, {
      type: record.type,
      name: record.name,
      content: record.content,
      ttl: record.ttl,
      proxied: record.proxied,
      priority: record.priority,
    });
    if (!response.data.success) {
      throw new Error(response.data.errors?.[0]?.message || "Failed to create DNS record");
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
    const response = await client.put(`/zones/${zoneId}/dns_records/${recordId}`, updates);
    if (!response.data.success) {
      throw new Error(response.data.errors?.[0]?.message || "Failed to update DNS record");
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
    const response = await client.delete(`/zones/${zoneId}/dns_records/${recordId}`);
    if (!response.data.success) {
      throw new Error(response.data.errors?.[0]?.message || "Failed to delete DNS record");
    }
  }

  async getCacheSettings(credentials: CloudflareCredentials, zoneId: string): Promise<CacheSettings> {
    const client = this.createClient(credentials);
    const response = await client.get(`/zones/${zoneId}/settings/cache_level`);
    if (!response.data.success) {
      throw new Error("Failed to fetch cache settings");
    }
    const cacheLevel = response.data.result?.value || "aggressive";

    const browserCacheResponse = await client.get(`/zones/${zoneId}/settings/browser_cache_ttl`);
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
    const response = await client.get(`/zones/${zoneId}/settings/ssl`);
    if (!response.data.success) {
      throw new Error("Failed to fetch SSL settings");
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
    const response = await client.patch(`/zones/${zoneId}/settings/ssl`, { value: mode });
    if (!response.data.success) {
      throw new Error(response.data.errors?.[0]?.message || "Failed to update SSL mode");
    }
    return { mode };
  }

  async getTieredCacheTopology(credentials: CloudflareCredentials, zoneId: string): Promise<{ topology: string }> {
    const client = this.createClient(credentials);
    const response = await client.get(`/zones/${zoneId}/cache/regional_tiered_cache`);
    if (!response.data.success) {
      throw new Error("Failed to fetch tiered cache topology");
    }
    const topology = response.data.result?.value || "smart";
    return { topology };
  }

  async updateTieredCacheTopology(
    credentials: CloudflareCredentials,
    zoneId: string,
    topology: string,
  ): Promise<{ topology: string }> {
    const client = this.createClient(credentials);
    const response = await client.patch(`/zones/${zoneId}/cache/regional_tiered_cache`, { value: topology });
    if (!response.data.success) {
      throw new Error(response.data.errors?.[0]?.message || "Failed to update tiered cache topology");
    }
    return { topology };
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
      updates.push(
        client.patch(`/zones/${zoneId}/cache/regional_tiered_cache`, { value: settings.tiered_cache_topology }),
      );
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
    const response = await client.post(`/zones/${zoneId}/purge_cache`, {
      purge_everything: purgeEverything,
    });
    if (!response.data.success) {
      throw new Error(response.data.errors?.[0]?.message || "Failed to purge cache");
    }
  }

  async purgeCacheByUrls(credentials: CloudflareCredentials, zoneId: string, files: string[]): Promise<void> {
    const client = this.createClient(credentials);
    const response = await client.post(`/zones/${zoneId}/purge_cache`, { files });
    if (!response.data.success) {
      throw new Error(response.data.errors?.[0]?.message || "Failed to purge cache by URL");
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
    const response = await client.patch(`/zones/${zoneId}/settings/${key}`, { value });
    if (!response.data.success) {
      throw new Error(response.data.errors?.[0]?.message || `Failed to update ${key}`);
    }
    return { id: response.data.result?.id ?? key, value: response.data.result?.value ?? value };
  }

  async listPageRules(credentials: CloudflareCredentials, zoneId: string): Promise<PageRule[]> {
    const client = this.createClient(credentials);
    const response = await client.get(`/zones/${zoneId}/pagerules`);
    if (!response.data.success) {
      throw new Error("Failed to fetch page rules");
    }
    return response.data.result.map((rule: any) => ({
      id: rule.id,
      priority: rule.priority,
      status: rule.status,
      targets: rule.targets,
      actions: rule.actions,
    }));
  }

  async updatePageRule(
    credentials: CloudflareCredentials,
    zoneId: string,
    ruleId: string,
    updates: Partial<Omit<PageRule, "id">>,
  ): Promise<PageRule> {
    const client = this.createClient(credentials);
    const response = await client.patch(`/zones/${zoneId}/pagerules/${ruleId}`, updates);
    if (!response.data.success) {
      throw new Error(response.data.errors?.[0]?.message || "Failed to update page rule");
    }
    const result = response.data.result;
    return {
      id: result.id,
      priority: result.priority,
      status: result.status,
      targets: result.targets,
      actions: result.actions,
    };
  }

  async testConnection(credentials: CloudflareCredentials): Promise<boolean> {
    try {
      const client = this.createClient(credentials);
      // API tokens are verified via /user/tokens/verify; Global API Key via /user
      const endpoint = credentials.authType === "apiToken" ? "/user/tokens/verify" : "/user";
      const response = await client.get(endpoint);
      return response.data.success === true;
    } catch (error: any) {
      // Log error details for debugging
      if (error.response) {
        throw new Error(
          `Cloudflare API error: ${error.response.status} - ${error.response.data?.errors?.[0]?.message || error.response.statusText}`
        );
      }
      throw new Error(`Network error: ${error.message}`);
    }
  }
}

export const cloudflareService = new CloudflareService();
