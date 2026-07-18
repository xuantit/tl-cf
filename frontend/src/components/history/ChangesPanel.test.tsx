import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../services/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

import '../../i18n'
import { api } from '../../services/api'
import ChangesPanel from './ChangesPanel'

function renderPanel(initialEntries: string[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={initialEntries}>
        <ChangesPanel />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const sampleChange = {
  id: 'c1',
  ownerId: 'u1',
  accountId: null,
  zoneId: 'z1',
  action: 'dns.update',
  status: 'done',
  reversible: true,
  jobId: null,
  createdAt: new Date('2026-07-11T10:00:00Z').toISOString(),
  finishedAt: null,
  items: [],
}

describe('ChangesPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders change rows', async () => {
    ;(api.get as any).mockResolvedValue({ data: [sampleChange] })

    renderPanel(['/history?tab=changes'])

    expect(await screen.findByText('dns.update')).toBeInTheDocument()
  })

  it('shows zone filter tag and passes zoneId to the query', async () => {
    ;(api.get as any).mockResolvedValue({ data: [sampleChange] })

    renderPanel(['/history?tab=changes&zone=z1'])

    await screen.findByText('dns.update')
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/changes', { params: { zoneId: 'z1' } }))
  })
})
