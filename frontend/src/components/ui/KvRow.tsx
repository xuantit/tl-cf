import type { ReactNode } from 'react'

export interface KvRowProps {
  k: ReactNode
  v: ReactNode
  className?: string
}

export function KvRow({ k, v, className = '' }: KvRowProps) {
  return (
    <div
      className={`flex h-[26px] items-center justify-between border-b border-stroke-2 text-[12.5px] last:border-b-0 ${className}`}
    >
      <span className="text-fg-2">{k}</span>
      <span className="flex items-center gap-[6px] font-mono text-[12.5px]">{v}</span>
    </div>
  )
}
