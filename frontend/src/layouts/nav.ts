// Shared navigation config for the sidebar, mobile nav and command palette.
// `label` is an i18n key (English text convention) — translate with t() at render.
export interface NavEntry {
  path: string
  icon: string
  label: string
  adminOnly?: boolean
  /** Sidebar grouping — 'account' entries render after the first separator. */
  section?: 'account'
  /** Expandable menu entries; child routes are also searchable in the palette. */
  children?: NavEntry[]
}

export const CLOUDFLARE_TOOLS_NAV: NavEntry = {
  path: '/tools', icon: '⚒', label: 'Cloudflare tools',
  children: [
    { path: '/tools/workers', icon: 'ƒ', label: 'Workers & Pages' },
    { path: '/tools/tunnels', icon: '⇌', label: 'Tunnels' },
    { path: '/tools/turnstile', icon: '◈', label: 'Turnstile' },
  ],
}

// Domain analytics lives in /domains/:zoneId?tab=analytics. Account services share /tools.
// Sidebar order: Domains, Templates, Lịch sử, Tags, Công cụ Cloudflare,
// — Tài khoản, Cài đặt, — Người dùng, Audit log (+ Tổng quan on top).
export const NAV_ITEMS: NavEntry[] = [
  { path: '/overview', icon: '▦', label: 'Overview' },
  { path: '/', icon: '◈', label: 'Domains' },
  { path: '/templates', icon: '▤', label: 'Templates' },
  { path: '/history', icon: '◷', label: 'History' },
  { path: '/tags', icon: '⊘', label: 'Tags' },
  CLOUDFLARE_TOOLS_NAV,
  { path: '/accounts', icon: '⌂', label: 'Accounts', section: 'account' },
  { path: '/settings', icon: '⚙', label: 'Settings', section: 'account' },
  { path: '/users', icon: '◉', label: 'Users', adminOnly: true },
  // Invite administration is retained at /invites, but email signup no longer uses it.
  { path: '/audit', icon: '✎', label: 'Audit log', adminOnly: true },
]

/** Is the nav entry active for the current pathname? Domains also owns /domains/:id. */
export function isNavActive(path: string, pathname: string): boolean {
  if (path === '/') return pathname === '/' || pathname.startsWith('/domains')
  return pathname === path || pathname.startsWith(`${path}/`)
}
