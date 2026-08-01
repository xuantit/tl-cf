import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'

/**
 * Zone selection kept in the URL (?zone=...) so F5 / shared links restore it
 * — same pattern the Domains page already used for modals and jobs.
 */
export function useDomainSelection() {
  const [searchParams, setSearchParams] = useSearchParams()

  const selected = useMemo(() => searchParams.getAll('zone'), [searchParams])
  const selectedSet = useMemo(() => new Set(selected), [selected])

  const setSelected = useCallback(
    (zoneIds: string[]) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.delete('zone')
          zoneIds.forEach((id) => next.append('zone', id))
          return next
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  const toggle = useCallback(
    (zoneId: string) => {
      setSelected(
        selectedSet.has(zoneId) ? selected.filter((id) => id !== zoneId) : [...selected, zoneId],
      )
    },
    [selected, selectedSet, setSelected],
  )

  const clear = useCallback(() => setSelected([]), [setSelected])
  const selectAll = useCallback((zoneIds: string[]) => setSelected(zoneIds), [setSelected])

  return { selected, selectedSet, setSelected, toggle, clear, selectAll }
}
