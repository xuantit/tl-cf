import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../../services/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  apiErrorDetail: () => undefined,
  apiErrorCode: () => undefined,
}))

import '../../../i18n'
import DnsRecordDrawer from '../../../components/dns/DnsRecordDrawer'

describe('DnsRecordDrawer', () => {
  it('updates the zone-file preview as inputs change', async () => {
    render(
      <DnsRecordDrawer
        open
        zoneName="tienlen.vn"
        onSubmit={async () => {}}
        onClose={() => {}}
      />,
    )

    const preview = await screen.findByTestId('dns-preview')
    // A record proxied by default → auto TTL + "; proxied" comment
    expect(preview).toHaveTextContent('IN A')
    expect(preview).toHaveTextContent('; proxied')

    fireEvent.change(screen.getByPlaceholderText('@'), { target: { value: 'api' } })
    fireEvent.change(screen.getByPlaceholderText('203.0.113.10'), { target: { value: '203.0.113.42' } })

    expect(preview).toHaveTextContent('api.tienlen.vn.')
    expect(preview).toHaveTextContent('203.0.113.42')
  })

  it('shows the priority field for MX and includes it in the preview', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(
      <DnsRecordDrawer open zoneName="tienlen.vn" onSubmit={onSubmit} onClose={() => {}} />,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'MX' }))

    const priority = screen.getByLabelText('Priority')
    fireEvent.change(priority, { target: { value: '10' } })
    fireEvent.change(screen.getByPlaceholderText('@'), { target: { value: '@' } })

    const contentLabel = screen.getByText('Mail server')
    expect(contentLabel).toBeInTheDocument()

    const inputs = screen.getAllByRole('textbox')
    // name input + content input (priority is a spinbutton)
    fireEvent.change(inputs[1], { target: { value: 'aspmx.l.google.com' } })

    const preview = screen.getByTestId('dns-preview')
    expect(preview).toHaveTextContent('IN MX')
    expect(preview).toHaveTextContent('10 aspmx.l.google.com')
    // MX is not proxyable
    expect(preview).not.toHaveTextContent('; proxied')

    fireEvent.click(screen.getByRole('button', { name: 'Save record' }))
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'MX', content: 'aspmx.l.google.com', priority: 10 }),
      false,
    )
  })
})
