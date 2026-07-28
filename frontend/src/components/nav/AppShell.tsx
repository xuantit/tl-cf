import { Outlet, Link } from 'react-router-dom'
import { Suspense, useState } from 'react'
import { Spin } from 'antd'
import { CloudOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import Sidebar from './Sidebar'
import BottomNav from './BottomNav'
import MobileDrawer from './MobileDrawer'
import UserMenu from './UserMenu'
import AccountSwitcher from '../AccountSwitcher'
import CommandPalette from '../CommandPalette'
import { useCommandPalette } from '../../hooks/useCommandPalette'
import { SearchOutlined } from '@ant-design/icons'

// TODO(redesign-pr1): thay bằng primitive thật từ PR 1/4 (SkeletonPage)
function PageFallback() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Spin size="large" />
    </div>
  )
}

export default function AppShell() {
  const { t } = useTranslation()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const { open: paletteOpen, setOpen: setPaletteOpen } = useCommandPalette()

  return (
    <>
      {/* Skip to main content */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-md focus:bg-bg focus:px-4 focus:py-2 focus:text-[13px] focus:shadow-pop focus:ring-2 focus:ring-accent dark:focus:bg-bg-dark"
      >
        {t('Skip to content')}
      </a>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />

      <div className="flex min-h-screen bg-bg dark:bg-bg-dark">
        {/* Desktop sidebar */}
        <Sidebar onSearchClick={() => setPaletteOpen(true)} />

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Mobile top bar */}
          <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-stroke bg-bg/90 px-3 py-2 backdrop-blur lg:hidden dark:border-stroke-dark dark:bg-bg-dark/90">
            <Link to="/" className="flex items-center gap-2" aria-label="CF Tool">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent text-[15px] !text-white">
                <CloudOutlined />
              </span>
            </Link>
            <div className="min-w-0 flex-1">
              <AccountSwitcher compact />
            </div>
            <button
              onClick={() => setPaletteOpen(true)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-fg-secondary transition-colors hover:bg-black/[0.04] hover:text-fg dark:text-fg-dark-secondary dark:hover:bg-white/[0.06] dark:hover:text-fg-dark"
              aria-label={t('Search')}
            >
              <SearchOutlined />
            </button>
            <UserMenu size={28} />
          </header>

          {/* Page content */}
          <main
            id="main-content"
            className="min-w-0 flex-1 pb-[calc(56px+env(safe-area-inset-bottom))] lg:pb-0"
          >
            <div className="mx-auto w-full max-w-[1200px]">
              <Suspense fallback={<PageFallback />}>
                <Outlet />
              </Suspense>
            </div>
          </main>
        </div>
      </div>

      {/* Mobile bottom nav + drawer */}
      <BottomNav onMoreClick={() => setDrawerOpen(true)} />
      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  )
}
