import { fireEvent, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../services/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  apiErrorDetail: () => undefined,
  apiErrorCode: () => undefined,
}))

import CacheTab from '../CacheTab'
import { mockDetailApi, renderWithProviders } from './testUtils'

describe('CacheTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDetailApi()
  })

  it('disables the purge-by-URL button until a URL is entered', async () => {
    renderWithProviders(<CacheTab zoneId="z1" zoneName="tienlen.vn" isEnterprise={false} />)

    const purgeButton = await screen.findByRole('button', { name: /Purge 0 URL/ })
    expect(purgeButton).toBeDisabled()

    fireEvent.change(screen.getByPlaceholderText(/style\.css/), {
      target: { value: 'https://tienlen.vn/app.css\nhttps://tienlen.vn/app.js' },
    })

    expect(screen.getByRole('button', { name: /Purge 2 URL/ })).toBeEnabled()
  })

  it('shows analytics stats when the endpoint responds', async () => {
    renderWithProviders(<CacheTab zoneId="z1" zoneName="tienlen.vn" isEnterprise={false} />)

    expect(await screen.findByText('94.2')).toBeInTheDocument()
    expect(screen.getByText('cache hit')).toBeInTheDocument()
    expect(screen.getByText('bandwidth saved')).toBeInTheDocument()
  })
})
