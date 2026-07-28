import { Skeleton } from 'antd'

interface SkeletonTableProps {
  /** Number of skeleton rows to display */
  rows?: number
  /** Number of columns */
  columns?: number
}

/**
 * Table loading skeleton — replaces full-page `<Spin>` to reduce layout shift.
 *
 * @example
 * <SkeletonTable rows={5} columns={4} />
 */
export function SkeletonTable({ rows = 5, columns = 4 }: SkeletonTableProps) {
  return (
    <div className="w-full overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-stroke)] dark:border-[var(--color-stroke-dark)]">
      {/* Header row */}
      <div className="flex gap-4 border-b border-[var(--color-stroke)] px-4 py-3 dark:border-[var(--color-stroke-dark)]">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton.Input key={i} active size="small" className="flex-1" style={{ height: 12 }} />
        ))}
      </div>
      {/* Data rows */}
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          className="flex gap-4 border-b border-[var(--color-stroke)] px-4 py-4 last:border-b-0 dark:border-[var(--color-stroke-dark)]"
        >
          {Array.from({ length: columns }).map((_, c) => (
            <Skeleton.Input
              key={c}
              active
              size="small"
              className="flex-1"
              style={{ height: 14 }}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

interface SkeletonCardsProps {
  /** Number of skeleton cards */
  count?: number
}

/**
 * Card grid loading skeleton.
 *
 * @example
 * <SkeletonCards count={6} />
 */
export function SkeletonCards({ count = 4 }: SkeletonCardsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-[var(--radius-md)] border border-[var(--color-stroke)] p-4 dark:border-[var(--color-stroke-dark)]"
        >
          <div className="flex items-start gap-3">
            <Skeleton.Avatar active shape="square" size={44} />
            <div className="flex-1 space-y-2">
              <Skeleton.Input active size="small" style={{ width: '60%', height: 14 }} />
              <Skeleton.Input active size="small" style={{ width: '80%', height: 20 }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * Full-page loading skeleton for initial page load.
 *
 * @example
 * <SkeletonPage />
 */
export function SkeletonPage() {
  return (
    <div className="space-y-6 p-4 md:p-6 lg:p-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton.Input active style={{ width: 180, height: 28 }} />
          <Skeleton.Input active size="small" style={{ width: 280, height: 14 }} />
        </div>
        <Skeleton.Button active size="large" />
      </div>
      {/* Stat cards */}
      <SkeletonCards count={4} />
      {/* Table */}
      <SkeletonTable rows={6} columns={5} />
    </div>
  )
}
