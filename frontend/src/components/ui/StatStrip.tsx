import type { ReactNode } from 'react'

export type DeltaTone = 'up' | 'down' | 'muted'

export interface StatStripItem {
  value: ReactNode
  label: ReactNode
  delta?: ReactNode
  deltaTone?: DeltaTone
}

export interface StatStripProps {
  items: StatStripItem[]
  className?: string
}

const toneClasses: Record<DeltaTone, string> = {
  up: 'text-ok',
  down: 'text-danger',
  muted: 'text-fg-3',
}

export function StatStrip({ items, className = '' }: StatStripProps) {
  return (
    <div
      className={`flex overflow-x-auto border-b border-stroke [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${className}`}
    >
      {items.map((item, i) => (
        <div key={i} className="min-w-[104px] flex-1 border-r border-stroke p-[10px_16px] last:border-r-0">
          <div className="font-mono text-[19px] font-semibold leading-[1.15] tracking-[-.02em]">
            {item.value}
          </div>
          <div className="mt-[2px] font-mono text-[10.5px] uppercase tracking-[.08em] whitespace-nowrap text-fg-3">
            {item.label}
          </div>
          {item.delta != null && (
            <div className={`mt-[3px] font-mono text-[11px] ${toneClasses[item.deltaTone ?? 'muted']}`}>
              {item.delta}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
