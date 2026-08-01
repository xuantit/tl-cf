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
import Overview from './Overview'

const apiGet = vi.mocked(api.get)

const summary = {
  zones: { total: 305, active: 288, pending: 11, moved: 4, other: 2, sslOff: 6 },
  planDistribution: [
    { plan: 'free', count: 241 },
    { plan: 'pro', count: 44 },
  ],
  attention: { pendingNs: 2, sslOff: 6, devMode: 0 },
  recentChanges: [
    {
      id: 'c1',
      action: 'bulk-purge',
      status: 'applied',
      zoneId: 'z1',
      createdAt: new Date().toISOString(),
      itemCount: 3,
    },
  ],
  jobs7d: { total: 48, succeeded: 44, failed: 4 },
  accounts: [
    { id: 'a1', label: 'Main account', authType: 'apiToken', isActive: true, domainCount: 305 },
  ],
}

const analytics = {
  totals: { requests: 18400000, bytes: 1, cachedRequests: 17000000, cacheHitRatio: 0.942, savedBytes: 1 },
  series: [],
  topZones: [],
  statusBuckets: { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 },
  topCountries: [],
  zoneCount: 305,
  range: '24h',
}

function renderOverview() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/overview']}>
        <Overview />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('Overview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiGet.mockImplementation(async (url: string) => {
      if (url === '/dashboard/summary') return { data: summary }
      if (url === '/analytics/summary') return { data: analytics }
      if (url === '/cf/accounts')
        return { data: [{ id: 'a1', label: 'Main account', authType: 'apiToken', isActive: true }] }
      return { data: [] }
    })
  })

  it('renders stats from the dashboard summary', async () => {
    renderOverview()
    expect(await screen.findByText('305')).toBeInTheDocument()
    expect(screen.getByText('288')).toBeInTheDocument()
    expect(screen.getByText('11')).toBeInTheDocument()
    expect(screen.getByText('48')).toBeInTheDocument()
    expect(screen.getByText('4 failed')).toBeInTheDocument()

    // Plan distribution pane
    expect(screen.getByText('free')).toBeInTheDocument()
    expect(screen.getByText('241')).toBeInTheDocument()

    // Accounts pane + recent activity
    expect(screen.getByText('Main account')).toBeInTheDocument()
    expect(screen.getByText('bulk-purge')).toBeInTheDocument()
  })

  it('shows the attention banner when sslOff > 0', async () => {
    renderOverview()
    expect(
      await screen.findByText('6 zones have SSL off and 2 zones have nameserver issues.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'View list' })).toBeInTheDocument()
  })

  it('hides the attention banner when nothing needs attention', async () => {
    apiGet.mockImplementation(async (url: string) => {
      if (url === '/dashboard/summary')
        return { data: { ...summary, attention: { pendingNs: 0, sslOff: 0, devMode: 0 } } }
      if (url === '/analytics/summary') return { data: analytics }
      if (url === '/cf/accounts')
        return { data: [{ id: 'a1', label: 'Main account', authType: 'apiToken', isActive: true }] }
      return { data: [] }
    })
    renderOverview()
    expect(await screen.findByText('305')).toBeInTheDocument()
    expect(screen.queryByText(/zones have SSL off/)).not.toBeInTheDocument()
  })
})
