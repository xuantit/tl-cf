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
import WorkersPages from './WorkersPages'
import type { PagesProject, WorkerScript } from '../types/edge'

const apiGet = vi.mocked(api.get)
const apiPost = vi.mocked(api.post)
const apiPut = vi.mocked(api.put)
const apiPatch = vi.mocked(api.patch)
const apiDelete = vi.mocked(api.delete)

const scripts: WorkerScript[] = [
  {
    id: 'my-worker',
    modifiedOn: '2026-01-05T00:00:00.000Z',
    handlers: ['fetch'],
    routes: [{ id: 'r1', pattern: 'example.com/*' }],
    compatibilityDate: '2025-01-01',
    lastDeployedFrom: 'wrangler',
  },
  {
    id: 'other-worker',
    handlers: ['fetch', 'scheduled'],
    routes: [],
  },
]

const projects: PagesProject[] = [
  {
    name: 'my-site',
    domains: ['my-site.pages.dev', 'example.com'],
    productionBranch: 'main',
    latestDeployment: {
      id: 'dep-22222222',
      environment: 'production',
      status: 'success',
      createdOn: '2026-01-10T00:00:00.000Z',
    },
  },
]

const deployments = [
  {
    id: 'dep-22222222',
    environment: 'production',
    status: 'success',
    branch: 'main',
    commitHash: 'abcdef1234567',
    createdOn: '2026-01-10T00:00:00.000Z',
    url: 'https://dep2.my-site.pages.dev',
  },
  {
    id: 'dep-11111111',
    environment: 'production',
    status: 'success',
    branch: 'main',
    commitHash: '1234567890abc',
    createdOn: '2026-01-08T00:00:00.000Z',
    url: 'https://dep1.my-site.pages.dev',
  },
  {
    id: 'dep-00000000',
    environment: 'preview',
    status: 'failure',
    branch: 'feat',
    commitHash: 'fffffff0000',
    createdOn: '2026-01-07T00:00:00.000Z',
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

function renderPage(initialEntry = '/workers') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <WorkersPages />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function mockHappyGets() {
  apiGet.mockImplementation(async (url: string) => {
    if (url === '/workers/scripts') return { data: { scripts, subdomain: 'myteam' } }
    if (url === '/pages/projects') return { data: { projects } }
    if (url === '/pages/projects/my-site/deployments') return { data: { deployments } }
    if (url === '/pages/projects/my-site/domains')
      return { data: { domains: [{ id: 'd1', name: 'example.com', status: 'active' }] } }
    if (url === '/pages/projects/my-site')
      return {
        data: {
          name: 'my-site',
          productionBranch: 'main',
          envVars: [
            { key: 'API_URL', value: 'https://api.example.com', secret: false },
            { key: 'TOKEN', value: '', secret: true },
          ],
        },
      }
    if (url === '/domains') return { data: [{ id: 'z1', name: 'example.com', status: 'active' }] }
    if (url.startsWith('/workers/zones/'))
      return { data: { routes: [{ id: 'r1', pattern: 'example.com/*', script: 'my-worker' }] } }
    if (url.endsWith('/subdomain')) return { data: { enabled: true } }
    if (url.endsWith('/schedules')) return { data: { schedules: ['*/5 * * * *'] } }
    if (url.endsWith('/secrets')) return { data: { secrets: [{ name: 'EXISTING_KEY', type: 'secret_text' }] } }
    if (url.endsWith('/content')) return { data: 'export default { fetch() { return new Response("ok") } }' }
    return { data: {} }
  })
}

describe('WorkersPages', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the Workers list with routes, handlers and modified date', async () => {
    mockHappyGets()
    renderPage()

    expect(await screen.findByText('my-worker')).toBeInTheDocument()
    expect(screen.getByText('other-worker')).toBeInTheDocument()
    expect(screen.getByText('fetch, scheduled')).toBeInTheDocument()
    // Route count + first pattern in the table cell
    expect(screen.getByText(/1 ·/)).toBeInTheDocument()
  })

  it('shows a permission banner on 403', async () => {
    apiGet.mockRejectedValue(axios403())
    renderPage()

    expect(
      await screen.findByText('The API token is missing the Workers Scripts permission.'),
    ).toBeInTheDocument()
  })

  it('switches to the Pages tab and renders projects', async () => {
    mockHappyGets()
    renderPage()

    expect(await screen.findByText('my-worker')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Pages/ }))

    expect(await screen.findByText('my-site')).toBeInTheDocument()
    expect(screen.getByText('main')).toBeInTheDocument()
    expect(screen.getByText('success')).toBeInTheDocument()
  })

  it('opens the worker detail panel with routes and the workers.dev link', async () => {
    mockHappyGets()
    renderPage()

    fireEvent.click(await screen.findByText('my-worker'))

    // "Routes" section header (also a table column header → expect both)
    expect(await screen.findByText('Manage routes per zone')).toBeInTheDocument()
    expect(screen.getAllByText('Routes').length).toBeGreaterThanOrEqual(2)
    // Read-only route list from script.routes (pattern also nested in the table cell)
    expect((await screen.findAllByText('example.com/*')).length).toBeGreaterThanOrEqual(2)
    // Overview rows
    expect(screen.getByText('2025-01-01')).toBeInTheDocument()
    expect(screen.getByText('wrangler')).toBeInTheDocument()
    // workers.dev link built from subdomain (rendered once the subdomain query resolves)
    const link = await screen.findByRole('link', { name: /my-worker\.myteam\.workers\.dev/ })
    expect(link).toHaveAttribute('href', 'https://my-worker.myteam.workers.dev')
  })

  it('renders the workers.dev switch from GET and POSTs on toggle', async () => {
    mockHappyGets()
    apiPost.mockResolvedValue({ data: { enabled: false } })
    renderPage()

    fireEvent.click(await screen.findByText('my-worker'))

    const toggle = await screen.findByRole('switch', { name: 'Toggle workers.dev' })
    await waitFor(() => expect(toggle).toBeChecked())

    fireEvent.click(toggle)
    await waitFor(() =>
      expect(apiPost).toHaveBeenCalledWith('/workers/scripts/my-worker/subdomain', { enabled: false }),
    )
  })

  it('renders cron triggers and saves schedules via PUT', async () => {
    mockHappyGets()
    apiPut.mockResolvedValue({ data: { schedules: ['*/10 * * * *'] } })
    renderPage()

    fireEvent.click(await screen.findByText('my-worker'))

    const cronInput = await screen.findByDisplayValue('*/5 * * * *')
    const saveButton = screen.getByRole('button', { name: 'Save' })

    // Invalid cron (not 5 fields) disables Save
    fireEvent.change(cronInput, { target: { value: '* *' } })
    expect(saveButton).toBeDisabled()

    fireEvent.change(cronInput, { target: { value: '*/10 * * * *' } })
    expect(saveButton).toBeEnabled()
    fireEvent.click(saveButton)

    await waitFor(() =>
      expect(apiPut).toHaveBeenCalledWith('/workers/scripts/my-worker/schedules', {
        schedules: ['*/10 * * * *'],
      }),
    )
  })

  it('lists secrets and sets a new secret via PUT with secretValue', async () => {
    mockHappyGets()
    apiPut.mockResolvedValue({ status: 204 })
    renderPage()

    fireEvent.click(await screen.findByText('my-worker'))

    expect(await screen.findByText('EXISTING_KEY')).toBeInTheDocument()

    const setButton = screen.getByRole('button', { name: 'Set secret' })
    expect(setButton).toBeDisabled()

    fireEvent.change(screen.getByPlaceholderText('API_KEY'), { target: { value: 'NEW_KEY' } })
    expect(setButton).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Secret value'), { target: { value: 's3cret' } })
    expect(setButton).toBeEnabled()
    fireEvent.click(setButton)

    await waitFor(() =>
      expect(apiPut).toHaveBeenCalledWith('/workers/scripts/my-worker/secrets', {
        name: 'NEW_KEY',
        secretValue: 's3cret',
      }),
    )
  })

  it('fetches and shows the worker code on View code', async () => {
    mockHappyGets()
    renderPage()

    fireEvent.click(await screen.findByText('my-worker'))
    fireEvent.click(await screen.findByRole('button', { name: 'View code' }))

    expect(await screen.findByText(/export default/)).toBeInTheDocument()
    expect(apiGet).toHaveBeenCalledWith(
      '/workers/scripts/my-worker/content',
      expect.objectContaining({ responseType: 'text' }),
    )
  })

  it('deletes a worker after type-to-confirm', async () => {
    mockHappyGets()
    apiDelete.mockResolvedValue({ status: 204 })
    renderPage()

    fireEvent.click(await screen.findByText('my-worker'))
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Worker' }))

    const confirmButton = await screen.findByRole('button', { name: 'Delete permanently' })
    expect(confirmButton).toBeDisabled()

    fireEvent.change(screen.getByPlaceholderText('my-worker'), { target: { value: 'my-worker' } })
    expect(confirmButton).toBeEnabled()
    fireEvent.click(confirmButton)

    await waitFor(() => expect(apiDelete).toHaveBeenCalledWith('/workers/scripts/my-worker'))
  })

  it('lists deployments in the project panel and rolls back via Popconfirm', async () => {
    mockHappyGets()
    apiPost.mockResolvedValue({ data: deployments[1] })
    renderPage('/workers?tab=pages')

    fireEvent.click(await screen.findByText('my-site'))

    // Custom domains + deployments listed
    expect(await screen.findByText('Custom domains')).toBeInTheDocument()
    expect(await screen.findByText('dep-2222')).toBeInTheDocument()
    expect(screen.getByText('dep-1111')).toBeInTheDocument()
    expect(screen.getByText('dep-0000')).toBeInTheDocument()

    // Only the older production deployment offers rollback
    const rollbackButtons = screen.getAllByRole('button', { name: 'Rollback' })
    expect(rollbackButtons).toHaveLength(1)

    fireEvent.click(rollbackButtons[0])
    fireEvent.click(await screen.findByRole('button', { name: 'OK' }))

    await waitFor(() =>
      expect(apiPost).toHaveBeenCalledWith('/pages/projects/my-site/deployments/dep-11111111/rollback'),
    )
  })

  it('adds a custom domain from the project panel', async () => {
    mockHappyGets()
    apiPost.mockResolvedValue({ data: { id: 'd2', name: 'www.example.com' } })
    renderPage('/workers?tab=pages')

    fireEvent.click(await screen.findByText('my-site'))

    const input = await screen.findByPlaceholderText('www.example.com')
    const addButton = screen.getByRole('button', { name: 'Add' })
    expect(addButton).toBeDisabled()
    fireEvent.change(input, { target: { value: 'www.example.com' } })
    expect(addButton).toBeEnabled()
    fireEvent.click(addButton)

    await waitFor(() =>
      expect(apiPost).toHaveBeenCalledWith('/pages/projects/my-site/domains', { name: 'www.example.com' }),
    )
  })

  it('shows Retry only for failed deployments and POSTs the retry', async () => {
    mockHappyGets()
    apiPost.mockResolvedValue({ data: deployments[2] })
    renderPage('/workers?tab=pages')

    fireEvent.click(await screen.findByText('my-site'))

    // Only dep-00000000 has status failure
    expect(await screen.findByText('dep-0000')).toBeInTheDocument()
    const retryButtons = screen.getAllByRole('button', { name: 'Retry' })
    expect(retryButtons).toHaveLength(1)

    fireEvent.click(retryButtons[0])
    await waitFor(() =>
      expect(apiPost).toHaveBeenCalledWith('/pages/projects/my-site/deployments/dep-00000000/retry'),
    )

    // Live production deployment has no delete button
    expect(screen.queryByRole('button', { name: 'Delete deployment dep-2222' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete deployment dep-1111' })).toBeInTheDocument()
  })

  it('bulk deletes the selected deployments', async () => {
    mockHappyGets()
    apiDelete.mockResolvedValue({ data: { ok: true } })
    renderPage('/workers?tab=pages')

    fireEvent.click(await screen.findByText('my-site'))
    expect(await screen.findByText('dep-2222')).toBeInTheDocument()

    // Live production deployment is not selectable
    expect(screen.queryByLabelText('Select deployment dep-2222')).not.toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Select deployment dep-1111'))
    fireEvent.click(screen.getByLabelText('Select deployment dep-0000'))

    fireEvent.click(screen.getByRole('button', { name: 'Delete selected (2)' }))
    fireEvent.click(await screen.findByRole('button', { name: 'OK' }))

    await waitFor(() => expect(apiDelete).toHaveBeenCalledTimes(2))
    expect(apiDelete).toHaveBeenCalledWith('/pages/projects/my-site/deployments/dep-11111111')
    expect(apiDelete).toHaveBeenCalledWith('/pages/projects/my-site/deployments/dep-00000000')
  })

  it('deletes all deployments after type-to-confirm', async () => {
    mockHappyGets()
    apiDelete.mockResolvedValue({ data: { deleted: 3, failed: 0 } })
    renderPage('/workers?tab=pages')

    fireEvent.click(await screen.findByText('my-site'))
    expect(await screen.findByText('dep-2222')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Delete all' }))

    const confirmButton = await screen.findByRole('button', { name: 'Delete permanently' })
    expect(confirmButton).toBeDisabled()
    fireEvent.change(screen.getByPlaceholderText('my-site'), { target: { value: 'my-site' } })
    expect(confirmButton).toBeEnabled()
    fireEvent.click(confirmButton)

    await waitFor(() =>
      expect(apiDelete).toHaveBeenCalledWith('/pages/projects/my-site/deployments'),
    )
  })

  it('deletes the whole Pages project after type-to-confirm', async () => {
    mockHappyGets()
    apiDelete.mockResolvedValue({ data: {} })
    renderPage('/workers?tab=pages')

    fireEvent.click(await screen.findByText('my-site'))
    expect(await screen.findByText('dep-2222')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Delete project' }))

    const confirmButton = await screen.findByRole('button', { name: 'Delete permanently' })
    expect(confirmButton).toBeDisabled()
    fireEvent.change(screen.getByPlaceholderText('my-site'), { target: { value: 'my-site' } })
    expect(confirmButton).toBeEnabled()
    fireEvent.click(confirmButton)

    await waitFor(() => expect(apiDelete).toHaveBeenCalledWith('/pages/projects/my-site'))
  })

  it('paginates deployments with Prev/Next', async () => {
    mockHappyGets()
    const page2 = [
      {
        id: 'dep-99999999',
        environment: 'preview',
        status: 'success',
        branch: 'old',
        commitHash: '9999999999999',
        createdOn: '2026-01-01T00:00:00.000Z',
      },
    ]
    apiGet.mockImplementation(async (url: string, config?: unknown) => {
      const page = (config as { params?: { page?: number } } | undefined)?.params?.page ?? 1
      if (url === '/pages/projects') return { data: { projects } }
      if (url === '/pages/projects/my-site/deployments') {
        return {
          data: page === 1
            ? { deployments, page: 1, totalPages: 2, totalCount: 28 }
            : { deployments: page2, page: 2, totalPages: 2, totalCount: 28 },
        }
      }
      if (url === '/pages/projects/my-site/domains') return { data: { domains: [] } }
      if (url === '/pages/projects/my-site')
        return { data: { name: 'my-site', productionBranch: 'main', envVars: [] } }
      return { data: {} }
    })
    renderPage('/workers?tab=pages')

    fireEvent.click(await screen.findByText('my-site'))
    expect(await screen.findByText('dep-2222')).toBeInTheDocument()
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '‹ Prev' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Next ›' }))

    expect(await screen.findByText('dep-9999')).toBeInTheDocument()
    expect(screen.getByText('Page 2 of 2')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next ›' })).toBeDisabled()

    // On page 2 nothing is live — the old production rule applies only to page 1
    expect(screen.getByLabelText('Select deployment dep-9999')).toBeInTheDocument()
  })

  it('renders env vars and PATCHes with secretValue for edited secret rows', async () => {
    mockHappyGets()
    apiPatch.mockResolvedValue({ data: { ok: true } })
    renderPage('/workers?tab=pages')

    fireEvent.click(await screen.findByText('my-site'))

    expect(await screen.findByText('Environment variables')).toBeInTheDocument()
    expect(await screen.findByDisplayValue('API_URL')).toBeInTheDocument()
    expect(screen.getByDisplayValue('https://api.example.com')).toBeInTheDocument()

    // Secret var comes back hidden (empty value, placeholder)
    const hidden = screen.getByPlaceholderText('(hidden)')
    expect(hidden).toHaveValue('')
    fireEvent.change(hidden, { target: { value: 'new-secret' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(apiPatch).toHaveBeenCalledWith('/pages/projects/my-site/env', {
        envVars: [
          { key: 'API_URL', value: 'https://api.example.com', secret: false },
          { key: 'TOKEN', secretValue: 'new-secret', secret: true },
        ],
        removedKeys: [],
      }),
    )
  })
})
