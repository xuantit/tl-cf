import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ConfigProvider } from 'antd'
import '../../i18n'

vi.mock('../../hooks/useIsMobile', () => ({
  useIsMobile: vi.fn(),
}))

import { useIsMobile } from '../../hooks/useIsMobile'
import ResponsiveModal from './ResponsiveModal'

function wrapper({ children }: { children: React.ReactNode }) {
  return <ConfigProvider>{children}</ConfigProvider>
}

describe('ResponsiveModal', () => {
  it('renders Modal on desktop (md+)', () => {
    vi.mocked(useIsMobile).mockReturnValue(false)

    const { container } = render(
      <ResponsiveModal open title="Desktop Modal" onCancel={() => {}}>
        <p>modal content</p>
      </ResponsiveModal>,
      { wrapper },
    )

    // AntD Modal renders into a portal outside the container
    // but we can check for the title in document.body
    expect(screen.getAllByText('Desktop Modal').length).toBeGreaterThan(0)
    expect(screen.getAllByText('modal content').length).toBeGreaterThan(0)
    // Should NOT be a Drawer
    expect(document.body.querySelector('.ant-drawer')).toBeNull()
    // container itself is essentially empty (portal renders to body)
    expect(container).toBeDefined()
  })

  it('renders Drawer on mobile (<md)', () => {
    vi.mocked(useIsMobile).mockReturnValue(true)

    render(
      <ResponsiveModal open title="Mobile Drawer" onCancel={() => {}}>
        <p>drawer content</p>
      </ResponsiveModal>,
      { wrapper },
    )

    // Should be a Drawer
    expect(document.body.querySelector('.ant-drawer')).toBeTruthy()
    expect(screen.getAllByText('Mobile Drawer').length).toBeGreaterThan(0)
    expect(screen.getAllByText('drawer content').length).toBeGreaterThan(0)
  })

  it('does not render content when closed', () => {
    vi.mocked(useIsMobile).mockReturnValue(false)

    render(
      <ResponsiveModal open={false} title="Closed Modal" onCancel={() => {}}>
        <p>hidden content</p>
      </ResponsiveModal>,
      { wrapper },
    )

    expect(screen.queryByText('hidden content')).toBeNull()
  })
})
