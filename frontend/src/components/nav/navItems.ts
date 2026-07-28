import {
  GlobalOutlined,
  FileTextOutlined,
  HistoryOutlined,
  TeamOutlined,
  UserOutlined,
  KeyOutlined,
  FileSearchOutlined,
} from '@ant-design/icons'
import type { ComponentType } from 'react'

export interface NavItemDef {
  key: string
  /** i18n key */
  labelKey: string
  icon: ComponentType
  adminOnly?: boolean
  /** Show in bottom tab bar on mobile (max 4 items + More) */
  bottomTab?: boolean
}

export const NAV_ITEMS: NavItemDef[] = [
  { key: '/', labelKey: 'Domains', icon: GlobalOutlined, bottomTab: true },
  { key: '/templates', labelKey: 'Templates', icon: FileTextOutlined, bottomTab: true },
  { key: '/history', labelKey: 'History', icon: HistoryOutlined, bottomTab: true },
  { key: '/accounts', labelKey: 'Accounts', icon: TeamOutlined },
  { key: '/users', labelKey: 'Users', icon: UserOutlined, adminOnly: true },
  { key: '/invites', labelKey: 'Invite codes', icon: KeyOutlined, adminOnly: true },
  { key: '/audit', labelKey: 'Audit log', icon: FileSearchOutlined, adminOnly: true },
]

/** Items shown in the sidebar (all) */
export function getSidebarItems(isAdmin: boolean): NavItemDef[] {
  return NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin)
}

/** Items for the bottom tab bar: first 3 bottomTab items + "More" */
export function getBottomTabItems(isAdmin: boolean): NavItemDef[] {
  const visible = NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin)
  return visible.filter((item) => item.bottomTab).slice(0, 3)
}

/** Items shown in MobileDrawer "More" sheet */
export function getDrawerItems(isAdmin: boolean): NavItemDef[] {
  const visible = NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin)
  const bottomTabKeys = new Set(getBottomTabItems(isAdmin).map((i) => i.key))
  return visible.filter((item) => !bottomTabKeys.has(item.key))
}

/** Compute the selected nav key from current pathname */
export function getSelectedKey(pathname: string, isAdmin: boolean): string {
  const items = getSidebarItems(isAdmin)
  const keys = items.map((i) => i.key)
  return (
    keys
      .filter((k) =>
        k === '/'
          ? pathname === '/' || pathname.startsWith('/domains')
          : pathname.startsWith(k),
      )
      .sort((a, b) => b.length - a.length)[0] ?? '/'
  )
}
