import { Link, useLocation } from 'react-router-dom'
import { Tooltip } from 'antd'
import { CloudOutlined, MenuFoldOutlined, MenuUnfoldOutlined, SearchOutlined } from '@ant-design/icons'
import { useState, useEffect, createElement } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore, getRoleFromToken } from '../../stores/useAuthStore'
import AccountSwitcher from '../AccountSwitcher'
import UserMenu from './UserMenu'
import { getSidebarItems, getSelectedKey } from './navItems'

const COLLAPSED_KEY = 'sidebar-collapsed'

interface SidebarProps {
  onSearchClick?: () => void
}

export default function Sidebar({ onSearchClick }: SidebarProps) {
  const { t } = useTranslation()
  const authToken = useAuthStore((s) => s.token)
  const isAdmin = getRoleFromToken(authToken) === 'admin'
  const location = useLocation()

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(COLLAPSED_KEY) === 'true'
    } catch {
      return false
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSED_KEY, String(collapsed))
    } catch {
      // ignore
    }
  }, [collapsed])

  const navItems = getSidebarItems(isAdmin)
  const adminItems = navItems.filter((i) => i.adminOnly)
  const regularItems = navItems.filter((i) => !i.adminOnly)
  const selectedKey = getSelectedKey(location.pathname, isAdmin)

  return (
    <aside
      className={`sticky top-0 hidden h-screen shrink-0 flex-col border-r border-stroke bg-bg-secondary transition-[width] duration-200 lg:flex dark:border-stroke-dark dark:bg-bg-dark-secondary ${
        collapsed ? 'w-[56px]' : 'w-[230px]'
      }`}
      aria-label={t('Main navigation')}
    >
      <div className="flex h-full flex-col overflow-hidden">
        {/* Header: logo + account switcher */}
        <div className="flex items-center gap-2 px-3 pt-4 pb-2">
          <Link
            to="/"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent text-[15px] !text-white"
            aria-label="CF Tool"
          >
            <CloudOutlined />
          </Link>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <AccountSwitcher compact={false} />
            </div>
          )}
        </div>

        {/* Search / Command Palette trigger */}
        <div className="px-3 pb-3">
          {collapsed ? (
            <Tooltip title={`${t('Search')} (⌘K)`} placement="right">
              <button
                onClick={onSearchClick}
                className="flex h-8 w-8 items-center justify-center rounded-md text-fg-secondary transition-colors hover:bg-black/[0.04] hover:text-fg dark:text-fg-dark-secondary dark:hover:bg-white/[0.06] dark:hover:text-fg-dark"
                aria-label={t('Open command palette')}
              >
                <SearchOutlined />
              </button>
              </Tooltip>
            ) : (
              <button
                onClick={onSearchClick}
                className="flex w-full items-center gap-2 rounded-md border border-stroke bg-bg px-2.5 py-1.5 text-[13px] text-fg-secondary transition-colors hover:border-accent/40 dark:border-stroke-dark dark:bg-bg-dark dark:text-fg-dark-secondary"
                aria-label={t('Open command palette')}
              >
                <SearchOutlined className="text-[14px]" />
                <span className="flex-1 text-left">{t('Search…')}</span>
                <kbd className="rounded border border-stroke px-1 py-0.5 text-[10px] font-mono text-fg-secondary dark:border-stroke-dark dark:text-fg-dark-secondary">
                  ⌘K
                </kbd>
              </button>
            )}
          </div>

          {/* Nav */}
          <nav className="flex-1 space-y-0.5 overflow-y-auto px-2" aria-label={t('Site links')}>
            {regularItems.map((item) => {
              const active = selectedKey === item.key
              const icon = createElement(item.icon)
              const label = t(item.labelKey)
              const navLink = (
                <Link
                  key={item.key}
                  to={item.key}
                  aria-current={active ? 'page' : undefined}
                  className={`flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] transition-colors ${
                    active
                      ? 'bg-accent/10 font-medium !text-accent'
                      : '!text-fg-secondary hover:bg-black/[0.04] hover:!text-fg dark:!text-fg-dark-secondary dark:hover:bg-white/[0.06] dark:hover:!text-fg-dark'
                  } ${collapsed ? 'justify-center' : ''}`}
                >
                  <span className="shrink-0 text-base leading-none">{icon}</span>
                  {!collapsed && <span className="truncate">{label}</span>}
                </Link>
              )
              return collapsed ? (
                <Tooltip key={item.key} title={label} placement="right">
                  {navLink}
                </Tooltip>
              ) : (
                navLink
              )
            })}

            {isAdmin && adminItems.length > 0 && (
              <>
                {!collapsed && (
                  <div className="px-2 pt-4 pb-1 text-[11px] font-semibold tracking-wider text-fg-secondary uppercase dark:text-fg-dark-secondary">
                    Admin
                  </div>
                )}
                {collapsed && <div className="mx-auto my-2 h-px w-6 bg-stroke dark:bg-stroke-dark" />}
                {adminItems.map((item) => {
                  const active = selectedKey === item.key
                  const icon = createElement(item.icon)
                  const label = t(item.labelKey)
                  const navLink = (
                    <Link
                      key={item.key}
                      to={item.key}
                      aria-current={active ? 'page' : undefined}
                      className={`flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] transition-colors ${
                        active
                          ? 'bg-accent/10 font-medium !text-accent'
                          : '!text-fg-secondary hover:bg-black/[0.04] hover:!text-fg dark:!text-fg-dark-secondary dark:hover:bg-white/[0.06] dark:hover:!text-fg-dark'
                      } ${collapsed ? 'justify-center' : ''}`}
                    >
                      <span className="shrink-0 text-base leading-none">{icon}</span>
                      {!collapsed && <span className="truncate">{label}</span>}
                    </Link>
                  )
                  return collapsed ? (
                    <Tooltip key={item.key} title={label} placement="right">
                      {navLink}
                    </Tooltip>
                  ) : (
                    navLink
                  )
                })}
              </>
            )}
          </nav>

          {/* Collapse toggle */}
          <div className="border-t border-stroke px-2 py-2 dark:border-stroke-dark">
            <button
              onClick={() => setCollapsed((v) => !v)}
              className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-fg-secondary transition-colors hover:bg-black/[0.04] hover:text-fg dark:text-fg-dark-secondary dark:hover:bg-white/[0.06] dark:hover:text-fg-dark ${
                collapsed ? 'justify-center w-full' : 'w-full'
              }`}
              aria-label={collapsed ? t('Expand sidebar') : t('Collapse sidebar')}
            >
              {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              {!collapsed && <span>{t('Collapse')}</span>}
            </button>
          </div>

          {/* User footer */}
          {!collapsed && (
            <div className="border-t border-stroke px-1 py-2 dark:border-stroke-dark">
              <UserMenu />
            </div>
          )}
          {collapsed && (
            <div className="border-t border-stroke px-2 py-2 dark:border-stroke-dark">
              <UserMenu size={26} />
            </div>
          )}
        </div>
      </aside>
  )
}
