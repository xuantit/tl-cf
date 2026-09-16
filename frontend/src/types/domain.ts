/** Cloudflare zone as returned by GET /domains (backend enriches sslMode + tags from local settings). */
export interface Zone {
  id: string
  name: string
  status: string
  plan?: string
  ssl?: {
    status: string
    certificate_authority?: string
    mode?: string
  }
  /** SSL mode saved in local DomainSettings, enriched by the backend. */
  sslMode?: string
  /** Local tags saved via PUT /domains/:zoneId/tags. */
  tags?: string[]
}

/** Zone detail as returned by GET /domains/:zoneId (adds nameServers + savedSettings). */
export interface ZoneDetail extends Zone {
  nameServers?: string[]
  /** Local DomainSettings snapshot the backend attaches when the zone is synced. */
  savedSettings?: {
    sslMode?: string
    tags?: string[]
    [key: string]: unknown
  }
}

/** DNS record from GET /domains/:zoneId/dns. */
export interface DnsRecord {
  id: string
  type: string
  name: string
  content: string
  ttl: number
  proxied?: boolean
  priority?: number
}

/** Payload for POST/PUT /domains/:zoneId/dns. */
export interface DnsRecordInput {
  type: string
  name: string
  content: string
  ttl: number
  proxied?: boolean
  priority?: number
}

/** GET/PUT /domains/:zoneId/cache-config. */
export interface CacheConfig {
  cache_level?: string
  browser_cache_ttl?: number
  tiered_cache_topology?: string
}

/** GET /domains/:zoneId/ssl. */
export interface SslSettings {
  mode: string
}

/** GET /domains/:zoneId/tiered-cache (available=false when the token lacks the permission). */
export interface TieredCacheSettings {
  topology: 'off' | 'smart' | 'generic' | null
  enabled?: boolean
  available?: boolean
}

/** GET/PATCH /domains/:zoneId/security. */
export interface SecuritySettings {
  always_use_https: string
  automatic_https_rewrites: string
  security_level: string
  development_mode: string
  development_mode_time_remaining?: number
}

/** Legacy page rule from GET /domains/:zoneId/rules. */
export interface PageRule {
  id: string
  priority: number
  status: 'active' | 'disabled'
  targets: Array<{ target: string; constraint: { operator: string; value: string } }>
  actions: Array<{ id: string; value?: unknown }>
}

/** GET /api/analytics/zone/:zoneId — may 403 with code ANALYTICS_PERMISSION_MISSING. */
export interface ZoneAnalytics {
  totals: {
    requests: number
    bytes: number
    cachedRequests: number
    cacheHitRatio: number
    savedBytes: number
  }
  series: Array<{ ts: string; requests: number; bytes: number; cachedRequests: number }>
  // Optional for compatibility with older API deployments and overview fixtures.
  statusBuckets?: { '2xx': number; '3xx': number; '4xx': number; '5xx': number }
  topCountries?: Array<{ country: string; requests: number }>
  range: string
}

