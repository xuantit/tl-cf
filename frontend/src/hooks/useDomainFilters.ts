import { useMemo } from 'react'
import type { Zone } from '../types/domain'

export type DomainTab = 'all' | 'active' | 'pending' | 'tag'

export interface DomainFilterOptions {
  search: string
  tab: DomainTab
  /** Active tag filter — applies on every tab (the "By tag" tab just opens the picker). */
  tags: string[]
}

/** Derives the visible zone list + tab counts + the set of known tags. */
export function useDomainFilters(zones: Zone[], { search, tab, tags }: DomainFilterOptions) {
  const allTags = useMemo(
    () => [...new Set(zones.flatMap((z) => z.tags || []))].sort(),
    [zones],
  )

  const counts = useMemo(
    () => ({
      all: zones.length,
      active: zones.filter((z) => z.status === 'active').length,
      pending: zones.filter((z) => z.status === 'pending').length,
    }),
    [zones],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return zones.filter((zone) => {
      if (q && !zone.name.toLowerCase().includes(q)) return false
      if (tab === 'active' && zone.status !== 'active') return false
      if (tab === 'pending' && zone.status !== 'pending') return false
      if (tags.length > 0 && !tags.every((t) => (zone.tags || []).includes(t))) return false
      return true
    })
  }, [zones, search, tab, tags])

  return { filtered, counts, allTags }
}
