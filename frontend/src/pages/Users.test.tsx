import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
import { useAuthStore } from '../stores/useAuthStore'
import Users from './Users'

const users = [
  {
    id: 'u1',
    email: 'xuan@tienlen.dev',
    role: 'admin',
    isActive: true,
    createdAt: '2025-11-02T00:00:00.000Z',
    cfAccountCount: 3,
    templateCount: 8,
  },
  {
    id: 'u2',
    email: 'old-dev@tienlen.dev',
    role: 'user',
    isActive: false,
    createdAt: '2025-09-30T00:00:00.000Z',
    cfAccountCount: 0,
    templateCount: 0,
  },
]

describe('Users', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.get).mockResolvedValue({ data: users })
    useAuthStore.setState({ token: `header.${btoa(JSON.stringify({ userId: 'u1', role: 'admin' }))}.sig` })
    vi.mocked(api.patch).mockResolvedValue({ data: {} })
  })

  function renderUsers() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/users']}>
          <Users />
        </MemoryRouter>
      </QueryClientProvider>,
    )
  }

  it('renders roles in editable selectors and prevents editing the current user role', async () => {
    renderUsers()
    const admin = await screen.findByText('xuan@tienlen.dev')
    expect(screen.getByText('old-dev@tienlen.dev')).toBeInTheDocument()
    expect(within(admin.closest('tr')!).getByText('Admin')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Role: xuan@tienlen.dev' })).toBeDisabled()
    expect(screen.getByRole('combobox', { name: 'Role: old-dev@tienlen.dev' })).not.toBeDisabled()
  })

  it('updates another user role with the backend enum value', async () => {
    renderUsers()
    await screen.findByText('old-dev@tienlen.dev')
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Role: old-dev@tienlen.dev' }))
    const options = await screen.findAllByText('Admin')
    const option = options.find((element) => element.closest('.ant-select-item-option'))
    expect(option).toBeDefined()
    fireEvent.click(option!)
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/users/u2', { role: 'admin' }))
  })
})
