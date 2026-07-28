import type { ReactNode } from 'react'

type StatusVariant = 'active' | 'pending' | 'paused' | 'error' | 'inactive'

const variantClasses: Record<StatusVariant, string> = {
  active: 'bg-[var(--color-success)]',
  pending: 'bg-[var(--color-warning)]',
  paused: 'bg-[var(--color-fg-secondary)]',
  error: 'bg-[var(--color-danger)]',
  inactive: 'bg-[var(--color-stroke)]',
}

interface StatusDotProps {
  /** Visual variant */
  status: StatusVariant
  /** Optional label rendered beside the dot */
  label?: ReactNode
  /** Additional Tailwind classes */
  className?: string
}

/**
 * Coloured dot indicator with an optional label.
 *
 * @example
 * <StatusDot status="active" label="Active" />
 * <StatusDot status="error" />
 */
export default function StatusDot({ status, label, className = '' }: StatusDotProps) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <span
        className={`inline-block h-2 w-2 shrink-0 rounded-full ${variantClasses[status]}`}
        aria-hidden="true"
      />
      {label && (
        <span className="text-[var(--color-fg-secondary)]" style={{ fontSize: 'var(--text-sm)' }}>{label}</span>
      )}
    </span>
  )
}
