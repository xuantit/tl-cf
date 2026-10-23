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
  ok: 'bg-[color-mix(in_srgb,var(--ok)_9%,var(--bg))] text-ok border-transparent',
  warn: 'bg-[color-mix(in_srgb,var(--warn)_9%,var(--bg))] text-warn border-transparent',
  err: 'bg-[color-mix(in_srgb,var(--danger)_9%,var(--bg))] text-danger border-transparent',
  info: 'bg-[color-mix(in_srgb,var(--info)_9%,var(--bg))] text-info border-transparent',
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
