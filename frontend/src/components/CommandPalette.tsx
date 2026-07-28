import { useEffect, useRef, useState, createElement } from 'react'
import { useNavigate } from 'react-router-dom'
import { Modal, Drawer, Input } from 'antd'
import { SearchOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api } from '../services/api'
import { NAV_ITEMS } from './nav/navItems'
import { useAuthStore, getRoleFromToken } from '../stores/useAuthStore'
import type { Domain } from '../types/domain'

interface CommandPaletteProps {
  open: boolean
  onClose: () => void
}

interface CommandItem {
  id: string
  label: string
  sublabel?: string
  group: string
  icon?: React.ReactNode
  onSelect: () => void
}

/** Simple fuzzy match: all query chars appear in value in order */
function fuzzyMatch(query: string, value: string): boolean {
  if (!query) return true
  const q = query.toLowerCase()
  const v = value.toLowerCase()
  let qi = 0
  for (let i = 0; i < v.length && qi < q.length; i++) {
    if (v[i] === q[qi]) qi++
  }
  return qi === q.length
}

/** The inner palette UI – renders fresh each time (parent uses destroyOnHidden) */
function PaletteContent({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const authToken = useAuthStore((s) => s.token)
  const isAdmin = getRoleFromToken(authToken) === 'admin'
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Focus input on mount
  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 50)
    return () => clearTimeout(timer)
  }, [])

  // Scroll active item into view
  useEffect(() => {
    if (listRef.current) {
      const active = listRef.current.querySelector('[data-active="true"]')
      if (active && typeof active.scrollIntoView === 'function') {
        active.scrollIntoView({ block: 'nearest' })
      }
    }
  }, [activeIndex])

  // Fetch domains for quick navigation
  const { data: domains = [] } = useQuery<Domain[]>({
    queryKey: ['domains'],
    queryFn: async () => (await api.get('/domains')).data,
    staleTime: 30_000,
  })

  const navCommandItems: CommandItem[] = NAV_ITEMS.filter(
    (item) => !item.adminOnly || isAdmin,
  ).map((item) => ({
    id: `nav-${item.key}`,
    label: t(item.labelKey),
    group: t('Navigation'),
    icon: createElement(item.icon),
    onSelect: () => {
      navigate(item.key)
      onClose()
    },
  }))

  const domainItems: CommandItem[] = domains.map((d) => ({
    id: `domain-${d.id}`,
    label: d.name,
    sublabel: d.status,
    group: t('Domains'),
    onSelect: () => {
      navigate(`/domains/${d.id}`)
      onClose()
    },
  }))

  const allItems: CommandItem[] = [...navCommandItems, ...domainItems]
  const filtered = allItems.filter(
    (item) =>
      fuzzyMatch(query, item.label) ||
      (item.sublabel && fuzzyMatch(query, item.sublabel)),
  )

  const groups = Array.from(new Set(filtered.map((i) => i.group)))

  const handleSelect = (item: CommandItem) => {
    item.onSelect()
  }

  const handleQueryChange = (value: string) => {
    setQuery(value)
    setActiveIndex(0)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filtered[activeIndex]) handleSelect(filtered[activeIndex])
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  return (
    <div className="flex flex-col" style={{ maxHeight: 480 }}>
      {/* Search input */}
      <div className="border-b border-stroke px-3 py-2 dark:border-stroke-dark">
        <Input
          ref={(el) => {
            if (el) inputRef.current = el.input
          }}
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          onKeyDown={handleKeyDown}
          prefix={<SearchOutlined className="text-fg-secondary" />}
          placeholder={t('Search pages and domains…')}
          bordered={false}
          size="large"
          autoComplete="off"
        />
      </div>

      {/* Results list */}
      <div ref={listRef} className="flex-1 overflow-y-auto py-1">
        {filtered.length === 0 ? (
          <div className="px-4 py-8 text-center text-[13px] text-fg-secondary dark:text-fg-dark-secondary">
            {t('No results for "{{query}}"', { query })}
          </div>
        ) : (
          groups.map((group) => {
            const groupItems = filtered.filter((i) => i.group === group)
            return (
              <div key={group}>
                <div className="px-3 py-1.5 text-[11px] font-semibold tracking-wider text-fg-secondary uppercase dark:text-fg-dark-secondary">
                  {group}
                </div>
                {groupItems.map((item) => {
                  const globalIndex = filtered.indexOf(item)
                  const isActive = globalIndex === activeIndex
                  return (
                    <button
                      key={item.id}
                      data-active={isActive}
                      onClick={() => handleSelect(item)}
                      onMouseEnter={() => setActiveIndex(globalIndex)}
                      className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-[13px] transition-colors ${
                        isActive
                          ? 'bg-accent/10 !text-accent'
                          : '!text-fg hover:bg-black/[0.04] dark:!text-fg-dark dark:hover:bg-white/[0.06]'
                      }`}
                    >
                      {item.icon && (
                        <span className="shrink-0 text-[16px] leading-none">{item.icon}</span>
                      )}
                      <span className="flex-1 truncate">{item.label}</span>
                      {item.sublabel && (
                        <span className="text-[11px] text-fg-secondary dark:text-fg-dark-secondary">
                          {item.sublabel}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            )
          })
        )}
      </div>

      {/* Footer hint */}
      <div className="flex items-center gap-3 border-t border-stroke px-3 py-2 text-[11px] text-fg-secondary dark:border-stroke-dark dark:text-fg-dark-secondary">
        <span>
          <kbd className="rounded border border-stroke px-1 dark:border-stroke-dark">↑↓</kbd>{' '}
          {t('navigate')}
        </span>
        <span>
          <kbd className="rounded border border-stroke px-1 dark:border-stroke-dark">↵</kbd>{' '}
          {t('select')}
        </span>
        <span>
          <kbd className="rounded border border-stroke px-1 dark:border-stroke-dark">Esc</kbd>{' '}
          {t('close')}
        </span>
      </div>
    </div>
  )
}

export default function CommandPalette({ open, onClose }: CommandPaletteProps) {
  // Detect mobile viewport
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(max-width: 1023px)').matches
      : false,
  )
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)')
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  if (isMobile) {
    return (
      <Drawer
        open={open}
        onClose={onClose}
        placement="bottom"
        height="auto"
        styles={{
          body: { padding: 0 },
          header: { display: 'none' },
        }}
        style={{ borderRadius: '16px 16px 0 0' }}
        destroyOnHidden
      >
        {/* Drag handle */}
        <div className="mx-auto mb-1 mt-2 h-1 w-8 rounded-full bg-stroke dark:bg-stroke-dark" />
        <PaletteContent onClose={onClose} />
      </Drawer>
    )
  }

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={560}
      styles={{ body: { padding: 0 } }}
      destroyOnHidden
      centered
    >
      <PaletteContent onClose={onClose} />
    </Modal>
  )
}

