import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api } from '../services/api'
import { useAuthStore, getRoleFromToken } from '../stores/useAuthStore'
import { useCommandPalette } from '../stores/useCommandPalette'
import { NAV_ITEMS } from '../layouts/nav'
import { Kbd } from './ui'

interface Zone {
  id: string
  name: string
  status: string
}

interface PaletteItem {
  key: string
  icon: string
  label: string
  meta?: string
  to: string
}

/**
 * ⌘K command palette (.cmdk in the mockup): searches domains from the shared
 * ['domains'] React Query cache (fetches GET /domains once when opened if the
 * cache is empty) plus static navigation entries.
 */
export default function CommandPalette() {
  const open = useCommandPalette((s) => s.open)
  const setOpen = useCommandPalette((s) => s.setOpen)
  const toggle = useCommandPalette((s) => s.toggle)

  // Global shortcuts: ⌘K / Ctrl+K toggles, Esc closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        toggle()
      } else if (e.key === 'Escape') {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggle, setOpen])

  if (!open) return null
  // Panel mounts fresh on every open → query/selection state resets without effects.
  return <PalettePanel onClose={() => setOpen(false)} />
}

function PalettePanel({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const token = useAuthStore((s) => s.token)
  const isAdmin = getRoleFromToken(token) === 'admin'
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)

  // Same queryKey as the Domains page → reuses its cache; only fetches when stale/empty.
  const { data: zones = [] } = useQuery<Zone[]>({
    queryKey: ['domains'],
    queryFn: async () => (await api.get('/domains')).data,
    staleTime: 60_000,
  })

  const q = query.trim().toLowerCase()

  const domainItems: PaletteItem[] = useMemo(
    () =>
      zones
        .filter((z) => !q || z.name.toLowerCase().includes(q))
        .slice(0, 6)
        .map((z) => ({ key: `d:${z.id}`, icon: '◈', label: z.name, meta: z.status, to: `/domains/${z.id}` })),
    [zones, q],
  )

  const navItems: PaletteItem[] = useMemo(
    () =>
      NAV_ITEMS.filter((n) => isAdmin || !n.adminOnly)
        .flatMap((n) => [n, ...(n.children ?? []).filter((child) => isAdmin || !child.adminOnly)])
        .map((n) => ({ key: `n:${n.path}`, icon: n.icon, label: t(n.label), to: n.path }))
        .filter((n) => !q || n.label.toLowerCase().includes(q)),
    [isAdmin, t, q],
  )

  const items = useMemo(() => [...domainItems, ...navItems], [domainItems, navItems])
  const activeIndex = items.length === 0 ? -1 : Math.min(active, items.length - 1)

  const activate = (item: PaletteItem) => {
    navigate(item.to)
    onClose()
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(a + 1, items.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Enter') {
      const item = items[activeIndex]
      if (item) activate(item)
    }
  }

  const renderItem = (item: PaletteItem, index: number) => (
    <div
      key={item.key}
      role="option"
      aria-selected={index === activeIndex}
      onMouseEnter={() => setActive(index)}
      onClick={() => activate(item)}
      className={`flex cursor-pointer items-center gap-[9px] px-[13px] py-[6.5px] text-[12.5px] ${
        index === activeIndex ? 'bg-accent-soft text-accent' : 'text-fg'
      }`}
    >
      <span className="w-[14px] text-center text-[12px] opacity-80">{item.icon}</span>
      <span className="truncate">{item.label}</span>
      {item.meta && (
        <span className={`ml-auto font-mono text-[11.5px] ${index === activeIndex ? 'text-accent opacity-70' : 'text-fg-3'}`}>
          {item.meta}
        </span>
      )}
    </div>
  )

  return (
    <div
      className="fixed inset-0 z-50 flex justify-center bg-black/[.28] pt-[88px] backdrop-blur-sm dark:bg-black/50"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-label={t('Quick find')}
        className="h-max w-[520px] max-w-[calc(100vw-32px)] overflow-hidden rounded-xl border border-stroke bg-bg shadow-[0_22px_60px_-18px_rgba(0,0,0,0.4)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Search input row */}
        <div className="flex items-center gap-[9px] border-b border-stroke px-[13px] py-[11px] font-mono text-[13px] text-fg-3">
          <span>⌕</span>
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
            }}
            onKeyDown={onKeyDown}
            placeholder={t('Type to search…')}
            className="min-w-0 flex-1 border-0 bg-transparent p-0 font-mono text-[13px] text-fg outline-none placeholder:text-fg-3"
          />
          <Kbd>esc</Kbd>
        </div>

        <div className="max-h-[320px] overflow-y-auto pb-1">
          {domainItems.length > 0 && (
            <>
              <div className="px-[13px] pt-[9px] pb-1 font-mono text-[11px] tracking-[.09em] text-fg-3 uppercase">
                Domains · {domainItems.length}
              </div>
              {domainItems.map((item, i) => renderItem(item, i))}
            </>
          )}
          {navItems.length > 0 && (
            <>
              <div className="px-[13px] pt-[9px] pb-1 font-mono text-[11px] tracking-[.09em] text-fg-3 uppercase">
                {t('Navigation')}
              </div>
              {navItems.map((item, i) => renderItem(item, domainItems.length + i))}
            </>
          )}
          {items.length === 0 && (
            <div className="px-[13px] py-6 text-center font-mono text-[11px] text-fg-3">{t('No results')}</div>
          )}
        </div>

        {/* Footer hints */}
        <div className="flex gap-[13px] border-t border-stroke px-[13px] py-[7px] font-mono text-[11px] text-fg-3">
          <span>{t('↑↓ select')}</span>
          <span>{t('↵ open')}</span>
          <span>{t('esc close')}</span>
        </div>
      </div>
    </div>
  )
}
