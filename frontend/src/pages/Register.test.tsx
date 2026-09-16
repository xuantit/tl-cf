import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import '../i18n'
import { useEffect } from 'react'

const challenge = vi.hoisted(() => ({
  initialToken: '' as string | null,
  onToken: undefined as ((token: string | null) => void) | undefined,
}))
vi.mock('../components/TurnstileChallenge', () => ({ default: function ControlledChallenge({ onToken, generation }: { onToken: (token: string | null) => void; generation: number }) {
  useEffect(() => { challenge.onToken = onToken; onToken(challenge.initialToken) }, [onToken, generation])
  return null
} }))

vi.mock('../services/api', () => ({
  api: { post: vi.fn() },
  apiErrorDetail: (e: { response?: { data?: { detail?: string } } }) => e.response?.data?.detail,
}))
import { api } from '../services/api'
import Register from './Register'

describe('email signup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    challenge.initialToken = '' // Explicitly disabled CAPTCHA, as in existing tests.
    challenge.onToken = undefined
  })

  it('requests verification using only email, even for legacy invite links', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { verificationRequired: true, retryAfter: 60 } })
    render(<MemoryRouter initialEntries={['/register?invite=OLD-CODE']}><Register /></MemoryRouter>)
    expect(screen.queryByLabelText('Invite code')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'New@Example.com' } })
    await waitFor(() => expect(screen.getByRole('button', { name: /Send verification email/ })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: /Send verification email/ }))
    expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeInTheDocument()
    expect(api.post).toHaveBeenCalledWith('/auth/register', { email: 'new@example.com' })
    expect(screen.getByRole('button', { name: /Resend in/ })).toBeDisabled()
    expect(screen.getByText(/If new@example.com is eligible/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Use a different email' }))
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
  })

  it('shows configuration/delivery errors instead of claiming an email was sent', async () => {
    vi.mocked(api.post).mockRejectedValue({ response: { data: { detail: 'Email service is not configured' } } })
    render(<MemoryRouter><Register /></MemoryRouter>)
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@example.com' } })
    await waitFor(() => expect(screen.getByRole('button', { name: /Send verification email/ })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: /Send verification email/ }))
    expect(await screen.findByText('Email service is not configured')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Check your email' })).not.toBeInTheDocument()
  })

  it('validates email before sending', async () => {
    const { container } = render(<MemoryRouter><Register /></MemoryRouter>)
    expect(screen.getByRole('button', { name: /Send verification email/ })).toBeDisabled()
    // Enter/programmatic submission must still validate even if the UI is bypassed.
    fireEvent.submit(container.querySelector('form')!)
    await waitFor(() => expect(screen.getByText('Please enter a valid email')).toBeInTheDocument())
    expect(api.post).not.toHaveBeenCalled()
  })

  it('keeps the button disabled after CAPTCHA succeeds while email is empty', () => {
    challenge.initialToken = null
    render(<MemoryRouter><Register /></MemoryRouter>)
    const send = screen.getByRole('button', { name: /Send verification email/ })
    expect(send).toBeDisabled()
    act(() => challenge.onToken?.('solved-captcha'))
    expect(send).toBeDisabled()
    expect(api.post).not.toHaveBeenCalled()
  })

  it.each(['   ', 'invalid', 'user@', 'user@example', 'a..b@example.com', `${'a'.repeat(243)}@example.com`])(
    'keeps the button disabled for invalid/oversized email with a valid CAPTCHA: %s', async (email) => {
      challenge.initialToken = 'solved-captcha'
      render(<MemoryRouter><Register /></MemoryRouter>)
      fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@example.com' } })
      await waitFor(() => expect(screen.getByRole('button', { name: /Send verification email/ })).toBeEnabled())
      fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } })
      await waitFor(() => expect(screen.getByRole('button', { name: /Send verification email/ })).toBeDisabled())
      expect(api.post).not.toHaveBeenCalled()
    },
  )

  it('requires both valid email and CAPTCHA, and disables again when either becomes invalid', async () => {
    challenge.initialToken = null
    render(<MemoryRouter><Register /></MemoryRouter>)
    const email = screen.getByLabelText('Email')
    const send = screen.getByRole('button', { name: /Send verification email/ })
    fireEvent.change(email, { target: { value: 'new@example.com' } })
    expect(send).toBeDisabled()
    act(() => challenge.onToken?.('solved-captcha'))
    await waitFor(() => expect(send).toBeEnabled())
    fireEvent.change(email, { target: { value: '' } })
    await waitFor(() => expect(send).toBeDisabled())
    fireEvent.change(email, { target: { value: '  NEW@example.com  ' } })
    await waitFor(() => expect(send).toBeEnabled())
    act(() => challenge.onToken?.(null)) // CAPTCHA expired or failed.
    expect(send).toBeDisabled()
    expect(api.post).not.toHaveBeenCalled()
  })

  it('submits normalized email with the solved CAPTCHA and keeps resend under cooldown', async () => {
    challenge.initialToken = 'solved-captcha'
    vi.mocked(api.post).mockResolvedValue({ data: { retryAfter: 60 } })
    render(<MemoryRouter><Register /></MemoryRouter>)
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: '  NEW@example.com  ' } })
    const send = screen.getByRole('button', { name: /Send verification email/ })
    await waitFor(() => expect(send).toBeEnabled())
    fireEvent.click(send)
    expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeInTheDocument()
    expect(api.post).toHaveBeenCalledWith('/auth/register', { email: 'new@example.com', turnstileToken: 'solved-captcha' })
    expect(screen.getByRole('button', { name: /Resend in/ })).toBeDisabled()
  })

  it('coalesces repeated form submissions while an email request is in flight', async () => {
    let resolve!: (value: { data: { retryAfter: number } }) => void
    vi.mocked(api.post).mockImplementation(() => new Promise((done) => { resolve = done }))
    const { container } = render(<MemoryRouter><Register /></MemoryRouter>)
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@example.com' } })
    fireEvent.submit(container.querySelector('form')!)
    fireEvent.submit(container.querySelector('form')!)
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('button', { name: /Send verification email/ })).toBeDisabled()
    await act(async () => resolve({ data: { retryAfter: 60 } }))
    const resend = await screen.findByRole('button', { name: /Resend in/ })
    fireEvent.click(resend)
    expect(api.post).toHaveBeenCalledTimes(1)
  })

  it('renders hostile provider error text literally, never as HTML', async () => {
    const html = '<img src=x onerror=alert(1)><script>alert(1)</script>'
    vi.mocked(api.post).mockRejectedValue({ response: { data: { detail: html } } })
    const { container } = render(<MemoryRouter><Register /></MemoryRouter>)
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@example.com' } })
    await waitFor(() => expect(screen.getByRole('button', { name: /Send verification email/ })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: /Send verification email/ }))
    expect(await screen.findByText(html)).toBeInTheDocument()
    expect(container.querySelector('script, img[onerror]')).toBeNull()
  })
})