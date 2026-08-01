import { fireEvent, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../services/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  apiErrorDetail: () => undefined,
  apiErrorCode: () => undefined,
}))

import DomainDetail from '../index'
import { mockDetailApi, renderWithProviders } from './testUtils'

describe('DomainDetail shell', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDetailApi()
  })

  it('renders the zone header and all tabs', async () => {
    renderWithProviders(<DomainDetail />)

    expect(await screen.findByText('tienlen.vn')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Overview/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^DNS/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Cache/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Rules/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Security/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Tags/ })).toBeInTheDocument()

    // Overview is the default tab — zone info renders
    expect(await screen.findByText('Zone ID')).toBeInTheDocument()
    expect(screen.getByText('ana.ns.cloudflare.com')).toBeInTheDocument()
  })

  it('opens the tab from ?tab= and switches tabs on click', async () => {
    renderWithProviders(<DomainDetail />, '/domains/z1?tab=security')

    // Security tab active from the URL
    expect(await screen.findByText('Encryption mode')).toBeInTheDocument()

    // Click to the DNS tab
    fireEvent.click(screen.getByRole('button', { name: /^DNS/ }))
    expect(await screen.findByText(/DNS records · 3/)).toBeInTheDocument()
  })

  it('normalizes the legacy settings tab to tags', async () => {
    renderWithProviders(<DomainDetail />, '/domains/z1?tab=settings')
    expect(await screen.findByText('Danger zone')).toBeInTheDocument()
  })
})
