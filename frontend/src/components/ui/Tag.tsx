import type { ReactNode } from 'react'

export type TagVariant = 'default' | 'acc' | 'ok' | 'warn' | 'err' | 'info'

export interface TagProps {
  variant?: TagVariant
  children: ReactNode
  className?: string
}

const variantClasses: Record<TagVariant, string> = {
  default: 'bg-bg-hover text-fg-2 border-stroke-2',
  acc: 'bg-accent-soft text-accent border-transparent',
  ok: 'bg-[rgba(18,161,80,.09)] text-ok border-transparent',
  warn: 'bg-[rgba(245,165,36,.12)] text-[#b46e00] border-transparent',
  err: 'bg-[rgba(229,72,77,.09)] text-danger border-transparent',
  info: 'bg-[rgba(0,112,243,.09)] text-info border-transparent',
}

export function Tag({ variant = 'default', children, className = '' }: TagProps) {
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-[4px] border px-[6px] py-[3.5px] font-mono text-[11.5px] leading-none ${variantClasses[variant]} ${className}`}
    >
      {children}
    </span>
  )
}
