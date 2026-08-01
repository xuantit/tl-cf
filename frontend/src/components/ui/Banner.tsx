import type { ReactNode } from 'react'
import { Dot, type DotStatus } from './Dot'

export type BannerTone = 'warn' | 'err' | 'info'

export interface BannerProps {
  tone: BannerTone
  children: ReactNode
  actions?: ReactNode
  className?: string
}

const toneClasses: Record<BannerTone, string> = {
  warn: 'bg-[rgba(245,165,36,.08)]',
  err: 'bg-[rgba(229,72,77,.07)]',
  info: 'bg-[rgba(0,112,243,.06)]',
}

const toneDot: Record<BannerTone, DotStatus> = {
  warn: 'warn',
  err: 'err',
  info: 'info',
}

export function Banner({ tone, children, actions, className = '' }: BannerProps) {
  return (
    <div
      className={`flex items-center gap-[9px] border-b border-stroke px-4 py-[9px] text-[12.5px] ${toneClasses[tone]} ${className}`}
    >
      <Dot status={toneDot[tone]} />
      <span className="min-w-0">{children}</span>
      {actions != null && <div className="ml-auto flex gap-[6px]">{actions}</div>}
    </div>
  )
}
