import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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
  apiErrorCode: () => undefined,
}))

import '../i18n'
import { api } from '../services/api'
import Settings from './Settings'

const apiGet = vi.mocked(api.get)
const apiPost = vi.mocked(api.post)
const apiPatch = vi.mocked(api.patch)

const me = {
  userId: 'u1',
  email: 'xuan@tienlen.dev',
  role: 'admin',
  displayName: 'Xuân',
  createdAt: '2026-01-01T00:00:00.000Z',
}

function renderSettings(path = '/settings') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Settings />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('Settings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiGet.mockResolvedValue({ data: me })
    apiPatch.mockResolvedValue({ data: me })
    apiPost.mockResolvedValue({ data: { ok: true } })
  })

  it('blocks change-password client-side when the confirmation does not match', async () => {
    renderSettings()
    expect(await screen.findByDisplayValue('xuan@tienlen.dev')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'oldpass123' } })
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'newpass-123' } })
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'different' } })

    expect(screen.getByText(/Passwords do not match/)).toBeInTheDocument()
    const submit = screen.getByRole('button', { name: 'Change password' })
    expect(submit).toBeDisabled()
    expect(apiPost).not.toHaveBeenCalled()

    // Fixing the confirmation enables the submit and fires the request
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'newpass-123' } })
    expect(submit).toBeEnabled()
    fireEvent.click(submit)
    await waitFor(() =>
      expect(apiPost).toHaveBeenCalledWith('/auth/change-password', {
        currentPassword: 'oldpass123',
        newPassword: 'newpass-123',
      }),
    )
  })

  it('saves the display name via PATCH /auth/me', async () => {
    renderSettings()
    const input = await screen.findByPlaceholderText('Display name')
    expect(input).toHaveValue('Xuân')

    fireEvent.change(input, { target: { value: 'Xuân Tít' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }))

    await waitFor(() =>
      expect(apiPatch).toHaveBeenCalledWith('/auth/me', { displayName: 'Xuân Tít' }),
    )
  })

  it('lists sessions on the security tab and revokes one', async () => {
    const sessions = [
      {
        id: 's1',
        userAgent: 'Mozilla/5.0 (Macintosh) Chrome/126',
        ip: '113.161.44.2',
        createdAt: '2026-07-28T08:00:00.000Z',
        lastSeenAt: '2026-07-28T08:30:00.000Z',
        current: true,
      },
      {
        id: 's2',
        userAgent: 'Mozilla/5.0 (iPhone) Safari/17',
        ip: '27.72.100.8',
        createdAt: '2026-07-27T10:00:00.000Z',
        lastSeenAt: '2026-07-28T05:00:00.000Z',
        current: false,
      },
    ]
    apiGet.mockImplementation(async (url: string) => {
      if (url === '/auth/sessions') return { data: sessions }
      return { data: me }
    })
    const apiDelete = vi.mocked(api.delete)
    apiDelete.mockResolvedValue({ data: { ok: true } })

    renderSettings('/settings?tab=security')
    expect(await screen.findByText('113.161.44.2')).toBeInTheDocument()
    expect(screen.getByText('current')).toBeInTheDocument()

    // Revoke the non-current session (opens a Popconfirm, then confirm)
    fireEvent.click(screen.getByRole('button', { name: 'revoke' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Revoke' }))
    await waitFor(() => expect(apiDelete).toHaveBeenCalledWith('/auth/sessions/s2'))
  })
})
