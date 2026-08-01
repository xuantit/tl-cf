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
import AuditLog from './AuditLog'

const auditResponse = {
  total: 2,
  page: 1,
  limit: 50,
  items: [
    {
      id: 'a1',
      userId: 'u1',
      email: 'xuan@tienlen.dev',
      method: 'POST',
      path: '/api/domains/z1/purge',
      status: 200,
      meta: null,
      ip: '113.161.44.2',
      createdAt: '2026-07-28T08:41:02.118Z',
    },
    {
      id: 'a2',
      userId: null,
      email: null,
      method: 'POST',
      path: '/api/auth/login',
      status: 401,
      meta: null,
      ip: '45.9.148.77',
      createdAt: '2026-07-27T14:03:02.881Z',
    },
  ],
}

describe('AuditLog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.get).mockResolvedValue({ data: auditResponse })
  })

  it('renders audit rows with actor, ip and status code', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/audit']}>
          <AuditLog />
        </MemoryRouter>
      </QueryClientProvider>,
    )
    expect(await screen.findByText('xuan@tienlen.dev')).toBeInTheDocument()
    expect(screen.getByText('113.161.44.2')).toBeInTheDocument()
    expect(screen.getByText('200')).toBeInTheDocument()
    expect(screen.getByText('401')).toBeInTheDocument()
  })
})
