import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../services/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  apiErrorDetail: () => undefined,
  apiErrorCode: () => undefined,
}))

import SecurityTab from '../SecurityTab'
import { apiGet, apiPatch, apiPost, mockDetailApi, renderWithProviders } from './testUtils'

describe('SecurityTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDetailApi()
    apiPatch.mockResolvedValue({ data: {} })
  })

  it('renders SSL and security settings from the API', async () => {
    renderWithProviders(<SecurityTab zoneId="z1" />)

    expect(await screen.findByText('Encryption mode')).toBeInTheDocument()
    expect(screen.getByText('Always Use HTTPS')).toBeInTheDocument()
    expect(screen.getByText('Security level')).toBeInTheDocument()
    // automatic_https_rewrites=on, always_use_https=off
    expect(screen.getByRole('switch', { name: 'Automatic HTTPS Rewrites' })).toBeChecked()
    expect(screen.getByRole('switch', { name: 'Always Use HTTPS' })).not.toBeChecked()
  })

  it('PATCHes the security endpoint when a switch is toggled', async () => {
    renderWithProviders(<SecurityTab zoneId="z1" />)

    fireEvent.click(await screen.findByRole('switch', { name: 'Always Use HTTPS' }))
    await waitFor(() =>
      expect(apiPatch).toHaveBeenCalledWith('/domains/z1/security', { always_use_https: 'on' }),
    )
  })

  it('renders the WAF custom rules section and fetches /rules/:zoneId/security', async () => {
    renderWithProviders(<SecurityTab zoneId="z1" zoneName="tienlen.vn" />)

    expect(await screen.findByText('Custom rules (WAF)')).toBeInTheDocument()
    await waitFor(() => expect(apiGet).toHaveBeenCalledWith('/rules/z1/security'))
  })

  it('renders IP access rules and posts a new rule', async () => {
    mockDetailApi({
      '/domains/z1/access-rules': {
        rules: [
          {
            id: 'ar1',
            mode: 'block',
            configuration: { target: 'ip', value: '45.9.148.77' },
            notes: 'brute force',
            created_on: '2026-07-27T00:00:00Z',
          },
        ],
      },
    })
    apiPost.mockResolvedValue({ data: { id: 'ar2' } })

    renderWithProviders(<SecurityTab zoneId="z1" />)
    expect(await screen.findByText('45.9.148.77')).toBeInTheDocument()
    expect(screen.getByText('brute force')).toBeInTheDocument()

    // Open the add-rule modal and submit an IP rule (default target)
    fireEvent.click(screen.getByRole('button', { name: '+ Add rule' }))
    const valueInput = await screen.findByPlaceholderText('203.0.113.10')
    fireEvent.change(valueInput, { target: { value: '10.0.4.19' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add rule' }))

    await waitFor(() =>
      expect(apiPost).toHaveBeenCalledWith(
        '/domains/z1/access-rules',
        expect.objectContaining({ mode: 'block', target: 'ip', value: '10.0.4.19' }),
      ),
    )
  })
})
