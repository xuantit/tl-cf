// Shared navigation config for the sidebar, mobile nav and command palette.
// `label` is an i18n key (English text convention) — translate with t() at render.
export interface NavEntry {
  path: string
  icon: string
  label: string
  adminOnly?: boolean
  /** Sidebar grouping — 'account' entries render after the first separator. */
  section?: 'account'
}

// Mockup 2 sidebar order: Domains, Templates, Lịch sử, Tags, Analytics,
// — Tài khoản, Cài đặt, — Người dùng, Audit log (+ Tổng quan on top).
export const NAV_ITEMS: NavEntry[] = [
  { path: '/overview', icon: '▦', label: 'Overview' },
  { path: '/', icon: '◈', label: 'Domains' },
  { path: '/templates', icon: '▤', label: 'Templates' },
  { path: '/history', icon: '◷', label: 'History' },
  { path: '/tags', icon: '⊘', label: 'Tags' },
  { path: '/analytics', icon: '◱', label: 'Analytics' },
  { path: '/accounts', icon: '⌂', label: 'Accounts', section: 'account' },
  { path: '/settings', icon: '⚙', label: 'Settings', section: 'account' },
  { path: '/users', icon: '◉', label: 'Users', adminOnly: true },
  { path: '/audit', icon: '✎', label: 'Audit log', adminOnly: true },
]

/** Is the nav entry active for the current pathname? Domains also owns /domains/:id. */
export function isNavActive(path: string, pathname: string): boolean {
  if (path === '/') return pathname === '/' || pathname.startsWith('/domains')
  return pathname === path || pathname.startsWith(`${path}/`)
}
