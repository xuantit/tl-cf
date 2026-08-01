import type { ReactNode } from 'react'

export interface LblProps {
  children: ReactNode
  className?: string
}

export function Lbl({ children, className = '' }: LblProps) {
  return (
    <span
      className={`font-mono text-[11px] font-medium uppercase tracking-[.08em] text-fg-3 ${className}`}
    >
      {children}
    </span>
  )
}
