import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../services/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  apiErrorDetail: () => undefined,
  apiErrorCode: () => undefined,
}))

import DnsTab from '../DnsTab'
import { apiPut, mockDetailApi, renderWithProviders } from './testUtils'

describe('DnsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDetailApi()
  })

  it('renders records with type tags, short names and proxy state', async () => {
    renderWithProviders(<DnsTab zoneId="z1" zoneName="tienlen.vn" />)

    expect(await screen.findByText('203.0.113.10')).toBeInTheDocument()
    // FQDN names are shortened against the zone (root → @, cdn.tienlen.vn → cdn)
    expect(screen.getAllByText('@').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('cdn')).toBeInTheDocument()
    expect(screen.getByText('proxied')).toBeInTheDocument()
    expect(screen.getAllByText('dns only').length).toBe(2)
    expect(screen.getByText(/DNS records · 3/)).toBeInTheDocument()
  })

  it('shows the bulk action bar when rows are selected and toggles proxy', async () => {
    renderWithProviders(<DnsTab zoneId="z1" zoneName="tienlen.vn" />)
    expect(await screen.findByText('203.0.113.10')).toBeInTheDocument()

    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[1]) // first record row (index 0 = select all)

    expect((await screen.findAllByText(/1 record/)).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByRole('button', { name: /Toggle proxy/ }).length).toBeGreaterThanOrEqual(1)

    apiPut.mockResolvedValue({ data: {} })
    fireEvent.click(screen.getAllByRole('button', { name: /Toggle proxy/ })[0])
    await waitFor(() =>
      expect(apiPut).toHaveBeenCalledWith(
        '/domains/z1/dns/r1',
        expect.objectContaining({ proxied: false, type: 'A', content: '203.0.113.10' }),
      ),
    )
  })
})
