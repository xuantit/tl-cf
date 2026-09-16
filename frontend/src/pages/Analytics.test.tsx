import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
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
import { useAccountStore } from '../stores/useAccountStore'

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
  statusBuckets: { '2xx': 17_100_000, '3xx': 800_000, '4xx': 300_000, '5xx': 190_000 },
  topCountries: [{ country: 'VN', requests: 11_900_000 }],
  range: '24h',
}

function LocationProbe() {
  const location = useLocation()
  return <output data-testid="location">{location.pathname}{location.search}</output>
}

function renderAnalytics(path = '/domains/z1?tab=analytics', zoneId = 'z1') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Analytics zoneId={zoneId} zoneName="game-cdn.asia" />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('Analytics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAccountStore.setState({ activeAccountId: 'account-a' })
  })

  it('renders totals, chart and countries for only the selected domain', async () => {
    apiGet.mockResolvedValue({ data: summary })
    renderAnalytics()
    expect(await screen.findByText('VN')).toBeInTheDocument()
    expect(screen.getByText('game-cdn.asia')).toBeInTheDocument()
    // 94.2% cache-hit appears in the stat strip
    expect(screen.getByText(/94\.2/)).toBeInTheDocument()
    expect(screen.queryByText('Top zones by requests')).not.toBeInTheDocument()
    expect(apiGet).toHaveBeenCalledWith('/analytics/zone/z1', expect.objectContaining({ params: { range: '24h', accountId: 'account-a' } }))
    expect(apiGet.mock.calls.some(([url]) => url === '/analytics/summary')).toBe(false)
  })

  it('shows the permission banner on ANALYTICS_PERMISSION_MISSING', async () => {
    apiGet.mockRejectedValue({ response: { data: { code: 'ANALYTICS_PERMISSION_MISSING' } } })
    renderAnalytics()
    expect(
      await screen.findByText('The Cloudflare API token is missing the permission required for analytics.'),
    ).toBeInTheDocument()
    expect(screen.getByText(/Zone → Analytics → Read/)).toBeInTheDocument()
  })

  it('changes the period without leaving the domain analytics module or losing other parameters', async () => {
    apiGet.mockResolvedValue({ data: summary })
    renderAnalytics('/domains/z1?tab=analytics&keep=value')
    await screen.findByText('VN')
    fireEvent.click(screen.getByText('7d'))
    await waitFor(() => expect(apiGet).toHaveBeenCalledWith('/analytics/zone/z1', expect.objectContaining({ params: { range: '7d', accountId: 'account-a' } })))
    expect(screen.getByTestId('location')).toHaveTextContent('/domains/z1?tab=analytics&keep=value&range=7d')
    fireEvent.click(screen.getByText('24h'))
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/domains/z1?tab=analytics&keep=value'))
    expect(screen.getByTestId('location')).not.toHaveTextContent('range=')
  })

  it('refetches for a different account without reusing account A traffic', async () => {
    apiGet.mockResolvedValue({ data: summary })
    renderAnalytics()
    await screen.findByText('VN')
    act(() => useAccountStore.setState({ activeAccountId: 'account-b' }))
    await waitFor(() => expect(apiGet).toHaveBeenCalledWith('/analytics/zone/z1', expect.objectContaining({ params: { range: '24h', accountId: 'account-b' } })))
  })

  it('handles the previous zone API response without status/country fields', async () => {
    apiGet.mockResolvedValue({ data: { totals: summary.totals, series: summary.series, range: '24h' } })
    renderAnalytics()
    expect(await screen.findByText(/94\.2/)).toBeInTheDocument()
    expect(screen.queryByText('5xx rate')).not.toBeInTheDocument()
  })

  it('does not fetch unscoped data when the domain ID is missing', () => {
    renderAnalytics('/domains/z1?tab=analytics', '')
    expect(apiGet).not.toHaveBeenCalled()
  })
})
