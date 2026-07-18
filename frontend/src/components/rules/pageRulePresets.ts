export interface PageRuleTarget {
  target: "url"
  constraint: {
    operator: "matches" | "contains" | "equals" | "not_equal" | "not_contain"
    value: string
  }
}

export interface PageRuleAction {
  id: string
  value?: unknown
}

export interface PageRuleInput {
  targets: PageRuleTarget[]
  actions: PageRuleAction[]
  priority?: number
  status?: "active" | "disabled"
}

export interface PageRulePreset {
  key: string
  nameKey: string
  descriptionKey: string
  build: (zoneName: string) => PageRuleInput
}

const toWildcardPattern = (zoneName: string): string => `*${zoneName}/*`

export const PAGE_RULE_PRESETS: PageRulePreset[] = [
  {
    key: "redirect-http-to-https",
    nameKey: "Redirect from HTTP to HTTPS",
    descriptionKey: "Always redirect HTTP requests to HTTPS based on hostname.",
    build: (zoneName) => ({
      status: "active",
      priority: 1,
      targets: [{ target: "url", constraint: { operator: "matches", value: toWildcardPattern(zoneName) } }],
      actions: [{ id: "always_use_https" }],
    }),
  },
  {
    key: "redirect-www-to-root",
    nameKey: "Redirect from WWW to root",
    descriptionKey: "Always redirect HTTP requests from the WWW subdomain to the root domain.",
    build: (zoneName) => ({
      status: "active",
      priority: 1,
      targets: [{ target: "url", constraint: { operator: "matches", value: `www.${zoneName}/*` } }],
      actions: [{ id: "forwarding_url", value: { status_code: 301, url: `https://${zoneName}/$1` } }],
    }),
  },
  {
    key: "redirect-root-to-www",
    nameKey: "Redirect from root to WWW",
    descriptionKey: "Always redirect requests from root domain to the WWW subdomain.",
    build: (zoneName) => ({
      status: "active",
      priority: 1,
      targets: [{ target: "url", constraint: { operator: "matches", value: `${zoneName}/*` } }],
      actions: [{ id: "forwarding_url", value: { status_code: 301, url: `https://www.${zoneName}/$1` } }],
    }),
  },
  {
    key: "redirect-different-domain",
    nameKey: "Redirect to a different domain",
    descriptionKey: "Redirect all requests to another domain while keeping path and query string.",
    build: (zoneName) => ({
      status: "active",
      priority: 1,
      targets: [{ target: "url", constraint: { operator: "matches", value: `${zoneName}/*` } }],
      actions: [{ id: "forwarding_url", value: { status_code: 301, url: "https://other.example/$1" } }],
    }),
  },
  {
    key: "redirect-new-url",
    nameKey: "Redirect to a new URL",
    descriptionKey: "Redirect visitors requesting one page to another page URL.",
    build: (zoneName) => ({
      status: "active",
      priority: 1,
      targets: [{ target: "url", constraint: { operator: "matches", value: `${zoneName}/old-page` } }],
      actions: [{ id: "forwarding_url", value: { status_code: 302, url: `https://${zoneName}/new-page` } }],
    }),
  },
  {
    key: "cache-everything",
    nameKey: "Cache everything",
    descriptionKey: "Adjust the cache level for all requests.",
    build: (zoneName) => ({
      status: "active",
      priority: 1,
      targets: [{ target: "url", constraint: { operator: "matches", value: toWildcardPattern(zoneName) } }],
      actions: [{ id: "cache_level", value: "cache_everything" }],
    }),
  },
  {
    key: "bypass-cache-everything",
    nameKey: "Bypass cache for everything",
    descriptionKey: "Bypass cache for all requests.",
    build: (zoneName) => ({
      status: "active",
      priority: 1,
      targets: [{ target: "url", constraint: { operator: "matches", value: toWildcardPattern(zoneName) } }],
      actions: [{ id: "cache_level", value: "bypass" }],
    }),
  },
  {
    key: "cache-default-file-extensions",
    nameKey: "Cache default file extensions",
    descriptionKey: "Cache static files with default Cloudflare extension behavior.",
    build: (zoneName) => ({
      status: "active",
      priority: 1,
      targets: [{ target: "url", constraint: { operator: "matches", value: toWildcardPattern(zoneName) } }],
      actions: [{ id: "cache_level", value: "aggressive" }],
    }),
  },
  {
    key: "set-edge-cache-time",
    nameKey: "Set edge cache time",
    descriptionKey: "Cache responses between status code 200 and 599 on Cloudflare edge.",
    build: (zoneName) => ({
      status: "active",
      priority: 1,
      targets: [{ target: "url", constraint: { operator: "matches", value: toWildcardPattern(zoneName) } }],
      actions: [{ id: "edge_cache_ttl", value: 86400 }],
    }),
  },
  {
    key: "browser-cache-1-day",
    nameKey: "Browser cache TTL 1 day",
    descriptionKey: "Tell browsers to cache content for one day.",
    build: (zoneName) => ({
      status: "active",
      priority: 1,
      targets: [{ target: "url", constraint: { operator: "matches", value: toWildcardPattern(zoneName) } }],
      actions: [{ id: "browser_cache_ttl", value: 86400 }],
    }),
  },
  {
    key: "force-ssl-strict",
    nameKey: "Force SSL strict",
    descriptionKey: "Set SSL mode to strict for matching requests.",
    build: (zoneName) => ({
      status: "active",
      priority: 1,
      targets: [{ target: "url", constraint: { operator: "matches", value: toWildcardPattern(zoneName) } }],
      actions: [{ id: "ssl", value: "strict" }],
    }),
  },
  {
    key: "disable-performance",
    nameKey: "Disable performance",
    descriptionKey: "Disable performance optimizations for matching requests.",
    build: (zoneName) => ({
      status: "active",
      priority: 1,
      targets: [{ target: "url", constraint: { operator: "matches", value: toWildcardPattern(zoneName) } }],
      actions: [{ id: "disable_performance" }],
    }),
  },
  {
    key: "disable-security",
    nameKey: "Disable security",
    descriptionKey: "Disable security features for matching requests.",
    build: (zoneName) => ({
      status: "active",
      priority: 1,
      targets: [{ target: "url", constraint: { operator: "matches", value: toWildcardPattern(zoneName) } }],
      actions: [{ id: "disable_security" }],
    }),
  },
]
