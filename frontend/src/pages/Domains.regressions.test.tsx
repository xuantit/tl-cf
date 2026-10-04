import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ConfigProvider } from 'antd'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../services/api', async (importOriginal) => ({
  ...await importOriginal<typeof import('../services/api')>(),
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}))

vi.mock('../lib/antdApp', () => ({
  message: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}))

import '../i18n'
import { api } from '../services/api'
import { useUiPrefStore } from '../stores/useUiPrefStore'
import type { Zone } from '../types/domain'
import Domains from './Domains'

const apiGet = vi.mocked(api.get)
const apiPost = vi.mocked(api.post)
const apiPut = vi.mocked(api.put)
const apiDelete = vi.mocked(api.delete)

const zones: Zone[] = [
  { id: 'z1', name: 'shop-abc.com', status: 'active', tags: ['shop'] },
  { id: 'z2', name: 'tienlen.vn', status: 'active', tags: ['core'] },
  { id: 'z3', name: 'old-shop.vn', status: 'pending', tags: ['legacy'] },
]

function apiFailure(detail: string) {
  return Object.assign(new Error(detail), {
    isAxiosError: true,
    response: { status: 403, data: { detail } },
  })
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

function LocationProbe() {
  const location = useLocation()
  const navigate = useNavigate()
  return (
    <>
      <output data-testid="location">{location.pathname}{location.search}</output>
      <button onClick={() => navigate('/?tab=active&q=tienlen&tag=core&zone=z1')}>Restore active URL</button>
    </>
  )
}

function renderDomains(path = '/') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const view = render(
    <QueryClientProvider client={client}>
      <ConfigProvider theme={{ token: { motion: false } }}>
      <MemoryRouter initialEntries={[path]}>
        <LocationProbe />
        <Routes>
          <Route path="/" element={<Domains />} />
          <Route path="/domains/:id" element={<div>Domain detail route</div>} />
        </Routes>
      </MemoryRouter>
      </ConfigProvider>
    </QueryClientProvider>,
  )
  return { ...view, client }
}

function params() {
  return new URL(screen.getByTestId('location').textContent || '/', 'https://example.test').searchParams
}

async function findDialog(title: string) {
  // rc-util hardcodes every generated ID to "test-id" in NODE_ENV=test, so
  // aria-labelledby resolves to the page's Select instead of the modal title.
  // Assert the sole accessible dialog, its exact title, and its label wiring.
  const dialog = await screen.findByRole('dialog')
  const heading = within(dialog).getByText(title, { exact: true, selector: '.ant-modal-title' })
  expect(dialog).toHaveAttribute('aria-labelledby', heading.id)
  return dialog
}

async function chooseExistingTag(tag = 'legacy') {
  const dialog = await findDialog('Assign tags')
  fireEvent.mouseDown(within(dialog).getByRole('combobox'))
  const options = await screen.findAllByTitle(tag)
  const option = options.find((element) => element.closest('.ant-select-item-option'))
  expect(option).toBeDefined()
  fireEvent.click(option!)
  fireEvent.click(within(dialog).getByRole('button', { name: 'Assign' }))
}

describe('Domains restored workflows', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiGet.mockReset()
    apiPost.mockReset()
    apiPut.mockReset()
    apiDelete.mockReset()
    useUiPrefStore.setState({ confirmDanger: true })
    apiGet.mockImplementation(async (url: string) => {
      if (url === '/domains') return { data: zones }
      if (url.startsWith('/jobs/')) return {
        data: {
          id: 'j1', type: 'copy-config', status: 'done', total: 1,
          processed: 1, succeeded: 1, failed: 0, items: [], createdAt: 0,
        },
      }
      return { data: [] }
    })
    apiPost.mockResolvedValue({ data: { jobId: 'j1' } })
    apiPut.mockResolvedValue({ data: {} })
    apiDelete.mockResolvedValue({ data: {} })
  })

  it('shows the API load error and allows retry without issuing mutations', async () => {
    apiGet.mockRejectedValueOnce(apiFailure('Account permission denied'))
    renderDomains()
    expect(await screen.findByRole('alert')).toHaveTextContent('Account permission denied')
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('shop-abc.com')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(apiPost).not.toHaveBeenCalled()
    expect(apiPut).not.toHaveBeenCalled()
    expect(apiDelete).not.toHaveBeenCalled()
  })

  it('restores and combines URL filters, preserving selection and global tab counts', async () => {
    renderDomains('/?tab=pending&q=shop&tag=legacy&zone=z1')
    expect(await screen.findByText('old-shop.vn')).toBeInTheDocument()
    expect(screen.queryByText('shop-abc.com')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^All/ })).toHaveTextContent('3')
    expect(screen.getByRole('button', { name: /^Active/ })).toHaveTextContent('2')

    fireEvent.click(screen.getByRole('button', { name: /^All/ }))
    expect(params().has('tab')).toBe(false)
    expect(params().get('q')).toBe('shop')
    expect(params().get('tag')).toBe('legacy')
    expect(params().getAll('zone')).toEqual(['z1'])
    expect(screen.queryByText('shop-abc.com')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Restore active URL' }))
    expect(await screen.findByText('tienlen.vn')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Search domains...' })).toHaveValue('tienlen')
    expect(screen.queryByText('old-shop.vn')).not.toBeInTheDocument()
    fireEvent.change(screen.getByRole('textbox', { name: 'Search domains...' }), { target: { value: 'missing' } })
    expect(params().get('q')).toBe('missing')
    expect(params().get('tab')).toBe('active')
    expect(params().getAll('zone')).toEqual(['z1'])
  })

  it.each([
    ['Copy', 'copy-config', 'source'],
    ['Clone', 'clone', 'source'],
    ['Delete domain', 'delete', 'deleteZone'],
  ])('row %s opens its URL-backed view without navigating or changing selection', async (label, modal, sourceKey) => {
    renderDomains('/?zone=z2')
    const name = await screen.findByText('shop-abc.com')
    fireEvent.click(within(name.closest('tr')!).getByRole('button', { name: label }))
    expect(params().get('modal')).toBe(modal)
    expect(params().get(sourceKey)).toBe('z1')
    expect(params().getAll('zone')).toEqual(['z2'])
    expect(screen.queryByText('Domain detail route')).not.toBeInTheDocument()
  })

  it('resets the row copy source when switching rows while the push panel remains open', async () => {
    renderDomains()
    await screen.findByText('shop-abc.com')
    fireEvent.click(screen.getAllByRole('button', { name: 'Copy' })[0])
    expect(within(screen.getByTestId('copy-source')).getByText('shop-abc.com')).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: 'Copy' })[1])
    expect(within(screen.getByTestId('copy-source')).getByText('tienlen.vn')).toBeInTheDocument()
    expect(within(screen.getByTestId('copy-source')).queryByText('shop-abc.com')).not.toBeInTheDocument()
    expect(screen.getAllByRole('complementary')).toHaveLength(1)
    expect(params().get('modal')).toBe('copy-config')
    expect(params().get('source')).toBe('z2')

    fireEvent.click(screen.getAllByRole('button', { name: 'Copy' })[0])
    expect(within(screen.getByTestId('copy-source')).getByText('shop-abc.com')).toBeInTheDocument()
    expect(screen.getAllByRole('complementary')).toHaveLength(1)
    expect(params().get('source')).toBe('z1')
    expect(apiPost).not.toHaveBeenCalled()
  })

  it('restores a copy source and targets, then atomically switches to job progress and closes it', async () => {
    const { client } = renderDomains('/?tab=active&modal=copy-config&source=z1&zone=z1&zone=z2')
    expect(await screen.findByRole('button', { name: 'Copy to 1 domains' })).toBeEnabled()
    expect(within(screen.getByTestId('copy-source')).getByText('shop-abc.com')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Copy to 1 domains' }))
    await waitFor(() => expect(params().get('job')).toBe('j1'))
    expect(apiPost).toHaveBeenCalledWith('/domains/copy-config', expect.objectContaining({
      sourceZoneId: 'z1', targets: [{ zoneId: 'z2', zoneName: 'tienlen.vn' }],
    }))
    expect(params().has('modal')).toBe(false)
    expect(params().has('source')).toBe(false)
    expect(params().getAll('zone')).toEqual(['z1', 'z2'])
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const progress = await findDialog('Bulk operation progress')
    expect(screen.queryByTestId('copy-source')).not.toBeInTheDocument()
    fireEvent.click(within(progress).getByRole('button', { name: 'Close' }))
    expect(params().has('job')).toBe(false)
    expect(params().has('zone')).toBe(false)
    expect(params().get('tab')).toBe('active')
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['domains'] })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('restores a clone source from the URL and clears source/modal together on close', async () => {
    renderDomains('/?modal=clone&source=z2&zone=z1')
    const textarea = await screen.findByRole('textbox', { name: '' })
    expect(textarea).toHaveAttribute('placeholder', 'newshop.com\nnewshop.net')
    const panel = textarea.closest('aside')!
    expect(within(panel).getByText('tienlen.vn')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Clone to 0 domains' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(params().has('modal')).toBe(false)
    expect(params().has('source')).toBe(false)
    expect(params().getAll('zone')).toEqual(['z1'])
  })

  it('requires row-delete typing, preserves pending/errors, and retries only that row', async () => {
    const request = deferred<{ data: object }>()
    apiDelete.mockImplementationOnce(() => request.promise)
    renderDomains('/?zone=z1&zone=z2')
    await screen.findByText('shop-abc.com')
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete domain' })[0])
    const dialog = screen.getByRole('dialog')
    const confirm = within(dialog).getByRole('button', { name: 'Delete permanently' })
    expect(confirm).toBeDisabled()
    const input = within(dialog).getByPlaceholderText('delete 1 zone')
    fireEvent.change(input, { target: { value: 'delete 2 zones' } })
    expect(confirm).toBeDisabled()
    fireEvent.change(input, { target: { value: 'delete 1 zone' } })
    fireEvent.click(confirm)
    await waitFor(() => expect(apiDelete).toHaveBeenCalledTimes(1))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' })
    expect(params().get('modal')).toBe('delete')
    expect(apiDelete).toHaveBeenCalledTimes(1)

    await act(async () => request.reject(apiFailure('Deletion denied')))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Deletion denied')
    expect(input).toHaveValue('delete 1 zone')
    expect(params().get('deleteZone')).toBe('z1')
    fireEvent.click(confirm)
    await waitFor(() => expect(params().has('modal')).toBe(false))
    expect(apiDelete).toHaveBeenNthCalledWith(1, '/domains/z1')
    expect(apiDelete).toHaveBeenNthCalledWith(2, '/domains/z1')
    expect(apiPost).not.toHaveBeenCalled()
    expect(params().has('deleteZone')).toBe(false)
    expect(params().getAll('zone')).toEqual(['z2'])
  })

  it('retains bulk-delete errors and deduplicates restored selections', async () => {
    apiPost.mockRejectedValueOnce(apiFailure('Bulk delete denied'))
    renderDomains('/?modal=delete&zone=z1&zone=z1&zone=z2')
    const input = await screen.findByPlaceholderText('delete 2 zones')
    fireEvent.change(input, { target: { value: 'delete 2 zones' } })
    fireEvent.click(screen.getByRole('button', { name: 'Delete permanently' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Bulk delete denied')
    expect(params().get('modal')).toBe('delete')
    expect(input).toHaveValue('delete 2 zones')
    expect(apiPost).toHaveBeenCalledWith('/domains/bulk', { action: 'delete', zoneIds: ['z1', 'z2'] })
    expect(apiDelete).not.toHaveBeenCalled()
  })

  it('does not enable destructive confirmation for stale URL targets', async () => {
    renderDomains('/?modal=delete&deleteZone=unknown&zone=z1')
    await screen.findByText('shop-abc.com')
    expect(await screen.findByText('Select available domains before deleting')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete permanently' })).not.toBeInTheDocument()
    expect(apiDelete).not.toHaveBeenCalled()
    expect(apiPost).not.toHaveBeenCalled()
  })

  it('merges tags per zone, waits for all outcomes, and retries only failed zones', async () => {
    const second = deferred<{ data: object }>()
    apiPut.mockImplementationOnce(async () => ({ data: {} }))
      .mockImplementationOnce(() => second.promise)
    const { client } = renderDomains('/?modal=tags&zone=z1&zone=z1&zone=z2')
    await screen.findByText('shop-abc.com')
    const dialog = await findDialog('Assign tags')
    expect(within(dialog).getByRole('button', { name: 'Assign' })).toBeDisabled()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    await chooseExistingTag()
    await waitFor(() => expect(apiPut).toHaveBeenCalledTimes(2))
    expect(apiPut).toHaveBeenNthCalledWith(1, '/domains/z1/tags', { tags: ['shop', 'legacy'] })
    expect(apiPut).toHaveBeenNthCalledWith(2, '/domains/z2/tags', { tags: ['core', 'legacy'] })
    expect(within(dialog).getByRole('combobox')).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled()
    expect(params().get('modal')).toBe('tags')
    expect(invalidate).not.toHaveBeenCalled()

    await act(async () => second.reject(apiFailure('Tags denied')))
    expect(await within(dialog).findByText('tienlen.vn: Tags denied')).toBeInTheDocument()
    expect(params().getAll('zone')).toEqual(['z2'])
    expect(params().get('modal')).toBe('tags')
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['domains'] })
    await waitFor(() => expect(within(dialog).getByRole('combobox')).toBeEnabled())
    fireEvent.click(within(dialog).getByRole('button', { name: 'Assign' }))
    await waitFor(() => expect(params().has('modal')).toBe(false))
    expect(apiPut).toHaveBeenCalledTimes(3)
    expect(apiPut).toHaveBeenNthCalledWith(3, '/domains/z2/tags', { tags: ['core', 'legacy'] })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('never overwrites tags of an unknown selected zone', async () => {
    renderDomains('/?modal=tags&zone=unknown&zone=z1')
    await screen.findByText('shop-abc.com')
    await chooseExistingTag()
    const dialog = await findDialog('Assign tags')
    expect(await within(dialog).findByText('unknown: Domain is not available in the current account')).toBeInTheDocument()
    expect(apiPut).toHaveBeenCalledTimes(1)
    expect(apiPut).toHaveBeenCalledWith('/domains/z1/tags', { tags: ['shop', 'legacy'] })
    await waitFor(() => expect(params().getAll('zone')).toEqual(['unknown']))
    expect(params().get('modal')).toBe('tags')
  })
})