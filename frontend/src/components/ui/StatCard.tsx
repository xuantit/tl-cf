import type { ReactNode } from 'react'
import { Card } from 'antd'
import { ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons'

interface StatCardProps {
  /** Icon rendered inside the chip */
  icon: ReactNode
  /** Metric label */
  label: ReactNode
  /** Metric value */
  value: ReactNode
  /** Optional delta indicator */
  delta?: {
    value: ReactNode
    direction: 'up' | 'down' | 'neutral'
  }
  /** Background/icon colour (CSS colour string) */
  color?: string
  /** Additional Tailwind classes */
  className?: string
}

/**
 * Stat card: icon chip + label + value + optional delta.
 * Replaces the `.stat-card` / `.icon-chip` CSS pattern.
 *
 * @example
 * <StatCard
 *   icon={<GlobalOutlined />}
 *   label="Total Domains"
 *   value={42}
 *   delta={{ value: '+3 this week', direction: 'up' }}
 *   color="#f6821f"
 * />
 */
export default function StatCard({
  icon,
  label,
  value,
  delta,
  color = '#f6821f',
  className = '',
}: StatCardProps) {
  const deltaColor =
    delta?.direction === 'up'
      ? 'text-[var(--color-success)]'
      : delta?.direction === 'down'
        ? 'text-[var(--color-danger)]'
        : 'text-[var(--color-fg-secondary)]'

  return (
    <Card
      className={`cursor-default transition-transform duration-[var(--dur-base)] hover:-translate-y-0.5 hover:border-[var(--color-accent)] ${className}`}
      styles={{ body: { padding: 16 } }}
      hoverable={false}
    >
      <div className="flex items-start gap-3">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xl"
          style={{ background: `${color}1a`, color }}
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] text-[var(--color-fg-secondary)]">{label}</p>
          <p className="mt-0.5 text-xl font-bold text-[var(--color-fg)] dark:text-[var(--color-fg-dark)]">
            {value}
          </p>
          {delta && (
            <span className={`mt-1 flex items-center gap-0.5 text-xs ${deltaColor}`}>
              {delta.direction === 'up' ? (
                <ArrowUpOutlined />
              ) : delta.direction === 'down' ? (
                <ArrowDownOutlined />
              ) : null}
              {delta.value}
            </span>
          )}
        </div>
      </div>
    </Card>
  )
}
