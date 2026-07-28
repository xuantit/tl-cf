import type { ReactNode } from 'react'
import { Table, Card, Dropdown, Button, Empty } from 'antd'
import type { ColumnsType, TableProps } from 'antd/es/table'
import { MoreOutlined } from '@ant-design/icons'
import { useIsMobile } from '../../hooks/useIsMobile'
import { SkeletonTable, SkeletonCards } from './Skeletons'
import EmptyState from './EmptyState'

/** Render-prop bag for mapping a data row to mobile card content */
export interface MobileCardConfig<T> {
  /** Primary line (bold, top of card) */
  title: (record: T) => ReactNode
  /** Secondary line below title */
  subtitle?: (record: T) => ReactNode
  /** Additional metadata lines */
  meta?: (record: T) => ReactNode
  /** Action items for the row's overflow menu */
  actions?: (record: T) => ReactNode
}

export interface ResponsiveTableProps<T extends object> {
  /** AntD column definitions */
  columns: ColumnsType<T>
  /** Table data */
  dataSource: T[]
  /** Row key field or function */
  rowKey?: TableProps<T>['rowKey']
  /** Show loading skeleton */
  loading?: boolean
  /** Mobile card render config */
  mobile?: MobileCardConfig<T>
  /** Custom empty state */
  emptyText?: ReactNode
  /** Empty state icon */
  emptyIcon?: ReactNode
  /** Additional Tailwind classes */
  className?: string
  /** Extra props forwarded to AntD Table (desktop only) */
  tableProps?: Omit<TableProps<T>, 'columns' | 'dataSource' | 'rowKey' | 'loading'>
}

/**
 * ⭐ Responsive table primitive.
 *
 * - `md+` (≥768px): renders an AntD `<Table>` with full column set.
 * - `<md` (<768px): renders a card list where each row becomes its own card
 *   (primary line, optional subtitle, meta, overflow action menu).
 *
 * @example
 * <ResponsiveTable
 *   columns={columns}
 *   dataSource={domains}
 *   rowKey="id"
 *   loading={isLoading}
 *   mobile={{
 *     title: (row) => row.name,
 *     subtitle: (row) => row.status,
 *     meta: (row) => <StatusDot status={row.active ? 'active' : 'paused'} />,
 *     actions: (row) => <RowActions domain={row} />,
 *   }}
 * />
 */
export default function ResponsiveTable<T extends object>({
  columns,
  dataSource,
  rowKey = 'id',
  loading = false,
  mobile,
  emptyText,
  emptyIcon,
  className = '',
  tableProps,
}: ResponsiveTableProps<T>) {
  const isMobile = useIsMobile()

  const getKey = (record: T, index: number): string => {
    if (typeof rowKey === 'function') return String(rowKey(record))
    const key = rowKey as keyof T
    return String(record[key] ?? index)
  }

  if (loading) {
    return isMobile ? <SkeletonCards count={3} /> : <SkeletonTable rows={5} columns={columns.length} />
  }

  if (dataSource.length === 0) {
    return (
      <EmptyState
        icon={emptyIcon}
        title={emptyText ?? <Empty description={false} />}
        className={className}
      />
    )
  }

  /* ── Desktop: AntD Table ── */
  if (!isMobile) {
    return (
      <Table
        columns={columns}
        dataSource={dataSource}
        rowKey={rowKey}
        pagination={false}
        className={className}
        {...tableProps}
      />
    )
  }

  /* ── Mobile: Card list ── */
  return (
    <div className={`space-y-2 ${className}`}>
      {dataSource.map((record, i) => {
        const key = getKey(record, i)
        const hasActions = mobile?.actions

        return (
          <Card
            key={key}
            size="small"
            styles={{ body: { padding: '12px 14px' } }}
            className="hover:bg-[var(--color-hover)] dark:hover:bg-[var(--color-hover-dark)] transition-colors duration-[var(--dur-fast)]"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                {mobile?.title && (
                  <p className="truncate text-sm font-semibold text-[var(--color-fg)] dark:text-[var(--color-fg-dark)]">
                    {mobile.title(record)}
                  </p>
                )}
                {mobile?.subtitle && (
                  <p className="mt-0.5 truncate text-xs text-[var(--color-fg-secondary)]">
                    {mobile.subtitle(record)}
                  </p>
                )}
                {mobile?.meta && (
                  <div className="mt-2">{mobile.meta(record)}</div>
                )}
              </div>
              {hasActions && (
                <Dropdown
                  dropdownRender={() => <>{mobile.actions!(record)}</>}
                  trigger={['click']}
                  placement="bottomRight"
                >
                  <Button
                    type="text"
                    size="small"
                    icon={<MoreOutlined />}
                    className="shrink-0"
                    aria-label="Actions"
                  />
                </Dropdown>
              )}
            </div>
          </Card>
        )
      })}
    </div>
  )
}
