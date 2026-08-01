import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../services/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
  apiErrorDetail: () => undefined,
  apiErrorCode: (e: unknown) =>
    (e as { response?: { data?: { code?: string } } } | undefined)?.response?.data?.code,
}))

import '../i18n'
import { api } from '../services/api'
import Analytics from './Analytics'

const apiGet = vi.mocked(api.get)

const summary = {
  totals: {
    requests: 18_400_000,
    bytes: 1_240_000_000_000,
    cachedRequests: 17_332_800,
    cacheHitRatio: 0.942,
    savedBytes: 1_100_000_000_000,
  },
  series: [{ ts: '2026-07-28T00:00:00Z', requests: 100, bytes: 10, cachedRequests: 90, cachedBytes: 8 }],
  topZones: [{ zoneTag: 'z1', name: 'game-cdn.asia', requests: 6_200_000, bytes: 500 }],
  statusBuckets: { '2xx': 17_100_000, '3xx': 800_000, '4xx': 300_000, '5xx': 190_000 },
  topCountries: [{ country: 'VN', requests: 11_900_000 }],
  zoneCount: 305,
  range: '24h',
}

function renderAnalytics() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/analytics']}>
        <Analytics />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('Analytics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders totals, top zones and countries from the summary', async () => {
    apiGet.mockResolvedValue({ data: summary })
    renderAnalytics()
    expect(await screen.findByText('game-cdn.asia')).toBeInTheDocument()
    expect(screen.getByText('VN')).toBeInTheDocument()
    // 94.2% cache-hit appears in the stat strip
    expect(screen.getByText(/94\.2/)).toBeInTheDocument()
  })

  it('shows the permission banner on ANALYTICS_PERMISSION_MISSING', async () => {
    apiGet.mockRejectedValue({ response: { data: { code: 'ANALYTICS_PERMISSION_MISSING' } } })
    renderAnalytics()
    expect(
      await screen.findByText('The Cloudflare API token is missing the permission required for analytics.'),
    ).toBeInTheDocument()
    expect(screen.getByText(/Zone → Analytics → Read/)).toBeInTheDocument()
  })
})
