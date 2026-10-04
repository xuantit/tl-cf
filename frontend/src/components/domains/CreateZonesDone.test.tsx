import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import '../../i18n'
import { CreateZonesDone } from './BulkAddDomainsModal'
import type { BulkJob } from '../../hooks/useJobPolling'

describe('CreateZonesDone', () => {
  it('renders the shared clone result contract without crashing the completed job', () => {
    const job: BulkJob = {
      id: 'job', type: 'clone-domain', status: 'done', total: 1, processed: 1,
      succeeded: 1, failed: 0, createdAt: 0,
      items: [{ key: 'clone.example', status: 'success', result: {
        name: 'clone.example', zoneId: 'clone-id', status: 'pending',
        nameServers: ['ns1.cloudflare.com', 'ns2.cloudflare.com'], steps: [],
      } }],
    }
    render(<CreateZonesDone job={job} />)
    expect(screen.getByText('clone.example')).toBeInTheDocument()
    expect(screen.getByText('ns1.cloudflare.com')).toBeInTheDocument()
    expect(screen.getByText('ns2.cloudflare.com')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeEnabled()
  })
})