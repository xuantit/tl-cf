import { Drawer } from 'antd'
import { Link, useLocation } from 'react-router-dom'
import { createElement } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore, getRoleFromToken } from '../../stores/useAuthStore'
import { getDrawerItems, getSelectedKey } from './navItems'
import UserMenu from './UserMenu'

interface MobileDrawerProps {
  open: boolean
  onClose: () => void
}

export default function MobileDrawer({ open, onClose }: MobileDrawerProps) {
  const { t } = useTranslation()
  const authToken = useAuthStore((s) => s.token)
  const isAdmin = getRoleFromToken(authToken) === 'admin'
  const location = useLocation()

  const drawerItems = getDrawerItems(isAdmin)
  const selectedKey = getSelectedKey(location.pathname, isAdmin)

  return (
    <Drawer
      open={open}
      onClose={onClose}
      placement="bottom"
      height="auto"
      styles={{
        body: { padding: '8px 12px 16px' },
        header: { display: 'none' },
      }}
      style={{ borderRadius: '16px 16px 0 0' }}
      className="lg:hidden"
    >
      {/* Drag handle */}
      <div className="mx-auto mb-3 h-1 w-8 rounded-full bg-stroke dark:bg-stroke-dark" />

      <nav aria-label={t('More navigation')}>
        {drawerItems.map((item) => {
          const active = selectedKey === item.key
          const icon = createElement(item.icon)
          const label = t(item.labelKey)
          return (
            <Link
              key={item.key}
              to={item.key}
              onClick={onClose}
              aria-current={active ? 'page' : undefined}
              className={`flex items-center gap-3 rounded-lg px-3 py-3 text-[14px] transition-colors ${
                active
                  ? 'bg-accent/10 font-medium !text-accent'
                  : '!text-fg hover:bg-black/[0.04] dark:!text-fg-dark dark:hover:bg-white/[0.06]'
              }`}
            >
              <span className="text-[18px] leading-none">{icon}</span>
              <span>{label}</span>
            </Link>
          )
        })}
      </nav>

      <div className="mt-4 border-t border-stroke pt-3 dark:border-stroke-dark">
        <UserMenu />
      </div>
    </Drawer>
  )
}
