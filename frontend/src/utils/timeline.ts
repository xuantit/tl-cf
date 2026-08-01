import { dateGroup } from './format'

export interface DayGroup<T> {
  key: 'today' | 'yesterday' | 'other'
  date: string
  items: T[]
}

/** Groups items (already sorted newest-first) into day buckets for the timeline. */
export function groupByDay<T>(items: T[], getDate: (item: T) => string | number): DayGroup<T>[] {
  const groups: DayGroup<T>[] = []
  for (const item of items) {
    const g = dateGroup(getDate(item))
    const last = groups[groups.length - 1]
    if (last && last.date === g.date) last.items.push(item)
    else groups.push({ key: g.key, date: g.date, items: [item] })
  }
  return groups
}
