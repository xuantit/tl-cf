/** Types for GET /analytics/summary and GET /dashboard/summary. */

export interface SeriesPoint {
  ts: string
  requests: number
  bytes: number
  cachedRequests: number
  cachedBytes: number
}

export type AnalyticsRange = '24h' | '7d' | '30d'

export interface AnalyticsSummary {
  totals: {
    requests: number
    bytes: number
    cachedRequests: number
    cacheHitRatio: number
    savedBytes: number
  }
  series: SeriesPoint[]
  topZones: Array<{ zoneTag: string; name: string; requests: number; bytes: number }>
  statusBuckets: { '2xx': number; '3xx': number; '4xx': number; '5xx': number }
  topCountries: Array<{ country: string; requests: number }>
  zoneCount: number
  range: AnalyticsRange
}

export interface DashboardSummary {
  zones: {
    total: number
    active: number
    pending: number
    moved: number
    other: number
    sslOff: number
  }
  planDistribution: Array<{ plan: string; count: number }> | null
  attention: { pendingNs: number; sslOff: number; devMode: number }
  recentChanges: Array<{
    id: string
    action: string
    status: string
    zoneId: string
    createdAt: string
    itemCount: number
  }>
  jobs7d: { total: number; succeeded: number; failed: number }
  accounts: Array<{
    id: string
    label: string
    authType: string
    isActive: boolean
    domainCount: number
  }>
}
