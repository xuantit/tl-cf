import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../services/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
  apiErrorDetail: () => undefined,
}))

import '../i18n'
import { api } from '../services/api'
import { useSelectionMode } from '../stores/useSelectionMode'
import Domains from './Domains'

const apiGet = vi.mocked(api.get)
const apiPost = vi.mocked(api.post)

const zones = [
  { id: 'z1', name: 'shop-abc.com', status: 'active', plan: 'pro', sslMode: 'full', tags: ['shop'] },
  { id: 'z2', name: 'tienlen.vn', status: 'active', tags: ['core'] },
  { id: 'z3', name: 'old-shop.vn', status: 'pending' },
]

function renderDomains(path = '/') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/" element={<Domains />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('Domains', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useSelectionMode.setState({ on: false })
    apiGet.mockImplementation(async (url: string) => {
      if (url === '/domains') return { data: zones }
      if (url === '/cf/accounts')
        return {
          data: [{ id: 'a1', label: 'Main account', authType: 'apiToken', isActive: true, domainsCount: 3 }],
        }
      if (url.startsWith('/jobs/'))
        return {
          data: {
            id: 'j1',
            type: 'bulk-delete',
            status: 'done',
            total: 1,
            processed: 1,
            succeeded: 1,
            failed: 0,
            items: [],
            createdAt: 0,
          },
        }
      return { data: [] }
    })
    apiPost.mockResolvedValue({ data: { jobId: 'j1' } })
  })

  it('renders domain rows and tab counts', async () => {
    renderDomains()
    expect(await screen.findByText('shop-abc.com')).toBeInTheDocument()
    expect(screen.getByText('tienlen.vn')).toBeInTheDocument()
    expect(screen.getByText('old-shop.vn')).toBeInTheDocument()

    expect(screen.getByRole('button', { name: /^All/ })).toHaveTextContent('3')
    expect(screen.getByRole('button', { name: /^Active/ })).toHaveTextContent('2')
    expect(screen.getByRole('button', { name: /^Pending/ })).toHaveTextContent('1')

    // Tags render through the Tag primitive
    expect(screen.getByText('shop')).toBeInTheDocument()
  })

  it('filters rows by status tab', async () => {
    renderDomains()
    expect(await screen.findByText('shop-abc.com')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /^Pending/ }))
    await waitFor(() => expect(screen.queryByText('shop-abc.com')).not.toBeInTheDocument())
    expect(screen.getByText('old-shop.vn')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /^All/ }))
    expect(await screen.findByText('shop-abc.com')).toBeInTheDocument()
  })

  it('shows the bulk action bar with the selected count', async () => {
    renderDomains()
    expect(await screen.findByText('shop-abc.com')).toBeInTheDocument()

    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[1]) // first row (index 0 is select-all)

    // Bar renders desktop + mobile layouts (jsdom applies no CSS breakpoints)
    expect((await screen.findAllByText(/1 domain/)).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByRole('button', { name: /Purge cache/ }).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByRole('button', { name: /DNS replace/ }).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByRole('button', { name: /Assign tags/ }).length).toBeGreaterThanOrEqual(1)

    // Selecting a second row updates the count
    fireEvent.click(checkboxes[2])
    expect((await screen.findAllByText(/2 domain/)).length).toBeGreaterThanOrEqual(1)
  })

  it('requires typing the confirm text before bulk delete', async () => {
    renderDomains()
    expect(await screen.findByText('shop-abc.com')).toBeInTheDocument()

    fireEvent.click(screen.getAllByRole('checkbox')[1])
    fireEvent.click(screen.getAllByRole('button', { name: /▢ Delete/ })[0])

    expect(await screen.findByText('Delete 1 zones from Cloudflare?')).toBeInTheDocument()
    const confirmButton = screen.getByRole('button', { name: 'Delete permanently' })
    expect(confirmButton).toBeDisabled()

    const input = screen.getByPlaceholderText('delete 1 zone')
    fireEvent.change(input, { target: { value: 'wrong text' } })
    expect(confirmButton).toBeDisabled()

    fireEvent.change(input, { target: { value: 'delete 1 zone' } })
    expect(confirmButton).toBeEnabled()

    fireEvent.click(confirmButton)
    await waitFor(() =>
      expect(apiPost).toHaveBeenCalledWith('/domains/bulk', { action: 'delete', zoneIds: ['z1'] }),
    )
  })
})
