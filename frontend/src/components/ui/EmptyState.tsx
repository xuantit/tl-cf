import type { ReactNode } from 'react'
import { Button } from 'antd'

interface EmptyStateProps {
  /** Icon element (e.g. an AntD icon or emoji) */
  icon?: ReactNode
  /** Main heading */
  title: ReactNode
  /** Supporting description */
  description?: ReactNode
  /** Call-to-action rendered below the description */
  action?: ReactNode
  /** Action button label — used only if `action` is not provided */
  actionLabel?: string
  /** Called when the default action button is clicked */
  onAction?: () => void
  /** Additional Tailwind classes */
  className?: string
}

/**
 * Empty state placeholder: icon + title + optional description + optional CTA.
 *
 * @example
 * <EmptyState
 *   icon={<InboxOutlined />}
 *   title="No domains yet"
 *   description="Add your first Cloudflare zone to get started."
 *   actionLabel="Add Domain"
 *   onAction={() => setOpen(true)}
 * />
 */
export default function EmptyState({
  icon,
  title,
  description,
  action,
  actionLabel,
  onAction,
  className = '',
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 py-16 text-center ${className}`}
    >
      {icon && (
        <span className="text-4xl text-[var(--color-fg-secondary)] opacity-60">{icon}</span>
      )}
      <p className="text-base font-semibold text-[var(--color-fg)] dark:text-[var(--color-fg-dark)]">
        {title}
      </p>
      {description && (
        <p className="max-w-xs text-sm text-[var(--color-fg-secondary)]">{description}</p>
      )}
      {action ??
        (actionLabel && onAction ? (
          <Button type="primary" onClick={onAction}>
            {actionLabel}
          </Button>
        ) : null)}
    </div>
  )
}
