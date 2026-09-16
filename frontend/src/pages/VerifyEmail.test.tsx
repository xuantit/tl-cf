import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
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
import VerifyEmail from './VerifyEmail'

const token = 'a'.repeat(64)
const password = 'EmailOwnerPass123'
function LocationProbe() {
  const location = useLocation()
  return <output data-testid="location">{location.pathname}{location.hash}</output>
}
function setup(hash = `#token=${token}`) {
  return render(<MemoryRouter initialEntries={[`/verify-email${hash}`]}><VerifyEmail /><LocationProbe /></MemoryRouter>)
}
function fillPasswords(confirm = password) {
  fireEvent.change(screen.getByLabelText('Password', { exact: true }), { target: { value: password } })
  fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: confirm } })
  fireEvent.click(screen.getByRole('button', { name: /Verify email and create account/ }))
}

describe('email verification', () => {
  beforeEach(() => vi.clearAllMocks())

  it('requires explicit password submission and does not consume links on page load', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { id: 'user-1', role: 'user' } })
    setup()
    expect(api.post).not.toHaveBeenCalled()
    fillPasswords()
    expect(await screen.findByRole('heading', { name: 'Email verified' })).toBeInTheDocument()
    expect(api.post).toHaveBeenCalledWith('/auth/verify-email', { token, password })
    expect(screen.getByRole('link', { name: /Sign in/ })).toHaveAttribute('href', '/login')
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/verify-email$/))
  })

  it('rejects mismatched passwords without calling the API', async () => {
    setup()
    fillPasswords('different-password')
    expect(await screen.findByText('Passwords do not match')).toBeInTheDocument()
    expect(api.post).not.toHaveBeenCalled()
  })

  it.each(['', '#token=invalid'])('handles missing/malformed token (%s)', (hash) => {
    setup(hash)
    expect(screen.getByText('Missing or invalid verification link')).toBeInTheDocument()
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Request a new verification email' })).toHaveAttribute('href', '/register')
    expect(api.post).not.toHaveBeenCalled()
  })

  it('shows expired/used-link errors and offers a new verification email', async () => {
    vi.mocked(api.post).mockRejectedValue({ response: { data: { detail: 'Verification link expired' } } })
    setup()
    fillPasswords()
    expect(await screen.findByText('Verification link expired')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Request a new verification email' })).toBeInTheDocument()
  })

  it('allows only one verification submission in flight', async () => {
    let resolve!: (value: { data: { id: string } }) => void
    vi.mocked(api.post).mockImplementation(() => new Promise((done) => { resolve = done }))
    const { container } = setup()
    fillPasswords()
    fireEvent.submit(container.querySelector('form')!)
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1))
    await act(async () => resolve({ data: { id: 'created-user' } }))
    expect(await screen.findByRole('heading', { name: 'Email verified' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByTestId('location')).not.toHaveTextContent(token))
  })

  it('rejects oversized multibyte passwords before sending', async () => {
    setup()
    const oversized = 'ấ'.repeat(25)
    fireEvent.change(screen.getByLabelText('Password', { exact: true }), { target: { value: oversized } })
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: oversized } })
    fireEvent.click(screen.getByRole('button', { name: /Verify email and create account/ }))
    expect(await screen.findByText('Password must not exceed 72 bytes')).toBeInTheDocument()
    expect(api.post).not.toHaveBeenCalled()
  })
})