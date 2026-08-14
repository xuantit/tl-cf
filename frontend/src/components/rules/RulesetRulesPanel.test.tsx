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
  apiErrorDetail: () => undefined,
}))

import '../../i18n'
import { api } from '../../services/api'
import RulesetRulesPanel from './RulesetRulesPanel'
import type { RuleKind } from './ruleFields'

function renderPanel(zoneId: string, kind: RuleKind, initialEntries: string[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={initialEntries}>
        <RulesetRulesPanel zoneId={zoneId} kind={kind} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('RulesetRulesPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the section header and add button for its kind', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { rules: [], quota: { used: 0 }, warnings: [] } })

    renderPanel('z1', 'configuration', ['/domains/z1?tab=rules'])

    expect(await screen.findByText('Configuration Rules')).toBeInTheDocument()
    expect(screen.getByText('0 active')).toBeInTheDocument()
    // "Add Rule" ở nút mở panel và ở tiêu đề panel (đang đóng)
    expect(screen.getAllByText('Add Rule').length).toBeGreaterThan(0)
  })

  it('loads rules for the zone and kind', async () => {
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

    renderPanel('z1', 'redirect', ['/domains/z1?tab=rules'])

    expect(await screen.findByText('Redirect old path')).toBeInTheDocument()
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/rules/z1/redirect'))
  })

  it('opens the modal from a legacy ?kind=&modal=add link', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { rules: [], quota: { used: 0 }, warnings: [] } })

    renderPanel('z1', 'cache', ['/domains/z1?tab=cache&kind=cache&modal=add'])

    expect(await screen.findByText('If incoming requests match')).toBeInTheDocument()
    expect(screen.getByText('Expression Preview')).toBeInTheDocument()
    expect(screen.getByLabelText('Cache eligibility')).toBeInTheDocument()
  })
})
