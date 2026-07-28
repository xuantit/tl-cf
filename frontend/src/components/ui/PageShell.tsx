import type { ReactNode } from 'react'

interface PageShellProps {
  /** Page content */
  children: ReactNode
  /** Additional Tailwind classes */
  className?: string
}

/**
 * Top-level page container.
 * Provides consistent max-width, responsive horizontal padding, and vertical spacing.
 *
 * @example
 * <PageShell>
 *   <PageHeader title="Domains" />
 *   ...
 * </PageShell>
 */
export default function PageShell({ children, className = '' }: PageShellProps) {
  return (
    <div className={`mx-auto w-full max-w-7xl px-4 py-6 md:px-6 md:py-8 lg:px-8 ${className}`}>
      {children}
    </div>
  )
}
