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
  apiErrorCode: () => undefined,
}))

import '../i18n'
import { api } from '../services/api'
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
  })

  it('renders user rows with role tags', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/users']}>
          <Users />
        </MemoryRouter>
      </QueryClientProvider>,
    )
    expect(await screen.findByText('xuan@tienlen.dev')).toBeInTheDocument()
    expect(screen.getByText('old-dev@tienlen.dev')).toBeInTheDocument()
    expect(screen.getByText('admin')).toBeInTheDocument()
  })
})
