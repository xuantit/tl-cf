import { StrictMode, useState } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '../i18n'
vi.mock('../services/api', () => ({ api: { get: vi.fn() } }))
vi.mock('../lib/turnstile', () => ({ loadTurnstile: vi.fn() }))
import { api } from '../services/api'
import { loadTurnstile, type TurnstileApi } from '../lib/turnstile'
import TurnstileChallenge from './TurnstileChallenge'
const widget = { render: vi.fn(), remove: vi.fn() }
type Options = Parameters<TurnstileApi['render']>[1]
let options: Options
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(api.get).mockResolvedValue({ data: { enabled: true, siteKey: 'public-sitekey' } })
  widget.render.mockImplementation((_container, value: Options) => { options = value; return 'widget-id' })
  vi.mocked(loadTurnstile).mockResolvedValue(widget)
})
afterEach(() => vi.restoreAllMocks())

function Harness() {
  const [token, setToken] = useState<string | null>(null)
  const [generation, setGeneration] = useState(0)
  return <>
    <TurnstileChallenge action="register" generation={generation} onToken={setToken} />
    <output data-testid="token">{token === null ? 'blocked' : token || 'disabled'}</output>
    <button disabled={token === null} onClick={() => { setToken(null); setGeneration((v) => v + 1) }}>Submit</button>
  </>
}
describe('Turnstile challenge lifecycle', () => {
  it('blocks until success, then resets token after submission', async () => {
    render(<Harness />)
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled()
    await waitFor(() => expect(widget.render).toHaveBeenCalledTimes(1))
    expect(options).toMatchObject({ sitekey: 'public-sitekey', action: 'register' })
    act(() => options.callback('fresh-token'))
    expect(screen.getByRole('button', { name: 'Submit' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))
    await waitFor(() => expect(widget.render).toHaveBeenCalledTimes(2))
    expect(widget.remove).toHaveBeenCalledWith('widget-id')
    expect(screen.getByTestId('token')).toHaveTextContent('blocked')
  })
  it('expires tokens and exposes retry without bypass', async () => {
    render(<Harness />)
    await waitFor(() => expect(widget.render).toHaveBeenCalled())
    act(() => options.callback('fresh'))
    act(() => options['expired-callback']())
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(widget.render).toHaveBeenCalledTimes(2))
  })
  it.each(['api', 'script', 'config'])('fails closed when %s is unavailable', async (type) => {
    if (type === 'api') vi.mocked(api.get).mockRejectedValue(new Error('offline'))
    if (type === 'script') vi.mocked(loadTurnstile).mockRejectedValue(new Error('offline'))
    if (type === 'config') vi.mocked(api.get).mockResolvedValue({ data: {} })
    render(<Harness />)
    expect(await screen.findByText('Anti-bot verification unavailable or expired. Please retry.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled()
  })
  it('only bypasses widget when the backend explicitly reports disabled', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { enabled: false, siteKey: null } })
    render(<Harness />)
    await waitFor(() => expect(screen.getByTestId('token')).toHaveTextContent('disabled'))
    expect(loadTurnstile).not.toHaveBeenCalled()
  })
  it('does not render stale StrictMode effects and ignores callbacks after unmount', async () => {
    const onToken = vi.fn()
    const { unmount } = render(<StrictMode><TurnstileChallenge action="verify_email" generation={0} onToken={onToken} /></StrictMode>)
    await waitFor(() => expect(widget.render).toHaveBeenCalledTimes(1))
    const callback = options.callback
    unmount()
    onToken.mockClear()
    callback('stale-secret')
    expect(onToken).not.toHaveBeenCalled()
    expect(widget.remove).toHaveBeenCalledWith('widget-id')
  })
})