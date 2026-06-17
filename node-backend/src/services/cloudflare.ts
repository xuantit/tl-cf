import axios, { AxiosInstance } from "axios";

export interface CloudflareCredentials {
  email: string;
  globalApiKey: string;
}

export interface Zone {
  id: string;
  name: string;
  status: string;
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

export interface PageRule {
  id: string;
  priority: number;
  status: string;
  targets: Array<{ target: string; constraint: { operator: string; value: string } }>;
  actions: Array<{ id: string; value?: unknown }>;
}

class CloudflareService {
  private createClient(credentials: CloudflareCredentials): AxiosInstance {
    return axios.create({
      baseURL: "https://api.cloudflare.com/client/v4",
      headers: {
        "X-Auth-Email": credentials.email,
        "X-Auth-Key": credentials.globalApiKey,
        "Content-Type": "application/json",
      },
    });
  }

  async listZones(credentials: CloudflareCredentials): Promise<Zone[]> {
    const client = this.createClient(credentials);
    const response = await client.get("/zones");
    if (!response.data.success) {
      throw new Error("Failed to fetch zones from Cloudflare");
    }
    return response.data.result.map((zone: any) => ({
      id: zone.id,
      name: zone.name,
      status: zone.status,
      ssl: {
        status: zone.ssl?.status || "unknown",
        certificate_authority: zone.ssl?.certificate_authority,
      },
    }));
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
    const response = await client.get(`/zones/${zoneId}/dns_records`);
    if (!response.data.success) {
      throw new Error("Failed to fetch DNS records");
    }
    return response.data.result.map((record: any) => ({
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
      // Use /user endpoint instead of /user/tokens/verify for Global API Key
      const response = await client.get("/user");
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
