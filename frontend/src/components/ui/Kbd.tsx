import type { ReactNode } from 'react'

export interface KbdProps {
  children: ReactNode
  className?: string
}

export function Kbd({ children, className = '' }: KbdProps) {
  return (
    <kbd
      className={`rounded-[4px] border border-b-2 border-stroke bg-bg px-[4px] py-[1.5px] font-mono text-[10.5px] text-fg-3 ${className}`}
    >
      {children}
    </kbd>
  )
}
