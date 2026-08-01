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
import ModernRulesPanel from './ModernRulesPanel'

function renderPanel(zoneId: string, initialEntries: string[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={initialEntries}>
        <ModernRulesPanel zoneId={zoneId} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('ModernRulesPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders kind tabs and add button', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { rules: [], quota: { used: 0 }, warnings: [] } })

    renderPanel('z1', ['/domains/z1?tab=rules'])

    expect(await screen.findByText('Redirect Rules')).toBeInTheDocument()
    expect(screen.getByText('Cache Rules')).toBeInTheDocument()
    expect(screen.getByText('Configuration Rules')).toBeInTheDocument()
    expect(screen.getByText('Add Rule')).toBeInTheDocument()
  })

  it('loads rules for the zone and kind from URL', async () => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === '/rules/z1/redirect') {
        return Promise.resolve({
          data: {
            rules: [
              {
                id: 'r1',
                enabled: true,
                description: 'Redirect old path',
                expression: 'true',
                action: 'redirect',
                position: 1,
              },
            ],
            quota: { used: 1 },
            warnings: [],
          },
        })
      }
      return Promise.resolve({ data: { rules: [], quota: { used: 0 }, warnings: [] } })
    })

    renderPanel('z1', ['/domains/z1?tab=rules&kind=redirect'])

    expect(await screen.findByText('Redirect old path')).toBeInTheDocument()
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/rules/z1/redirect'))
  })
})
