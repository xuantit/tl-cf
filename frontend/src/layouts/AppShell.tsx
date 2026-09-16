import { useEffect } from 'react'
import { Dropdown } from 'antd'
import type { MenuProps } from 'antd'
import {
  BulbFilled,
  BulbOutlined,
  LogoutOutlined,
  TranslationOutlined,
} from '@ant-design/icons'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { api } from '../services/api'
import { useAuthStore, getRoleFromToken, getEmailFromToken } from '../stores/useAuthStore'
import { useThemeStore } from '../stores/useThemeStore'
import { useCommandPalette } from '../stores/useCommandPalette'
import { useSelectionMode } from '../stores/useSelectionMode'
import { useFocusMode } from '../stores/useFocusMode'
import AccountSwitcher from '../components/AccountSwitcher'
import CommandPalette from '../components/CommandPalette'
import { Kbd } from '../components/ui'
import { NAV_ITEMS, isNavActive } from './nav'

function SideNavItem({
  to,
  icon,
  label,
  count,
  active,
}: {
  to: string
  icon: string
  label: string
  count?: number
  active: boolean
}) {
  return (
    <Link
      to={to}
      className={`flex h-[32px] items-center gap-[9px] rounded-[6px] px-[9px] text-[14px] transition-colors ${
        active
          ? 'bg-accent-soft font-medium !text-accent'
          : '!text-fg-2 hover:bg-bg-hover hover:!text-fg'
      }`}
    >
      <span className="w-[18px] text-center text-[15px] opacity-90">{icon}</span>
      <span className="truncate">{label}</span>
      {count !== undefined && (
        <span className={`ml-auto font-mono text-[12px] ${active ? 'text-accent opacity-75' : 'text-fg-3'}`}>
          {count}
        </span>
      )}
    </Link>
  )
}

function MobileNavButton({
  to,
  onClick,
  icon,
  label,
  active,
}: {
  to?: string
  onClick?: () => void
  icon: string
  label: string
  active: boolean
}) {
  const className = `relative flex flex-col items-center gap-[2px] pt-[7px] pb-[9px] font-mono text-[11px] transition-colors ${
    active ? '!text-accent' : '!text-fg-3'
  }`
  const content = (
    <>
      {active && (
        <span className="absolute top-0 left-1/2 h-[2px] w-[20px] -translate-x-1/2 rounded-b-[2px] bg-accent" />
      )}
      <span className="text-[16px]">{icon}</span>
      {label}
    </>
  )
  if (to) {
    return (
      <Link to={to} onClick={onClick} className={className}>
        {content}
      </Link>
    )
  }
  return (
    <button type="button" onClick={onClick} className={`${className} cursor-pointer border-0 bg-transparent`}>
      {content}
    </button>
  )
}

/** Console-style app shell: 264px sidebar (desktop) + bottom nav (mobile) + ⌘K palette. */
export default function AppShell() {
  const { t, i18n } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()
  const token = useAuthStore((s) => s.token)
  const setToken = useAuthStore((s) => s.setToken)
  const isAdmin = getRoleFromToken(token) === 'admin'
  const email = getEmailFromToken(token)
  const dark = useThemeStore((s) => s.dark)
  const toggleTheme = useThemeStore((s) => s.toggle)
  const openPalette = useCommandPalette((s) => s.setOpen)
  const selectionOn = useSelectionMode((s) => s.on)
  // Focus mode (trang chi tiết domain): sidebar thu lại để FunctionRail thay chỗ.
  const focus = useFocusMode((s) => s.active)

  // Selection mode only makes sense on the Domains list — leave it when navigating away.
  useEffect(() => {
    if (location.pathname !== '/') useSelectionMode.getState().setOn(false)
  }, [location.pathname])

  // Subscribe to the domains cache for the sidebar count without triggering a fetch.
  const { data: cachedDomains } = useQuery<unknown[]>({
    queryKey: ['domains'],
    queryFn: async () => (await api.get('/domains')).data,
    enabled: false,
  })
  const counts: Record<string, number | undefined> = { '/': cachedDomains?.length }

  const userMenuItems: MenuProps['items'] = [
    {
      key: 'lang',
      icon: <TranslationOutlined />,
      label: i18n.language === 'vi' ? 'English' : 'Tiếng Việt',
    },
    {
      key: 'theme',
      icon: dark ? <BulbFilled /> : <BulbOutlined />,
      label: dark ? t('Light mode') : t('Dark mode'),
    },
    { type: 'divider' as const },
    { key: 'logout', icon: <LogoutOutlined />, label: t('Logout'), danger: true },
  ]

  const onUserMenuClick: MenuProps['onClick'] = ({ key }) => {
    if (key === 'logout') setToken(null)
    else if (key === 'lang') i18n.changeLanguage(i18n.language === 'vi' ? 'en' : 'vi')
    else if (key === 'theme') toggleTheme()
  }

  const initials = email ? email.split('@')[0].slice(0, 2).toUpperCase() : '?'

  const mainNav = NAV_ITEMS.filter((n) => !n.adminOnly && n.section !== 'account')
  const accountNav = NAV_ITEMS.filter((n) => n.section === 'account')
  const adminNav = NAV_ITEMS.filter((n) => n.adminOnly)

  // "Select" toggles the Domains selection mode (navigating there first if needed).
  const onSelectTab = () => {
    if (location.pathname !== '/') {
      navigate('/')
      useSelectionMode.getState().setOn(true)
    } else {
      useSelectionMode.getState().toggle()
    }
  }

  const mobileTabs: {
    key: string
    icon: string
    label: string
    to?: string
    onClick?: () => void
    active: boolean
  }[] = [
    {
      key: 'domains',
      icon: '◈',
      label: 'Domains',
      to: '/',
      // Bấm Domains khi đang bật chế độ chọn → thoát chế độ chọn (nếu không tab
      // Select cứ sáng mãi và người dùng tưởng nav hỏng).
      onClick: () => useSelectionMode.getState().setOn(false),
      active: isNavActive('/', location.pathname) && !selectionOn,
    },
    { key: 'select', icon: '☑', label: t('Select'), onClick: onSelectTab, active: selectionOn },
    { key: 'history', icon: '◷', label: t('History'), to: '/history', active: isNavActive('/history', location.pathname) },
    {
      key: 'more',
      icon: '⋯',
      label: t('More'),
      to: '/more',
      active: ['/more', '/accounts', '/templates', '/users', '/invites', '/audit', '/settings', '/tags', '/analytics', '/overview', '/workers', '/tunnels', '/turnstile'].some(
        (p) => isNavActive(p, location.pathname),
      ),
    },
  ]

  return (
    <div className="flex h-dvh bg-bg">
      {/* Desktop sidebar (.side) — thu về w-0 khi focus mode để rail chức năng chiếm mép trái */}
      <aside
        className={`hidden shrink-0 flex-col overflow-hidden border-stroke bg-bg-side py-[11px] transition-[width,padding] duration-200 lg:flex ${
          focus ? 'w-0 border-r-0 px-0' : 'w-[264px] border-r px-[11px]'
        }`}
      >
        {/* Wrapper giữ bề rộng cố định để nội dung không bị bóp méo khi sidebar đóng, chỉ bị cắt */}
        <div className="flex h-full w-[242px] flex-col">
        {/* Brand */}
        <Link to="/" className="flex items-center gap-[7px] px-[5px] pt-[3px] pb-[7px]">
          <span className="grid h-[21px] w-[21px] shrink-0 place-items-center rounded-[5px] bg-accent text-[12px] text-white">
            ☁
          </span>
          <span className="font-mono text-[14px] font-semibold tracking-[-0.01em] !text-fg">CF Tool</span>
          <span className="ml-auto font-mono text-[11px] text-fg-3">v2</span>
        </Link>

        {/* Compact account switcher */}
        <div className="mb-[9px]">
          <AccountSwitcher />
        </div>

        {/* Quick search (.qs) */}
        <button
          type="button"
          onClick={() => openPalette(true)}
          className="mb-[9px] flex h-[30px] w-full cursor-pointer items-center gap-1.5 rounded-[6px] border border-solid border-stroke bg-bg px-[9px] font-mono text-[12px] text-fg-3 transition-colors hover:border-fg-3"
        >
          <span>⌕</span>
          <span>{t('Quick find')}</span>
          <Kbd className="ml-auto">⌘K</Kbd>
        </button>

        {/* Nav (.ni) */}
        <nav className="flex flex-1 flex-col gap-[1px] overflow-y-auto">
          {mainNav.map((item) => (
            <SideNavItem
              key={item.path}
              to={item.path}
              icon={item.icon}
              label={t(item.label)}
              count={counts[item.path]}
              active={isNavActive(item.path, location.pathname)}
            />
          ))}
          <div className="mx-[5px] my-2 h-px shrink-0 bg-stroke" />
          {accountNav.map((item) => (
            <SideNavItem
              key={item.path}
              to={item.path}
              icon={item.icon}
              label={t(item.label)}
              active={isNavActive(item.path, location.pathname)}
            />
          ))}
          {isAdmin && (
            <>
              <div className="mx-[5px] my-2 h-px shrink-0 bg-stroke" />
              {adminNav.map((item) => (
                <SideNavItem
                  key={item.path}
                  to={item.path}
                  icon={item.icon}
                  label={t(item.label)}
                  active={isNavActive(item.path, location.pathname)}
                />
              ))}
            </>
          )}
        </nav>

        {/* User footer (.foot) */}
        <Dropdown menu={{ items: userMenuItems, onClick: onUserMenuClick }} placement="topLeft" trigger={['click']}>
          <button
            type="button"
            className="mt-auto flex w-full cursor-pointer items-center gap-[7px] border-x-0 border-t border-b-0 border-solid border-stroke bg-transparent px-[5px] pt-[7px] pb-[2px] text-left"
          >
            <span className="grid h-[21px] w-[21px] shrink-0 place-items-center rounded-[4px] bg-fg font-mono text-[10px] font-semibold text-bg">
              {initials}
            </span>
            <span className="truncate font-mono text-[12px] text-fg-2">{email}</span>
          </button>
        </Dropdown>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar (.mstat) */}
        <header className="flex items-center justify-center border-b border-stroke px-[14px] pt-[6px] pb-[4px] font-mono text-[11.5px] text-fg-2 lg:hidden">
          CF Tool
        </header>

        {/* Main content — full-width console style */}
        <main className="min-w-0 flex-1 overflow-auto bg-bg">
          <Outlet />
        </main>

        {/* Mobile bottom nav (.mnav) */}
        <nav className="grid grid-cols-4 border-t border-stroke bg-bg pb-[env(safe-area-inset-bottom)] lg:hidden">
          {mobileTabs.map((tab) => (
            <MobileNavButton
              key={tab.key}
              to={tab.to}
              onClick={tab.onClick}
              icon={tab.icon}
              label={tab.label}
              active={tab.active}
            />
          ))}
        </nav>
      </div>

      <CommandPalette />
    </div>
  )
}
