import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../services/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

import '../i18n'
import { api } from '../services/api'
import { useAuthStore } from '../stores/useAuthStore'
import { useCommandPalette } from '../stores/useCommandPalette'
import CommandPalette from './CommandPalette'

const apiGet = vi.mocked(api.get)

function makeToken(payload: Record<string, unknown>) {
  return `header.${btoa(JSON.stringify(payload))}.sig`
}

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname}</div>
}

function renderPalette() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/']}>
        <CommandPalette />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('CommandPalette', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiGet.mockResolvedValue({
      data: [
        { id: 'z1', name: 'tienlen.vn', status: 'active' },
        { id: 'z2', name: 'docs.tienlen.dev', status: 'pending' },
      ],
    })
    useCommandPalette.setState({ open: false })
    useAuthStore.setState({ token: makeToken({ email: 'xuan@test.dev', role: 'admin' }) })
  })

  it('opens with Ctrl+K and lists domains + navigation items', async () => {
    renderPalette()
    expect(screen.queryByPlaceholderText('Type to search…')).not.toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    expect(screen.getByPlaceholderText('Type to search…')).toBeInTheDocument()

    // Domains from GET /domains
    expect(await screen.findByText('tienlen.vn')).toBeInTheDocument()
    expect(screen.getByText('docs.tienlen.dev')).toBeInTheDocument()
    expect(apiGet).toHaveBeenCalledWith('/domains')

    // Static navigation section
    expect(screen.getByText('Navigation')).toBeInTheDocument()
    expect(screen.getByText('Domains')).toBeInTheDocument()
    expect(screen.getByText('Templates')).toBeInTheDocument()
    expect(screen.getByText('History')).toBeInTheDocument()
    expect(screen.getByText('Accounts')).toBeInTheDocument()
  })

  it('closes with Escape', async () => {
    renderPalette()
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    expect(screen.getByPlaceholderText('Type to search…')).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByPlaceholderText('Type to search…')).not.toBeInTheDocument()
  })

  it('navigates to the selected domain with Enter', async () => {
    renderPalette()
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    await screen.findByText('tienlen.vn')

    // First item (tienlen.vn) is selected by default
    const input = screen.getByPlaceholderText('Type to search…')
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(screen.getByTestId('location')).toHaveTextContent('/domains/z1')
    expect(screen.queryByPlaceholderText('Type to search…')).not.toBeInTheDocument()
  })

  it('moves the selection with arrow keys before activating', async () => {
    renderPalette()
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    await screen.findByText('tienlen.vn')

    const input = screen.getByPlaceholderText('Type to search…')
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })

    // Second item is docs.tienlen.dev → /domains/z2
    expect(screen.getByTestId('location')).toHaveTextContent('/domains/z2')
  })

  it('filters items by query and navigates to a navigation entry', async () => {
    renderPalette()
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    await screen.findByText('tienlen.vn')

    const input = screen.getByPlaceholderText('Type to search…')
    fireEvent.change(input, { target: { value: 'templ' } })

    expect(screen.queryByText('tienlen.vn')).not.toBeInTheDocument()
    expect(screen.getByText('Templates')).toBeInTheDocument()

    fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.getByTestId('location')).toHaveTextContent('/templates')
  })
})
