import { fireEvent, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../services/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  apiErrorDetail: () => undefined,
  apiErrorCode: () => undefined,
}))

import { useFocusMode } from '../../../stores/useFocusMode'
import DomainDetail from '../index'
import { apiGet, mockDetailApi, renderWithProviders } from './testUtils'

const MODULE_LABELS = ['DNS', 'Cache', 'Rules', 'Security', 'Tags', 'Analytics']

describe('DomainDetail shell', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useFocusMode.setState({ active: false })
    mockDetailApi()
  })

  it('renders the zone header and the six module cards on the overview', async () => {
    renderWithProviders(<DomainDetail />)

    expect(await screen.findByText('tienlen.vn')).toBeInTheDocument()
    for (const name of MODULE_LABELS) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument()
    }
  })

  it('no longer shows the OverviewTab content on the overview grid', async () => {
    renderWithProviders(<DomainDetail />)

    expect(await screen.findByText('tienlen.vn')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Analytics' })).toBeInTheDocument()
    expect(screen.queryByText('Zone ID')).not.toBeInTheDocument()
    expect(screen.queryByText('ana.ns.cloudflare.com')).not.toBeInTheDocument()
  })

  it('shows domain traffic analytics at ?tab=analytics, not account-wide statistics', async () => {
    renderWithProviders(<DomainDetail />, '/domains/z1?tab=analytics')

    expect(await screen.findByText('Requests by hour')).toBeInTheDocument()
    expect(screen.getByText('7d')).toBeInTheDocument()
    expect(apiGet.mock.calls.some(([url]) => url === '/analytics/zone/z1')).toBe(true)
    expect(apiGet.mock.calls.some(([url]) => url === '/analytics/summary')).toBe(false)
    expect(screen.queryByText('Recent changes')).not.toBeInTheDocument()
  })

  it('opens a module full screen when its card is clicked', async () => {
    renderWithProviders(<DomainDetail />)

    fireEvent.click(await screen.findByRole('button', { name: 'DNS' }))

    expect(await screen.findByText(/DNS records · 3/)).toBeInTheDocument()
    // the module cards are replaced by the left function rail
    expect(screen.getByRole('button', { name: 'Overview' })).toBeInTheDocument()
    // 2 nút back: fx-head + footer rail
    expect(screen.getAllByRole('button', { name: 'Back to Overview' }).length).toBeGreaterThan(0)
  })

  it('opens the module from ?tab= and switches modules from the rail', async () => {
    renderWithProviders(<DomainDetail />, '/domains/z1?tab=security')

    expect(await screen.findByText('Encryption mode')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'DNS' }))
    expect(await screen.findByText(/DNS records · 3/)).toBeInTheDocument()
  })

  it('returns to the overview grid with the header back button', async () => {
    renderWithProviders(<DomainDetail />, '/domains/z1?tab=dns')

    expect(await screen.findByText(/DNS records · 3/)).toBeInTheDocument()

    fireEvent.click(screen.getAllByRole('button', { name: 'Back to Overview' })[0])

    for (const name of MODULE_LABELS) {
      expect(await screen.findByRole('button', { name })).toBeInTheDocument()
    }
    expect(screen.queryByText(/DNS records · 3/)).not.toBeInTheDocument()
  })

  it('toggles the focus-mode store when entering and leaving a module', async () => {
    renderWithProviders(<DomainDetail />, '/domains/z1?tab=dns')

    expect(await screen.findByText(/DNS records · 3/)).toBeInTheDocument()
    expect(useFocusMode.getState().active).toBe(true)

    fireEvent.click(screen.getAllByRole('button', { name: 'Back to Overview' })[0])

    expect(await screen.findByRole('button', { name: 'Analytics' })).toBeInTheDocument()
    expect(useFocusMode.getState().active).toBe(false)
  })

  it('normalizes the legacy settings tab to tags', async () => {
    renderWithProviders(<DomainDetail />, '/domains/z1?tab=settings')
    expect(await screen.findByText('Danger zone')).toBeInTheDocument()
  })
})
