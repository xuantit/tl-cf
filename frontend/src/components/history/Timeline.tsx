import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { SectionHeader } from '../ui'
import { formatClock } from '../../utils/format'
import type { DayGroup } from '../../utils/timeline'

export function DayHeader({ group }: { group: DayGroup<unknown> }) {
  const { t } = useTranslation()
  const prefix = group.key === 'today' ? `${t('Today')} · ` : group.key === 'yesterday' ? `${t('Yesterday')} · ` : ''
  return <SectionHeader title={`${prefix}${group.date}`} />
}

/** Inline mono code chunk used in timeline row titles (.tl .t1 code). */
export function CodeChunk({ children }: { children: ReactNode }) {
  return (
    <code className="rounded-[3px] border border-solid border-stroke-2 bg-bg-hover px-1 py-px font-mono text-[12.5px]">
      {children}
    </code>
  )
}

export interface TimelineRowProps {
  time: string | number
  title: ReactNode
  meta?: ReactNode
  /** Right-aligned content: status Tag + optional inline action. */
  right?: ReactNode
  onClick?: () => void
}

/** Console 1a timeline row (.tl .it): time · body · status. */
export function TimelineRow({ time, title, meta, right, onClick }: TimelineRowProps) {
  return (
    <div
      className={`flex gap-[11px] border-0 border-b border-solid border-stroke-2 px-4 py-[9px] transition-colors ${
        onClick ? 'cursor-pointer hover:bg-bg-hover' : ''
      }`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
    >
      <span className="w-[96px] flex-none pt-px font-mono text-[11.5px] text-fg-3">
        {formatClock(time)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[12.5px] text-fg">{title}</div>
        {meta != null && <div className="mt-[3px] font-mono text-[11.5px] text-fg-3">{meta}</div>}
      </div>
      {right != null && <span className="flex flex-none items-start gap-2">{right}</span>}
    </div>
  )
}
