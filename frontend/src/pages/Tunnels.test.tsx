import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AxiosError } from 'axios'
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
import Tunnels from './Tunnels'
import type { Tunnel } from '../types/edge'

const apiGet = vi.mocked(api.get)
const apiPost = vi.mocked(api.post)
const apiPut = vi.mocked(api.put)

const tunnels: Tunnel[] = [
  {
    id: 'tun-1',
    name: 'prod-tunnel',
    status: 'healthy',
    createdAt: '2026-01-05T00:00:00.000Z',
    remoteConfig: true,
    connections: [
      { colo: 'SIN', version: '2025.1.0', originIp: '1.2.3.4' },
      { colo: 'HKG', version: '2025.1.0' },
    ],
  },
  {
    id: 'tun-2',
    name: 'legacy-tunnel',
    status: 'inactive',
    remoteConfig: false,
    connections: [],
  },
]

function axios403() {
  return new AxiosError(
    'Request failed with status code 403',
    'ERR_BAD_REQUEST',
    undefined,
    undefined,
    { status: 403, statusText: 'Forbidden', data: {}, headers: {}, config: {} } as never,
  )
}

function renderTunnels() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/tunnels']}>
        <Tunnels />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function mockHappyGets() {
  apiGet.mockImplementation(async (url: string) => {
    if (url === '/tunnels') return { data: { tunnels } }
    if (url === '/domains') return { data: [{ id: 'zone-1', name: 'example.com', status: 'active' }] }
    if (url === '/tunnels/tun-1/configurations')
      return {
        data: {
          ingress: [
            {
              hostname: 'app.example.com',
              service: 'http://localhost:8080',
              originRequest: { connectTimeout: 30 },
            },
            { service: 'http_status:404' },
          ],
          source: 'cloudflare',
        },
      }
    if (url === '/tunnels/tun-1/connections')
      return {
        data: {
          connections: [
            {
              id: 'client-1',
              version: '2025.1.0',
              arch: 'linux_amd64',
              runAt: '2026-01-06T00:00:00.000Z',
              conns: [{ colo: 'SIN', originIp: '1.2.3.4' }],
            },
          ],
        },
      }
    return { data: {} }
  })
}

describe('Tunnels', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the tunnel list with status tags and connector summary', async () => {
    mockHappyGets()
    renderTunnels()

    expect(await screen.findByText('prod-tunnel')).toBeInTheDocument()
    expect(screen.getByText('legacy-tunnel')).toBeInTheDocument()
    // Status tag inside the row
    expect(screen.getAllByText('healthy').length).toBeGreaterThanOrEqual(1)
    // Connector summary: version · unique colo count
    expect(screen.getByText('2025.1.0 · 2 colo')).toBeInTheDocument()
    // Config tags
    expect(screen.getByText('cloudflare')).toBeInTheDocument()
    expect(screen.getByText('local')).toBeInTheDocument()
  })

  it('shows the empty state when there are no tunnels', async () => {
    apiGet.mockResolvedValue({ data: { tunnels: [] } })
    renderTunnels()

    expect(await screen.findByText('No tunnels yet')).toBeInTheDocument()
    expect(
      screen.getByText('Create a tunnel, then run cloudflared on the origin host to connect it to Cloudflare'),
    ).toBeInTheDocument()
  })

  it('shows a permission banner on 403', async () => {
    apiGet.mockRejectedValue(axios403())
    renderTunnels()

    expect(
      await screen.findByText('The API token is missing the Cloudflare Tunnel permission.'),
    ).toBeInTheDocument()
  })

  it('opens the detail panel on row click and loads the ingress config', async () => {
    mockHappyGets()
    renderTunnels()

    fireEvent.click(await screen.findByText('prod-tunnel'))

    // Sections render
    expect(await screen.findByText('Public hostnames')).toBeInTheDocument()
    expect(screen.getByText('Run connector')).toBeInTheDocument()

    // Ingress rows loaded into editable inputs; catch-all shown as fixed footer
    const hostnameInput = await screen.findByLabelText('Hostname')
    expect(hostnameInput).toHaveValue('app.example.com')
    expect(screen.getByLabelText('Service')).toHaveValue('http://localhost:8080')
    expect(screen.getByText('http_status:404')).toBeInTheDocument()
    expect(screen.getByText('Everything else')).toBeInTheDocument()

    // Connections section content
    expect(await screen.findByText(/linux_amd64/)).toBeInTheDocument()
    expect(screen.getByText(/1\.2\.3\.4/)).toBeInTheDocument()
  })

  it('reveals the connector token', async () => {
    mockHappyGets()
    apiPost.mockResolvedValue({ data: { token: 'eyJsecret-token' } })
    renderTunnels()

    fireEvent.click(await screen.findByText('prod-tunnel'))
    fireEvent.click(await screen.findByRole('button', { name: 'Reveal token' }))

    await waitFor(() => expect(apiPost).toHaveBeenCalledWith('/tunnels/tun-1/token/reveal'))
    expect(await screen.findByText(/eyJsecret-token/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument()
  })

  it('creates a tunnel from the add panel', async () => {
    mockHappyGets()
    apiPost.mockResolvedValue({
      data: { id: 'tun-3', name: 'new-tunnel', status: 'inactive', remoteConfig: true, connections: [] },
    })
    renderTunnels()

    expect(await screen.findByText('prod-tunnel')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '+ Tunnel' }))

    const nameInput = await screen.findByPlaceholderText('my-tunnel')
    fireEvent.change(nameInput, { target: { value: 'new-tunnel' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    await waitFor(() => expect(apiPost).toHaveBeenCalledWith('/tunnels', { name: 'new-tunnel' }))
  })

  it('edits advanced fields and saves path + merged originRequest', async () => {
    mockHappyGets()
    apiPut.mockResolvedValue({ data: { ok: true } })
    renderTunnels()

    fireEvent.click(await screen.findByText('prod-tunnel'))
    await screen.findByLabelText('Hostname')

    // Advanced fields hidden until the per-row toggle is clicked
    expect(screen.queryByPlaceholderText('/api')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Advanced' }))

    fireEvent.change(await screen.findByPlaceholderText('/api'), { target: { value: '/api' } })
    fireEvent.change(screen.getByLabelText('HTTP Host header'), { target: { value: 'internal.local' } })
    expect(screen.getByRole('switch', { name: 'No TLS verify' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    // Unknown originRequest keys (connectTimeout) survive the merge; empty fields are omitted
    await waitFor(() =>
      expect(apiPut).toHaveBeenCalledWith('/tunnels/tun-1/configurations', {
        ingress: [
          {
            hostname: 'app.example.com',
            service: 'http://localhost:8080',
            path: '/api',
            originRequest: { connectTimeout: 30, httpHostHeader: 'internal.local' },
          },
        ],
      }),
    )
  })

  it('creates a CNAME for new hostnames on save when auto-DNS is checked', async () => {
    mockHappyGets()
    apiPut.mockResolvedValue({ data: { ok: true } })
    apiPost.mockResolvedValue({ data: {} })
    renderTunnels()

    fireEvent.click(await screen.findByText('prod-tunnel'))
    await screen.findByLabelText('Hostname')

    // Auto-DNS checkbox is on by default
    expect(screen.getByRole('checkbox', { name: 'Create DNS records for new hostnames' })).toBeChecked()

    fireEvent.click(screen.getByRole('button', { name: '+ Add hostname' }))
    const hostInputs = screen.getAllByLabelText('Hostname')
    fireEvent.change(hostInputs[1], { target: { value: 'new.example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    // CNAME only for the hostname that wasn't in the originally loaded config
    await waitFor(() =>
      expect(apiPost).toHaveBeenCalledWith('/domains/zone-1/dns', {
        type: 'CNAME',
        name: 'new.example.com',
        content: 'tun-1.cfargotunnel.com',
        ttl: 1,
        proxied: true,
      }),
    )
    expect(apiPost).toHaveBeenCalledTimes(1)
  })
})
