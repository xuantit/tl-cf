import type { ReactNode } from 'react'
import { Lbl } from './Lbl'

export interface SectionHeaderProps {
  title: ReactNode
  actions?: ReactNode
  className?: string
}

export function SectionHeader({ title, actions, className = '' }: SectionHeaderProps) {
  return (
    <div
      className={`flex items-center gap-2 border-y border-stroke bg-bg-side px-4 py-[9px] ${className}`}
    >
      <Lbl>{title}</Lbl>
      {actions != null && <div className="ml-auto flex gap-[6px]">{actions}</div>}
    </div>
  )
}
