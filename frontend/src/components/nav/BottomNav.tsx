import { Link, useLocation } from 'react-router-dom'
import { createElement } from 'react'
import { useTranslation } from 'react-i18next'
import { EllipsisOutlined } from '@ant-design/icons'
import { useAuthStore, getRoleFromToken } from '../../stores/useAuthStore'
import { getBottomTabItems, getSelectedKey } from './navItems'

interface BottomNavProps {
  onMoreClick: () => void
}

export default function BottomNav({ onMoreClick }: BottomNavProps) {
  const { t } = useTranslation()
  const authToken = useAuthStore((s) => s.token)
  const isAdmin = getRoleFromToken(authToken) === 'admin'
  const location = useLocation()

  const tabItems = getBottomTabItems(isAdmin)
  const selectedKey = getSelectedKey(location.pathname, isAdmin)

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-30 flex border-t border-stroke bg-bg-secondary lg:hidden dark:border-stroke-dark dark:bg-bg-dark-secondary"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label={t('Bottom navigation')}
    >
      {tabItems.map((item) => {
        const active = selectedKey === item.key
        const icon = createElement(item.icon)
        const label = t(item.labelKey)
        return (
          <Link
            key={item.key}
            to={item.key}
            aria-current={active ? 'page' : undefined}
            className={`flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 px-1 py-2 text-[10px] font-medium transition-colors ${
              active
                ? '!text-accent'
                : '!text-fg-secondary hover:!text-fg dark:!text-fg-dark-secondary dark:hover:!text-fg-dark'
            }`}
          >
            <span
              className={`text-[20px] leading-none transition-transform ${
                active ? 'scale-110' : ''
              }`}
            >
              {icon}
            </span>
            <span>{label}</span>
            {active && (
              <span className="absolute bottom-0 h-0.5 w-6 rounded-full bg-accent transition-all" />
            )}
          </Link>
        )
      })}

      {/* More button */}
      <button
        onClick={onMoreClick}
        className="flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 border-0 bg-transparent px-1 py-2 text-[10px] font-medium text-fg-secondary transition-colors hover:text-fg dark:text-fg-dark-secondary dark:hover:text-fg-dark"
        aria-label={t('More')}
      >
        <span className="text-[20px] leading-none">
          <EllipsisOutlined />
        </span>
        <span>{t('More')}</span>
      </button>
    </nav>
  )
}
