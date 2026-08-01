export type DotStatus = 'ok' | 'warn' | 'err' | 'off' | 'info'

export interface DotProps {
  status: DotStatus
  className?: string
}

const statusClasses: Record<DotStatus, string> = {
  ok: 'bg-ok',
  warn: 'bg-warn',
  err: 'bg-danger',
  off: 'bg-off',
  info: 'bg-info',
}

export function Dot({ status, className = '' }: DotProps) {
  return (
    <span
      aria-hidden
      className={`inline-block h-[6px] w-[6px] flex-none rounded-full ${statusClasses[status]} ${className}`}
    />
  )
}
