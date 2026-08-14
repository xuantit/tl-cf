import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
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
import { useFocusMode } from '../stores/useFocusMode'
import AppShell from './AppShell'

const apiGet = vi.mocked(api.get)

function makeToken(payload: Record<string, unknown>) {
  return `header.${btoa(JSON.stringify(payload))}.sig`
}

function renderShell(path = '/', role = 'admin') {
  useAuthStore.setState({ token: makeToken({ email: 'xuan@test.dev', role }) })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<div>home-page</div>} />
            <Route path="history" element={<div>history-page</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('AppShell', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiGet.mockResolvedValue({ data: [] })
    useCommandPalette.setState({ open: false })
    useFocusMode.setState({ active: false })
  })

  it('renders sidebar nav items, brand and outlet content', async () => {
    renderShell('/')
    expect(await screen.findByText('home-page')).toBeInTheDocument()
    // Brand appears in the sidebar and the mobile top bar (CSS breakpoints don't apply in jsdom)
    expect(screen.getAllByText('CF Tool').length).toBeGreaterThanOrEqual(1)
    // Sidebar + mobile bottom nav both contain Domains / History
    expect(screen.getAllByText('Domains').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Templates')).toBeInTheDocument()
    expect(screen.getAllByText('History').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Accounts')).toBeInTheDocument()
    // Admin-only items
    expect(screen.getByText('Users')).toBeInTheDocument()
    expect(screen.getByText('Audit log')).toBeInTheDocument()
    // User footer email
    expect(screen.getByText('xuan@test.dev')).toBeInTheDocument()
  })

  it('hides admin nav items for non-admin users', async () => {
    renderShell('/', 'user')
    expect(await screen.findByText('home-page')).toBeInTheDocument()
    expect(screen.queryByText('Users')).not.toBeInTheDocument()
    expect(screen.queryByText('Audit log')).not.toBeInTheDocument()
  })

  it('marks the current route as active', async () => {
    renderShell('/history')
    expect(await screen.findByText('history-page')).toBeInTheDocument()
    const historyLinks = screen.getAllByRole('link', { name: /History/ })
    expect(historyLinks.some((l) => l.className.includes('bg-accent-soft'))).toBe(true)
    const domainLinks = screen.getAllByRole('link', { name: /Domains/ })
    expect(domainLinks.every((l) => !l.className.includes('bg-accent-soft'))).toBe(true)
  })

  it('opens the command palette from the quick search button', async () => {
    renderShell('/')
    fireEvent.click(screen.getByRole('button', { name: /Quick find/ }))
    expect(await screen.findByPlaceholderText('Type to search…')).toBeInTheDocument()
  })

  it('collapses the desktop sidebar when focus mode is active', async () => {
    const { container } = renderShell('/')
    expect(await screen.findByText('home-page')).toBeInTheDocument()

    const aside = container.querySelector('aside')
    expect(aside).not.toBeNull()
    expect(aside!.className).toContain('w-[264px]')
    expect(aside!.className).not.toContain('w-0')

    act(() => {
      useFocusMode.setState({ active: true })
    })
    expect(aside!.className).toContain('w-0')
    expect(aside!.className).not.toContain('w-[264px]')

    act(() => {
      useFocusMode.setState({ active: false })
    })
    expect(aside!.className).toContain('w-[264px]')
  })
})
