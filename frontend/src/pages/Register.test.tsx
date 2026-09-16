import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import '../i18n'
import { useEffect } from 'react'

vi.mock('../components/TurnstileChallenge', () => ({ default: function DisabledChallenge({ onToken }: { onToken: (token: string) => void }) {
  useEffect(() => onToken(''), [onToken])
  return null
} }))

vi.mock('../services/api', () => ({
  api: { post: vi.fn() },
  apiErrorDetail: (e: { response?: { data?: { detail?: string } } }) => e.response?.data?.detail,
}))
import { api } from '../services/api'
import Register from './Register'

describe('email signup', () => {
  beforeEach(() => vi.clearAllMocks())

  it('requests verification using only email, even for legacy invite links', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { verificationRequired: true, retryAfter: 60 } })
    render(<MemoryRouter initialEntries={['/register?invite=OLD-CODE']}><Register /></MemoryRouter>)
    expect(screen.queryByLabelText('Invite code')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'New@Example.com' } })
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
    fireEvent.click(screen.getByRole('button', { name: /Send verification email/ }))
    expect(await screen.findByText('Email service is not configured')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Check your email' })).not.toBeInTheDocument()
  })

  it('validates email before sending', async () => {
    render(<MemoryRouter><Register /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: /Send verification email/ }))
    await waitFor(() => expect(screen.getByText('Please enter a valid email')).toBeInTheDocument())
    expect(api.post).not.toHaveBeenCalled()
  })

  it('coalesces repeated form submissions while an email request is in flight', async () => {
    let resolve!: (value: { data: { retryAfter: number } }) => void
    vi.mocked(api.post).mockImplementation(() => new Promise((done) => { resolve = done }))
    const { container } = render(<MemoryRouter><Register /></MemoryRouter>)
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@example.com' } })
    fireEvent.submit(container.querySelector('form')!)
    fireEvent.submit(container.querySelector('form')!)
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1))
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
    fireEvent.click(screen.getByRole('button', { name: /Send verification email/ }))
    expect(await screen.findByText(html)).toBeInTheDocument()
    expect(container.querySelector('script, img[onerror]')).toBeNull()
  })
})