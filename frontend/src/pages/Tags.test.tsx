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
import Tags from './Tags'

const apiGet = vi.mocked(api.get)
const apiPost = vi.mocked(api.post)

const tags = [
  {
    name: 'prod',
    domainCount: 142,
    description: 'Production environment',
    templateId: 'tpl1',
    createdAt: '2025-11-02T00:00:00.000Z',
  },
  { name: 'shop', domainCount: 24, description: null, templateId: null },
]

const rules = [
  { id: 'r1', field: 'name', op: 'endsWith', value: '.shop', tag: 'shop', enabled: true },
]

function renderTags() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/tags']}>
        <Tags />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('Tags', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiGet.mockImplementation(async (url: string) => {
      if (url === '/tags') return { data: tags }
      if (url === '/tags/rules') return { data: rules }
      if (url === '/templates') return { data: [{ id: 'tpl1', name: 'shop-hardening' }] }
      if (url === '/domains') return { data: [] }
      return { data: [] }
    })
    apiPost.mockImplementation(async (url: string) => {
      if (url === '/tags/rules/r1/preview') return { data: { matchedCount: 8, sample: ['a.shop'] } }
      return { data: {} }
    })
  })

  it('renders tag rows with counts, template names and rules', async () => {
    renderTags()
    expect(await screen.findByText('prod')).toBeInTheDocument()
    expect(screen.getByText('142')).toBeInTheDocument()
    expect(screen.getByText('Production environment')).toBeInTheDocument()
    expect(screen.getByText('shop-hardening')).toBeInTheDocument()

    // Auto-tag rule row
    expect(screen.getByText('.shop')).toBeInTheDocument()
    expect(screen.getByText(/name endsWith/)).toBeInTheDocument()
  })

  it('creates a tag through the modal', async () => {
    renderTags()
    expect(await screen.findByText('prod')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Create tag/ }))
    const nameInput = await screen.findByPlaceholderText('prod')
    fireEvent.change(nameInput, { target: { value: 'staging' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(apiPost).toHaveBeenCalledWith('/tags', expect.objectContaining({ name: 'staging' })),
    )
  })

  it('shows the matched count after clicking a rule preview', async () => {
    renderTags()
    expect(await screen.findByText('.shop')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /count matches/ }))
    await waitFor(() => expect(apiPost).toHaveBeenCalledWith('/tags/rules/r1/preview'))
    expect(await screen.findByText('8 zones')).toBeInTheDocument()
  })
})
