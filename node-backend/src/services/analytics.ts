import crypto from "crypto";

import {
  cloudflareService,
  isCloudflareError,
  type CloudflareCredentials,
} from "./cloudflare.js";

export type AnalyticsRange = "24h" | "7d" | "30d";

const ZONE_CHUNK_SIZE = 10;
const CACHE_TTL_MS = 60_000;

interface StatusMapEdge {
  edgeResponseStatus: number;
  requests: number;
}

interface CountryMapEdge {
  clientCountryName: string;
  requests: number;
  bytes?: number;
}

interface HttpRequestsGroup {
  dimensions: { datetime?: string; date?: string };
  sum: {
    requests?: number;
    bytes?: number;
    cachedRequests?: number;
    cachedBytes?: number;
    responseStatusMap?: StatusMapEdge[];
    countryMap?: CountryMapEdge[];
  };
}

interface GraphqlZoneNode {
  zoneTag: string;
  httpRequests1hGroups?: HttpRequestsGroup[];
  httpRequests1dGroups?: HttpRequestsGroup[];
}

interface GraphqlAnalyticsResponse {
  viewer: {
    zones: GraphqlZoneNode[];
  };
}

export interface SeriesPoint {
  ts: string;
  requests: number;
  bytes: number;
  cachedRequests: number;
  cachedBytes: number;
}

export interface ZoneAnalytics {
  zoneTag: string;
  totals: {
    requests: number;
    bytes: number;
    cachedRequests: number;
    cachedBytes: number;
  };
  /** edge response status code -> request count */
  statusMap: Record<string, number>;
  /** country code -> request count */
  countryMap: Record<string, number>;
  series: SeriesPoint[];
}

export interface AnalyticsSummary {
  totals: {
    requests: number;
    bytes: number;
    cachedRequests: number;
    cacheHitRatio: number;
    savedBytes: number;
  };
  series: SeriesPoint[];
  topZones: Array<{ zoneTag: string; name: string; requests: number; bytes: number }>;
  statusBuckets: { "2xx": number; "3xx": number; "4xx": number; "5xx": number };
  topCountries: Array<{ country: string; requests: number }>;
}

const HOURLY_QUERY = `
query ZoneAnalyticsHourly($zoneTags: [string!], $since: Time!, $until: Time!) {
  viewer {
    zones(filter: { zoneTag_in: $zoneTags }) {
      zoneTag
      httpRequests1hGroups(
        limit: 25
        filter: { datetime_geq: $since, datetime_lt: $until }
        orderBy: [datetime_ASC]
      ) {
        dimensions {
          datetime
        }
        sum {
          requests
          bytes
          cachedRequests
          cachedBytes
          responseStatusMap {
            edgeResponseStatus
            requests
          }
          countryMap {
            clientCountryName
            requests
            bytes
          }
        }
      }
    }
  }
}
`;

const DAILY_QUERY = `
query ZoneAnalyticsDaily($zoneTags: [string!], $since: Date!, $until: Date!) {
  viewer {
    zones(filter: { zoneTag_in: $zoneTags }) {
      zoneTag
      httpRequests1dGroups(
        limit: 31
        filter: { date_geq: $since, date_leq: $until }
        orderBy: [date_ASC]
      ) {
        dimensions {
          date
        }
        sum {
          requests
          bytes
          cachedRequests
          cachedBytes
          responseStatusMap {
            edgeResponseStatus
            requests
          }
          countryMap {
            clientCountryName
            requests
            bytes
          }
        }
      }
    }
  }
}
`;

function rangeVariables(range: AnalyticsRange): { since: string; until: string } {
  const now = new Date();
  if (range === "24h") {
    const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    return { since: since.toISOString(), until: now.toISOString() };
  }
  const days = range === "7d" ? 7 : 30;
  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return {
    since: since.toISOString().slice(0, 10),
    until: now.toISOString().slice(0, 10),
  };
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function emptyZoneAnalytics(zoneTag: string): ZoneAnalytics {
  return {
    zoneTag,
    totals: { requests: 0, bytes: 0, cachedRequests: 0, cachedBytes: 0 },
    statusMap: {},
    countryMap: {},
    series: [],
  };
}

function mapZoneNode(node: GraphqlZoneNode): ZoneAnalytics {
  const groups = node.httpRequests1hGroups ?? node.httpRequests1dGroups ?? [];
  const zone = emptyZoneAnalytics(node.zoneTag);

  for (const group of groups) {
    const sum = group.sum ?? {};
    const requests = sum.requests ?? 0;
    const bytes = sum.bytes ?? 0;
    const cachedRequests = sum.cachedRequests ?? 0;
    const cachedBytes = sum.cachedBytes ?? 0;

    zone.totals.requests += requests;
    zone.totals.bytes += bytes;
    zone.totals.cachedRequests += cachedRequests;
    zone.totals.cachedBytes += cachedBytes;

    const ts = group.dimensions?.datetime ?? group.dimensions?.date ?? "";
    zone.series.push({ ts, requests, bytes, cachedRequests, cachedBytes });

    for (const edge of sum.responseStatusMap ?? []) {
      const key = String(edge.edgeResponseStatus);
      zone.statusMap[key] = (zone.statusMap[key] ?? 0) + (edge.requests ?? 0);
    }
    for (const edge of sum.countryMap ?? []) {
      const key = edge.clientCountryName;
      if (!key) continue;
      zone.countryMap[key] = (zone.countryMap[key] ?? 0) + (edge.requests ?? 0);
    }
  }

  zone.series.sort((a, b) => a.ts.localeCompare(b.ts));
  return zone;
}

// ---- In-memory cache (60s TTL) ----

const analyticsCache = new Map<string, { expires: number; value: ZoneAnalytics[] }>();

export function clearAnalyticsCache(): void {
  analyticsCache.clear();
}

function cacheKey(accountKey: string, zoneTags: string[], range: AnalyticsRange): string {
  const zonesHash = crypto
    .createHash("sha1")
    .update([...zoneTags].sort().join(","))
    .digest("hex");
  return `${accountKey}:${zonesHash}:${range}`;
}

/**
 * Fetch per-zone analytics (totals + hourly/daily series) via the CF GraphQL API.
 * Zone tags are batched in chunks of 10 per query. Results are cached for 60s.
 */
export async function getZonesAnalytics(
  credentials: CloudflareCredentials,
  zoneTags: string[],
  range: AnalyticsRange,
  accountKey: string,
): Promise<ZoneAnalytics[]> {
  if (zoneTags.length === 0) return [];

  const key = cacheKey(accountKey, zoneTags, range);
  const cached = analyticsCache.get(key);
  if (cached && cached.expires > Date.now()) {
    return cached.value;
  }

  const query = range === "24h" ? HOURLY_QUERY : DAILY_QUERY;
  const { since, until } = rangeVariables(range);

  const chunks = chunk(zoneTags, ZONE_CHUNK_SIZE);
  const responses = await Promise.all(
    chunks.map((tags) =>
      cloudflareService.queryGraphql<GraphqlAnalyticsResponse>(credentials, query, {
        zoneTags: tags,
        since,
        until,
      }),
    ),
  );

  const byTag = new Map<string, ZoneAnalytics>();
  for (const response of responses) {
    for (const node of response?.viewer?.zones ?? []) {
      byTag.set(node.zoneTag, mapZoneNode(node));
    }
  }

  // Preserve request order; zones missing from the response get zeroed entries.
  const result = zoneTags.map((tag) => byTag.get(tag) ?? emptyZoneAnalytics(tag));
  analyticsCache.set(key, { expires: Date.now() + CACHE_TTL_MS, value: result });
  return result;
}

/**
 * Aggregate per-zone analytics into overall totals, chart series, top zones,
 * status buckets and top countries.
 */
export function summarize(
  zones: ZoneAnalytics[],
  zoneNames: Record<string, string> = {},
): AnalyticsSummary {
  const totals = { requests: 0, bytes: 0, cachedRequests: 0, cachedBytes: 0 };
  const seriesByTs = new Map<string, SeriesPoint>();
  const statusBuckets = { "2xx": 0, "3xx": 0, "4xx": 0, "5xx": 0 };
  const countryTotals = new Map<string, number>();

  for (const zone of zones) {
    totals.requests += zone.totals.requests;
    totals.bytes += zone.totals.bytes;
    totals.cachedRequests += zone.totals.cachedRequests;
    totals.cachedBytes += zone.totals.cachedBytes;

    for (const point of zone.series) {
      const existing = seriesByTs.get(point.ts);
      if (existing) {
        existing.requests += point.requests;
        existing.bytes += point.bytes;
        existing.cachedRequests += point.cachedRequests;
        existing.cachedBytes += point.cachedBytes;
      } else {
        seriesByTs.set(point.ts, { ...point });
      }
    }

    for (const [code, requests] of Object.entries(zone.statusMap)) {
      const bucket = `${code.charAt(0)}xx` as keyof typeof statusBuckets;
      if (bucket in statusBuckets) {
        statusBuckets[bucket] += requests;
      }
    }

    for (const [country, requests] of Object.entries(zone.countryMap)) {
      countryTotals.set(country, (countryTotals.get(country) ?? 0) + requests);
    }
  }

  const series = [...seriesByTs.values()].sort((a, b) => a.ts.localeCompare(b.ts));

  const topZones = [...zones]
    .sort((a, b) => b.totals.requests - a.totals.requests)
    .slice(0, 5)
    .map((zone) => ({
      zoneTag: zone.zoneTag,
      name: zoneNames[zone.zoneTag] ?? zone.zoneTag,
      requests: zone.totals.requests,
      bytes: zone.totals.bytes,
    }));

  const sortedCountries = [...countryTotals.entries()].sort((a, b) => b[1] - a[1]);
  const topCountries = sortedCountries
    .slice(0, 5)
    .map(([country, requests]) => ({ country, requests }));
  const otherRequests = sortedCountries.slice(5).reduce((acc, [, requests]) => acc + requests, 0);
  if (otherRequests > 0) {
    topCountries.push({ country: "other", requests: otherRequests });
  }

  return {
    totals: {
      requests: totals.requests,
      bytes: totals.bytes,
      cachedRequests: totals.cachedRequests,
      cacheHitRatio: totals.requests > 0 ? totals.cachedRequests / totals.requests : 0,
      savedBytes: totals.cachedBytes,
    },
    series,
    topZones,
    statusBuckets,
    topCountries,
  };
}

/** True when the error indicates the token lacks the Zone Analytics:Read permission. */
export function isAnalyticsPermissionError(error: unknown): boolean {
  if (!isCloudflareError(error)) return false;
  if (error.status === 403) return true;
  const text = [error.message, ...error.cfErrors.map((item) => item.message)]
    .join(" ")
    .toLowerCase();
  return text.includes("not authorized") || text.includes("unauthorized");
}
