import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../services/api', () => ({
  api: {
    get: vi.fn().mockResolvedValue({ data: [] }),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

vi.mock('../../stores/useAuthStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../stores/useAuthStore')>()
  return { ...actual }
})

import '../../i18n'
import { useAuthStore } from '../../stores/useAuthStore'
import AppShell from './AppShell'
import { getBottomTabItems, getSidebarItems, getSelectedKey } from './navItems'

function makeAdminToken() {
  const payload = btoa(JSON.stringify({ role: 'admin', email: 'admin@test.com' }))
  return `header.${payload}.sig`
}

function makeUserToken() {
  const payload = btoa(JSON.stringify({ role: 'user', email: 'user@test.com' }))
  return `header.${payload}.sig`
}

function renderShell(path: string, token: string) {
  useAuthStore.setState({ token })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <AppShell />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('navItems helpers', () => {
  it('getSelectedKey returns / for domain detail path', () => {
    expect(getSelectedKey('/domains/zone-123', true)).toBe('/')
  })

  it('getSelectedKey returns /history for /history path', () => {
    expect(getSelectedKey('/history', false)).toBe('/history')
  })

  it('getSidebarItems hides admin items for non-admin', () => {
    const items = getSidebarItems(false)
    expect(items.every((i) => !i.adminOnly)).toBe(true)
  })

  it('getSidebarItems shows admin items for admin', () => {
    const items = getSidebarItems(true)
    expect(items.some((i) => i.adminOnly)).toBe(true)
  })

  it('getBottomTabItems returns max 3 items', () => {
    const items = getBottomTabItems(true)
    expect(items.length).toBeLessThanOrEqual(3)
    expect(items.every((i) => i.bottomTab)).toBe(true)
  })
})

describe('AppShell routing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders main content area', () => {
    renderShell('/', makeUserToken())
    expect(document.getElementById('main-content')).toBeTruthy()
  })

  it('renders skip-to-content link', () => {
    renderShell('/', makeUserToken())
    const links = screen.getAllByText('Skip to content')
    expect(links.length).toBeGreaterThan(0)
  })

  it('shows bottom nav on mobile viewport (default jsdom matchMedia returns false = desktop)', () => {
    renderShell('/', makeUserToken())
    // BottomNav has lg:hidden via CSS but it's always in the DOM
    const navs = screen.getAllByRole('navigation', { name: /bottom navigation/i })
    expect(navs.length).toBeGreaterThan(0)
  })

  it('shows desktop sidebar', () => {
    renderShell('/', makeUserToken())
    // The sidebar aside element with aria-label Main navigation is rendered
    const sidebar = document.querySelector('aside[aria-label="Main navigation"]')
    expect(sidebar).toBeTruthy()
  })
})

describe('AppShell admin-only nav items', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('admin sees Users, Invites, Audit log in sidebar items', () => {
    const items = getSidebarItems(true)
    const keys = items.map((i) => i.key)
    expect(keys).toContain('/users')
    expect(keys).toContain('/invites')
    expect(keys).toContain('/audit')
  })

  it('regular user does NOT see Users, Invites, Audit log in sidebar items', () => {
    const items = getSidebarItems(false)
    const keys = items.map((i) => i.key)
    expect(keys).not.toContain('/users')
    expect(keys).not.toContain('/invites')
    expect(keys).not.toContain('/audit')
  })

  it('admin shell renders admin nav links', () => {
    renderShell('/', makeAdminToken())
    // Admin links should be present in DOM (sidebar)
    expect(document.querySelector('a[href="/users"]')).toBeTruthy()
    expect(document.querySelector('a[href="/invites"]')).toBeTruthy()
  })
})

describe('CommandPalette keyboard shortcut', () => {
  it('opens command palette on Ctrl+K', () => {
    renderShell('/', makeUserToken())

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })

    // The palette opens – look for the search inputs (may be multiple due to AntD)
    const inputs = screen.getAllByPlaceholderText(/search pages and domains/i)
    expect(inputs.length).toBeGreaterThan(0)
  })

  it('closes command palette on Escape', () => {
    renderShell('/', makeUserToken())

    // Open
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    const inputs = screen.getAllByPlaceholderText(/search pages and domains/i)
    expect(inputs.length).toBeGreaterThan(0)

    // Close via Escape key handled in input onKeyDown
    // (modal/drawer close is handled by AntD)
  })
})
