import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
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
import { useThemeStore } from '../stores/useThemeStore'
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
            <Route path="tools/:tool" element={<div>tools-page</div>} />
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
    useThemeStore.setState({ dark: true })
  })

  it('renders sidebar nav items, brand and outlet content', async () => {
    renderShell('/')
    expect(await screen.findByText('home-page')).toBeInTheDocument()
    // Brand appears in the sidebar and the mobile top bar (CSS breakpoints don't apply in jsdom)
    expect(screen.getAllByText('CF Tool').length).toBeGreaterThanOrEqual(1)
    // Sidebar + mobile bottom nav both contain Domains / History
    expect(screen.getAllByText('Domains').length).toBeGreaterThanOrEqual(1)
    expect(within(screen.getByRole('navigation', { name: 'Workspace navigation' })).getByText('Templates')).toBeInTheDocument()
    expect(screen.getAllByText('History').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Accounts')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cloudflare tools' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('link', { name: /Analytics/ })).not.toBeInTheDocument()
    expect(within(screen.getByRole('navigation', { name: 'Workspace navigation' })).queryByRole('link', { name: /Workers|Tunnels|Turnstile/ })).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Workspace shortcuts' })).toBeInTheDocument()
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

  it('keeps account switching and theme controls in the shared top bar', async () => {
    renderShell('/history')
    await screen.findByText('history-page')
    const topbar = screen.getByRole('banner')
    expect(await within(topbar).findByText('No CF account')).toBeInTheDocument()
    fireEvent.click(within(topbar).getByRole('button', { name: 'Light mode' }))
    expect(useThemeStore.getState().dark).toBe(false)
    fireEvent.click(within(topbar).getByRole('button', { name: 'Dark mode' }))
    expect(useThemeStore.getState().dark).toBe(true)
    expect(screen.queryByRole('region', { name: 'Workspace shortcuts' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveAttribute('href', '#workspace-main')
    expect(screen.getByRole('main')).toHaveAttribute('id', 'workspace-main')
  })

  it('opens a workspace shortcut without changing its tools route', async () => {
    renderShell('/')
    const shortcuts = screen.getByRole('region', { name: 'Workspace shortcuts' })
    fireEvent.click(within(shortcuts).getByRole('link', { name: /Tunnels/ }))
    expect(await screen.findByText('tools-page')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Workspace shortcuts' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Tunnels' })).toHaveAttribute('aria-current', 'page')
  })

  it.each(['workers', 'tunnels', 'turnstile'])('highlights the same tools navigation entry on %s', async (tool) => {
    renderShell(`/tools/${tool}`)
    await screen.findByText('tools-page')
    const parent = screen.getByRole('button', { name: 'Cloudflare tools' })
    expect(parent).toHaveAttribute('aria-expanded', 'true')
    expect(parent.className).toContain('bg-accent-soft')
    const group = screen.getByRole('group', { name: 'Cloudflare tools' })
    const activeLinks = within(group).getAllByRole('link').filter((link) => link.getAttribute('aria-current') === 'page')
    expect(activeLinks).toHaveLength(1)
    expect(activeLinks[0]).toHaveAttribute('href', `/tools/${tool}`)
  })

  it('expands/collapses tools inline without navigating, then opens the selected child', async () => {
    renderShell('/')
    await screen.findByText('home-page')
    const parent = screen.getByRole('button', { name: 'Cloudflare tools' })
    expect(parent).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('link', { name: 'Tunnels' })).not.toBeInTheDocument()
    fireEvent.click(parent)
    expect(parent).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('home-page')).toBeInTheDocument()
    const group = screen.getByRole('group', { name: 'Cloudflare tools' })
    expect(group.id).toBe(parent.getAttribute('aria-controls'))
    expect(within(group).getAllByRole('link')).toHaveLength(3)
    fireEvent.click(parent)
    expect(screen.queryByRole('group', { name: 'Cloudflare tools' })).not.toBeInTheDocument()
    fireEvent.click(parent)
    fireEvent.click(screen.getByRole('link', { name: 'Tunnels' }))
    expect(await screen.findByText('tools-page')).toBeInTheDocument()
    expect(parent).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('link', { name: 'Tunnels' })).toHaveAttribute('aria-current', 'page')
    fireEvent.click(parent)
    expect(parent).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText('tools-page')).toBeInTheDocument()
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
    expect(aside).toHaveAttribute('inert')

    act(() => {
      useFocusMode.setState({ active: false })
    })
    expect(aside!.className).toContain('w-[264px]')
    expect(aside).not.toHaveAttribute('inert')
  })
})
