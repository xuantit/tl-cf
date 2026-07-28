import type { ReactNode } from 'react'

interface SectionProps {
  /** Small uppercase heading */
  heading?: ReactNode
  children: ReactNode
  /** Additional Tailwind classes */
  className?: string
}

/**
 * Content group with an optional small uppercase heading and a thin divider.
 *
 * @example
 * <Section heading="DNS Records">
 *   <RecordsList />
 * </Section>
 */
export default function Section({ heading, children, className = '' }: SectionProps) {
  return (
    <section className={`space-y-3 ${className}`}>
      {heading && (
        <div>
          <p
            className="font-semibold uppercase tracking-widest text-[var(--color-fg-secondary)]"
            style={{ fontSize: 'var(--text-2xs)' }}
          >
            {heading}
          </p>
          <div className="mt-1.5 border-t border-[var(--color-stroke)] dark:border-[var(--color-stroke-dark)]" />
        </div>
      )}
      {children}
    </section>
  )
}
