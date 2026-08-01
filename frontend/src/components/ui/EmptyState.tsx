import type { ReactNode } from 'react'

export interface EmptyStateProps {
  icon?: ReactNode
  title: ReactNode
  desc?: ReactNode
  actions?: ReactNode
  className?: string
}

export function EmptyState({ icon, title, desc, actions, className = '' }: EmptyStateProps) {
  return (
    <div className={`px-4 py-[56px] text-center ${className}`}>
      {icon != null && <div className="text-[26px] opacity-35">{icon}</div>}
      <div className="mt-[10px] text-[13px] font-medium">{title}</div>
      {desc != null && <div className="mt-1 font-mono text-[12px] text-fg-3">{desc}</div>}
      {actions != null && <div className="mt-[14px] flex justify-center gap-[6px]">{actions}</div>}
    </div>
  )
}
