import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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

describe('Domains copy config / clone', () => {
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
            type: 'copy-config',
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

  it('copies config from a chosen source to the selected targets with only checked components', async () => {
    renderDomains()
    expect(await screen.findByText('shop-abc.com')).toBeInTheDocument()

    // Select z1 + z2 in the table (index 0 is select-all)
    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[1])
    fireEvent.click(checkboxes[2])

    fireEvent.click(screen.getAllByRole('button', { name: /Copy config/ })[0])
    // "Source domain" label exists in both always-mounted panels (copy + clone)
    expect((await screen.findAllByText('Source domain')).length).toBeGreaterThanOrEqual(1)

    // Pick tienlen.vn (z2) as source — targets become the selection minus the source
    fireEvent.mouseDown(within(screen.getByTestId('copy-source')).getByRole('combobox'))
    // Title xuất hiện cả ở tag của target multi-select — chỉ click option trong dropdown
    const sourceOptions = await screen.findAllByTitle('tienlen.vn')
    const sourceOption = sourceOptions.find((el) => el.closest('.ant-select-item-option'))
    expect(sourceOption).toBeTruthy()
    fireEvent.click(sourceOption!)

    // Uncheck "Page Rules" (first match = copy panel; the clone panel renders its own set)
    fireEvent.click(screen.getAllByRole('checkbox', { name: 'Page Rules' })[0])

    fireEvent.click(screen.getByRole('button', { name: 'Copy to 1 domains' }))
    await waitFor(() =>
      expect(apiPost).toHaveBeenCalledWith('/domains/copy-config', {
        sourceZoneId: 'z2',
        sourceZoneName: 'tienlen.vn',
        targets: [{ zoneId: 'z1', zoneName: 'shop-abc.com' }],
        components: ['dns', 'settings', 'rules', 'securityRules'],
        dnsMode: 'skip',
      }),
    )
  })

  it('disables copy submit while no source is chosen', async () => {
    renderDomains()
    expect(await screen.findByText('shop-abc.com')).toBeInTheDocument()

    fireEvent.click(screen.getAllByRole('checkbox')[1])
    fireEvent.click(screen.getAllByRole('button', { name: /Copy config/ })[0])

    expect(screen.getByRole('button', { name: 'Copy to 1 domains' })).toBeDisabled()
  })

  it('row Copy action opens the panel with that domain preselected as source', async () => {
    renderDomains()
    expect(await screen.findByText('shop-abc.com')).toBeInTheDocument()

    // Nút Copy của dòng đầu (z1 = shop-abc.com)
    fireEvent.click(screen.getAllByRole('button', { name: 'Copy' })[0])

    // Nguồn đã điền sẵn shop-abc.com
    const sourceBox = screen.getByTestId('copy-source')
    expect(within(sourceBox).getByText('shop-abc.com')).toBeInTheDocument()
    // Chưa có đích (không tick gì trong bảng) → nút submit disabled
    expect(screen.getByRole('button', { name: 'Copy to 0 domains' })).toBeDisabled()
  })

  it('clone panel validates domain lines and POSTs the clone body', async () => {
    renderDomains()
    expect(await screen.findByText('shop-abc.com')).toBeInTheDocument()

    // Row action on the first row (z1)
    fireEvent.click(screen.getAllByRole('button', { name: 'Clone' })[0])
    expect(await screen.findByText('Clone domain')).toBeInTheDocument()

    const textarea = screen.getByPlaceholderText(/newshop\.com/)
    fireEvent.change(textarea, {
      target: { value: 'newdomain.com\nbad_domain\nNEWDOMAIN.com' },
    })

    // 1 valid (dedup + case-insensitive), 1 invalid
    expect(await screen.findByText('1 valid')).toBeInTheDocument()
    expect(screen.getByText('1 errors')).toBeInTheDocument()
    expect(screen.getByText('bad_domain')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Clone to 1 domains' }))
    await waitFor(() =>
      expect(apiPost).toHaveBeenCalledWith('/domains/clone', {
        sourceZoneId: 'z1',
        sourceZoneName: 'shop-abc.com',
        newDomains: ['newdomain.com'],
        components: ['dns', 'settings', 'rules', 'securityRules', 'pageRules'],
        dnsMode: 'skip',
      }),
    )
  })
})
