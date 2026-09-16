import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import '../i18n'

vi.mock('../services/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
  apiErrorDetail: (error: { response?: { data?: { detail?: string } } }) => error.response?.data?.detail,
}))
vi.mock('../lib/antdApp', () => ({ message: { success: vi.fn(), error: vi.fn() } }))
import { api } from '../services/api'
import { useAccountStore } from '../stores/useAccountStore'
import { useUiPrefStore } from '../stores/useUiPrefStore'
import Turnstile from './Turnstile'

const cfAccountId = 'a'.repeat(32)
const widget = { sitekey: '0x4AAAA-sitekey1', name: 'Signup widget', domains: ['example.com'], mode: 'managed', clearanceLevel: 'no_clearance', region: 'world', offlabel: false, ephemeralId: false, botFightMode: false }
const privateSecret = 'test-secret-not-for-query-cache'
function setup(entry = '/turnstile') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return { client, ...render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[entry]}><Turnstile /></MemoryRouter></QueryClientProvider>) }
}

beforeEach(() => {
  vi.clearAllMocks()
  useAccountStore.setState({ activeAccountId: 'saved-a' })
  useUiPrefStore.setState({ confirmDanger: true })
  vi.mocked(api.get).mockImplementation(async (url) => {
    if (url === '/turnstile/accounts') return { data: { accounts: [{ id: cfAccountId, name: 'Cloudflare A' }] } }
    if (url === '/turnstile/widgets') return { data: { widgets: [widget], total: 1, page: 1, perPage: 20 } }
    if (url === `/turnstile/widgets/${widget.sitekey}`) return { data: widget }
    throw new Error(`Unexpected API URL: ${url}`)
  })
  vi.mocked(api.post).mockResolvedValue({ data: { secret: privateSecret } })
  vi.mocked(api.put).mockResolvedValue({ data: widget })
  vi.mocked(api.delete).mockResolvedValue({ data: undefined })
})

describe('Turnstile management page', () => {
  it('renders navigation data scoped to the saved credential and Cloudflare account', async () => {
    setup()
    expect(await screen.findByRole('button', { name: 'Signup widget' })).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith('/turnstile/widgets', expect.objectContaining({ params: { accountId: 'saved-a', cfAccountId, page: 1, perPage: 20 } }))
    expect(screen.getByRole('link', { name: /Cloudflare dashboard/ })).toHaveAttribute('href', `https://dash.cloudflare.com/${cfAccountId}/turnstile`)
    expect(screen.getByText(/Managing widgets does not automatically enable CAPTCHA/)).toBeInTheDocument()
  })

  it('shows no-account guidance without making an API request', () => {
    useAccountStore.setState({ activeAccountId: null })
    setup()
    expect(screen.getByText('No CF account')).toBeInTheDocument()
    expect(api.get).not.toHaveBeenCalled()
  })

  it('shows empty-state instead of a misleading blank table', async () => {
    vi.mocked(api.get).mockImplementation(async (url) => url === '/turnstile/accounts'
      ? { data: { accounts: [{ id: cfAccountId, name: 'Cloudflare A' }] } }
      : { data: { widgets: [], total: 0, page: 1, perPage: 20 } })
    setup()
    expect(await screen.findByText('No Turnstile widgets')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('shows missing-permission error and guidance', async () => {
    vi.mocked(api.get).mockImplementation(async (url) => {
      if (url === '/turnstile/accounts') return { data: { accounts: [{ id: cfAccountId, name: 'Cloudflare A' }] } }
      throw { response: { status: 403, data: { detail: 'Missing Turnstile permission' } } }
    })
    setup()
    expect(await screen.findByText('Missing Turnstile permission')).toBeInTheDocument()
    expect(screen.getByText(/Turnstile Sites Read/)).toBeInTheDocument()
  })

  it('supports manual Cloudflare Account ID when account discovery is forbidden', async () => {
    vi.mocked(api.get).mockImplementation(async (url) => {
      if (url === '/turnstile/accounts') throw { response: { status: 403 } }
      return { data: { widgets: [widget], total: 1, page: 1, perPage: 20 } }
    })
    setup()
    expect(await screen.findByText(/Account discovery failed/)).toBeInTheDocument()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Cloudflare Account ID' }), { target: { value: cfAccountId } })
    fireEvent.click(screen.getByRole('button', { name: 'Use ID' }))
    expect(await screen.findByRole('button', { name: widget.name })).toBeInTheDocument()
  })

  it('creates a widget with safe managed/no-clearance defaults', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: widget })
    setup()
    await screen.findByRole('button', { name: widget.name })
    fireEvent.click(screen.getByRole('button', { name: /Add widget/ }))
    fireEvent.change(screen.getByLabelText('Widget name'), { target: { value: 'New widget' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Hostnames' }), { target: { value: 'example.com,' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/turnstile/widgets', {
      name: 'New widget', domains: ['example.com'], mode: 'managed', clearanceLevel: 'no_clearance',
    }, { params: { accountId: 'saved-a', cfAccountId } }))
  })

  it('loads a deep-linked widget and updates only editable fields', async () => {
    setup(`/turnstile?widget=${widget.sitekey}`)
    const name = await screen.findByLabelText('Widget name')
    expect(name).toHaveValue(widget.name)
    fireEvent.change(name, { target: { value: 'Changed widget' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(api.put).toHaveBeenCalledWith(`/turnstile/widgets/${widget.sitekey}`, {
      name: 'Changed widget', domains: ['example.com'], mode: 'managed', clearanceLevel: 'no_clearance',
    }, { params: { accountId: 'saved-a', cfAccountId } }))
  })

  it('requires an explicit secret reveal and never caches it', async () => {
    const { client } = setup(`/turnstile?widget=${widget.sitekey}`)
    fireEvent.click(await screen.findByRole('button', { name: 'Reveal secret' }))
    expect(await screen.findByLabelText('Secret key', { selector: 'input' })).toHaveValue(privateSecret)
    expect(JSON.stringify(client.getQueryCache().getAll().map((query) => query.state.data))).not.toContain(privateSecret)
    expect(JSON.stringify(client.getMutationCache().getAll().map((mutation) => mutation.state.data))).not.toContain(privateSecret)
    fireEvent.click(screen.getByRole('button', { name: 'Hide secret' }))
    expect(screen.queryByLabelText('Secret key', { selector: 'input' })).not.toBeInTheDocument()
  })

  it('clears secrets on close and when saved account changes', async () => {
    setup(`/turnstile?widget=${widget.sitekey}`)
    fireEvent.click(await screen.findByRole('button', { name: 'Reveal secret' }))
    expect(await screen.findByLabelText('Secret key', { selector: 'input' })).toHaveValue(privateSecret)
    act(() => useAccountStore.setState({ activeAccountId: 'saved-b' }))
    await screen.findByLabelText('Widget name')
    expect(screen.queryByDisplayValue(privateSecret)).not.toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith('/turnstile/accounts', expect.objectContaining({ params: { accountId: 'saved-b' } }))
  })

  it('requires confirmation before delete', async () => {
    setup(`/turnstile?widget=${widget.sitekey}`)
    fireEvent.click(await screen.findByRole('button', { name: 'Delete widget' }))
    expect(api.delete).not.toHaveBeenCalled()
    const input = await screen.findByPlaceholderText(widget.name)
    fireEvent.change(input, { target: { value: widget.name } })
    const buttons = screen.getAllByRole('button', { name: 'Delete widget' })
    fireEvent.click(buttons[buttons.length - 1])
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith(`/turnstile/widgets/${widget.sitekey}`, { params: { accountId: 'saved-a', cfAccountId } }))
  })

  it('defaults rotation to a grace period and requires confirmation', async () => {
    setup(`/turnstile?widget=${widget.sitekey}`)
    fireEvent.click(await screen.findByRole('button', { name: 'Rotate secret' }))
    expect(api.post).not.toHaveBeenCalled()
    fireEvent.change(await screen.findByPlaceholderText(widget.name), { target: { value: widget.name } })
    const buttons = screen.getAllByRole('button', { name: 'Rotate secret' })
    fireEvent.click(buttons[buttons.length - 1])
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(`/turnstile/widgets/${widget.sitekey}/secret/rotate`,
      { invalidateImmediately: false }, expect.objectContaining({ params: { accountId: 'saved-a', cfAccountId } })))
  })
})