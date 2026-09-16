import { useEffect, useState } from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import './i18n'

const { workersUnmount } = vi.hoisted(() => ({ workersUnmount: vi.fn() }))
vi.mock('./layouts/AppShell', () => ({ default: () => <>
  <aside><NavMenuGroup item={CLOUDFLARE_TOOLS_NAV} /></aside>
  <main><Outlet /></main>
</> }))
vi.mock('./pages/Domains', () => ({ default: () => <div>domains-page</div> }))
vi.mock('./pages/domain-detail', () => ({ default: () => <div>domain-detail-page</div> }))
vi.mock('./pages/WorkersPages', () => ({ default: function Workers() {
  const [params, setParams] = useSearchParams()
  const [draft, setDraft] = useState('')
  useEffect(() => () => workersUnmount(), [])
  return <div>
    <span>workers-content</span><span>workers-subtab:{params.get('tab') || 'workers'}</span>
    <input aria-label="Worker draft" value={draft} onChange={(event) => setDraft(event.target.value)} />
    <button onClick={() => setParams({ tab: 'pages', project: 'my-project' })}>Open Pages project</button>
  </div>
} }))
vi.mock('./pages/Tunnels', () => ({ default: () => <div>tunnels-content</div> }))
vi.mock('./pages/Turnstile', () => ({ default: () => <div>turnstile-content</div> }))
import App from './App'
import { useAuthStore } from './stores/useAuthStore'
import { useAccountStore } from './stores/useAccountStore'
import More from './pages/More'
import NavMenuGroup from './components/NavMenuGroup'
import { CLOUDFLARE_TOOLS_NAV } from './layouts/nav'

function LocationProbe() {
  const location = useLocation()
  const navigate = useNavigate()
  return <><output data-testid="location">{location.pathname}{location.search}</output>
    <button onClick={() => navigate(-1)}>Browser back</button></>
}
function setup(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><App /><LocationProbe /></MemoryRouter>)
}
beforeEach(() => {
  vi.clearAllMocks()
  useAuthStore.setState({ token: `header.${btoa(JSON.stringify({ userId: 'user', role: 'user' }))}.sig` })
  useAccountStore.setState({ activeAccountId: 'account-a' })
})

describe('consolidated Cloudflare navigation', () => {
  it.each([
    ['/tools', '/tools/workers', 'workers-content'],
    ['/workers?tab=pages&project=my-project', '/tools/workers?tab=pages&project=my-project', 'workers-content'],
    ['/workers?script=my-worker', '/tools/workers?script=my-worker', 'workers-content'],
    ['/tunnels?tunnel=new', '/tools/tunnels?tunnel=new', 'tunnels-content'],
    ['/turnstile?widget=new', '/tools/turnstile?widget=new', 'turnstile-content'],
    ['/analytics?zone=z1&range=7d', '/domains/z1?range=7d&tab=analytics', 'domain-detail-page'],
    ['/analytics?range=30d', '/', 'domains-page'],
    ['/tools/unknown', '/tools/workers', 'workers-content'],
  ])('redirects %s without losing relevant deep-link parameters', async (oldUrl, newUrl, content) => {
    setup(oldUrl)
    expect(await screen.findByText(content)).toBeInTheDocument()
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe(newUrl))
  })

  it('keeps the Workers/Pages subtab independent of the sidebar dropdown', async () => {
    setup('/tools/workers?tab=pages&project=my-project')
    expect(await screen.findByText('workers-subtab:pages')).toBeInTheDocument()
    const nav = screen.getByRole('group', { name: 'Cloudflare tools' })
    expect(within(nav).getByRole('link', { name: 'Workers & Pages' })).toHaveAttribute('aria-current', 'page')
    fireEvent.click(within(nav).getByRole('link', { name: 'Tunnels' }))
    expect(await screen.findByText('tunnels-content')).toBeInTheDocument()
    expect(screen.getByTestId('location').textContent).toBe('/tools/tunnels')
    expect(screen.queryByText('workers-content')).not.toBeInTheDocument()
    expect(workersUnmount).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Browser back' }))
    expect(await screen.findByText('workers-subtab:pages')).toBeInTheDocument()
    expect(screen.getByTestId('location').textContent).toBe('/tools/workers?tab=pages&project=my-project')
  })

  it('only mounts the active tool and clears drafts on tool/account changes', async () => {
    setup('/tools/workers?script=worker-a')
    fireEvent.change(await screen.findByRole('textbox', { name: 'Worker draft' }), { target: { value: 'private draft' } })
    act(() => useAccountStore.setState({ activeAccountId: 'account-b' }))
    expect(await screen.findByRole('textbox', { name: 'Worker draft' })).toHaveValue('')
    expect(workersUnmount).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('link', { name: 'Turnstile' }))
    expect(await screen.findByText('turnstile-content')).toBeInTheDocument()
    expect(screen.queryByText('workers-content')).not.toBeInTheDocument()
    expect(screen.queryByText('tunnels-content')).not.toBeInTheDocument()
    expect(screen.getByTestId('location').textContent).toBe('/tools/turnstile')
  })

  it('tool-owned query changes do not navigate out of the hub', async () => {
    setup('/tools/workers')
    fireEvent.click(await screen.findByRole('button', { name: 'Open Pages project' }))
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/tools/workers?tab=pages&project=my-project'))
    expect(screen.getByRole('link', { name: 'Workers & Pages' })).toHaveAttribute('aria-current', 'page')
  })

  it('mobile More contains an expandable tools menu and no global Analytics entry', () => {
    render(<MemoryRouter><More /></MemoryRouter>)
    const parent = screen.getByRole('button', { name: 'Cloudflare tools' })
    expect(parent).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('link', { name: 'Turnstile' })).not.toBeInTheDocument()
    fireEvent.click(parent)
    expect(parent).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('link', { name: 'Turnstile' })).toHaveAttribute('href', '/tools/turnstile')
    expect(screen.getByRole('link', { name: 'Workers & Pages' })).toHaveAttribute('href', '/tools/workers')
    expect(screen.getByRole('link', { name: 'Tunnels' })).toHaveAttribute('href', '/tools/tunnels')
    expect(screen.queryByRole('link', { name: /^Analytics/ })).not.toBeInTheDocument()
    expect(screen.getAllByRole('link').filter((link) => ['/workers', '/tunnels', '/turnstile'].includes(link.getAttribute('href') ?? ''))).toHaveLength(0)
  })

  it('does not render a horizontal tools header/navigation in page content', async () => {
    setup('/tools/turnstile?widget=new')
    await screen.findByText('turnstile-content')
    const content = within(screen.getByRole('main'))
    expect(content.queryByRole('navigation', { name: 'Cloudflare tools' })).not.toBeInTheDocument()
    expect(content.queryByText('Cloudflare tools')).not.toBeInTheDocument()
    expect(content.queryByText('Account-level services: Workers & Pages, Tunnels and Turnstile')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cloudflare tools' })).toHaveAttribute('aria-expanded', 'true')
  })
})