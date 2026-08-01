import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi } from 'vitest'
import type { ReactElement } from 'react'

// NOTE: every test file must declare its own `vi.mock('../../../services/api', …)`
// (hoisted before imports) — this helper only wires data + rendering on top of it.
import '../../../i18n'
import { api } from '../../../services/api'

export const apiGet = vi.mocked(api.get)
export const apiPost = vi.mocked(api.post)
export const apiPut = vi.mocked(api.put)
export const apiPatch = vi.mocked(api.patch)
export const apiDelete = vi.mocked(api.delete)

export const zoneDetail = {
  id: 'z1',
  name: 'tienlen.vn',
  status: 'active',
  plan: 'business',
  nameServers: ['ana.ns.cloudflare.com', 'bob.ns.cloudflare.com'],
  savedSettings: { tags: ['core'] },
}

export const dnsRecords = [
  { id: 'r1', type: 'A', name: 'tienlen.vn', content: '203.0.113.10', ttl: 1, proxied: true },
  { id: 'r2', type: 'CNAME', name: 'cdn.tienlen.vn', content: 'cdn.example.net', ttl: 1, proxied: false },
  { id: 'r3', type: 'MX', name: 'tienlen.vn', content: 'aspmx.l.google.com', ttl: 3600, priority: 1 },
]

export const securitySettings = {
  always_use_https: 'off',
  automatic_https_rewrites: 'on',
  security_level: 'medium',
  development_mode: 'off',
}

export const zoneAnalytics = {
  totals: { requests: 18400000, bytes: 2_000_000_000, cachedRequests: 17_000_000, cacheHitRatio: 0.942, savedBytes: 1_363_148_800 },
  series: [],
  range: '24h',
}

/** Default GET handler covering every endpoint the detail page touches. */
export function mockDetailApi(overrides: Record<string, unknown> = {}) {
  apiGet.mockImplementation(async (url: string) => {
    if (url in overrides) return { data: overrides[url] }
    if (url === '/domains/z1') return { data: zoneDetail }
    if (url === '/domains/z1/dns') return { data: dnsRecords }
    if (url === '/domains/z1/rules') return { data: [] }
    if (url === '/domains/z1/cache-config') return { data: { cache_level: 'aggressive', browser_cache_ttl: 14400 } }
    if (url === '/domains/z1/tiered-cache') return { data: { topology: 'smart', available: true } }
    if (url === '/domains/z1/ssl') return { data: { mode: 'full' } }
    if (url === '/domains/z1/security') return { data: securitySettings }
    if (url === '/domains/z1/access-rules') return { data: { rules: [] } }
    if (url === '/analytics/zone/z1') return { data: zoneAnalytics }
    if (url === '/cf/capabilities')
      return {
        data: {
          token: { valid: true, accountId: 'a1' },
          zone: { id: 'z1', plan: 'business' },
          features: {
            dns: { state: 'available', requiredPermission: '#dns_records:edit', reason: null },
          },
        },
      }
    if (url === '/changes') return { data: [] }
    if (url.startsWith('/rules/')) return { data: { rules: [], quota: { used: 0 }, warnings: [] } }
    return { data: [] }
  })
}

export function renderWithProviders(ui: ReactElement, path = '/domains/z1') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/domains/:zoneId" element={ui} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}
