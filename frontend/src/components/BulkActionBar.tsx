import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

export type BulkActionVariant = 'default' | 'primary' | 'danger'

const variantClasses: Record<BulkActionVariant, string> = {
  default:
    'border-white/16 bg-transparent text-white/82 hover:border-white/30 hover:bg-white/8 hover:text-white',
  primary: 'border-accent bg-accent text-on-primary hover:border-accent-hover hover:bg-accent-hover',
  danger:
    'border-[rgba(255,143,143,.28)] bg-transparent text-[#ff8f8f] hover:bg-[rgba(229,72,77,.16)] hover:text-white',
}

export interface BulkActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: BulkActionVariant
}

/** Button styled for the dark action bar (.abar .btn / .pri / .dgr). */
export function BulkActionButton({ variant = 'default', className = '', ...rest }: BulkActionButtonProps) {
  return (
    <button
      type="button"
      className={`h-[26px] cursor-pointer rounded-[6px] border border-solid px-[9px] font-mono text-[11px] leading-none whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${variantClasses[variant]} ${className}`}
      {...rest}
    />
  )
}

export interface BulkActionBarProps {
  /** Number of selected items; the bar hides itself at 0. */
  count: number
  /** Noun after the bold count, e.g. "domain" / "record". */
  unit?: string
  onClear: () => void
  /** Action buttons (use BulkActionButton). Rendered in both desktop + mobile layouts. */
  children: ReactNode
  className?: string
}

/**
 * Dark bottom action bar (.abar desktop / .mbar mobile) shown while rows are
 * selected. Sticky to the bottom of the scrolling content area.
 */
export default function BulkActionBar({ count, unit = 'domain', onClear, children, className = '' }: BulkActionBarProps) {
  const { t } = useTranslation()
  if (count === 0) return null

  const countLabel = (
    <>
      <b className="font-semibold text-[#f4d675]">
        {count} {unit}
      </b>{' '}
      {t('selected')}
    </>
  )

  return (
    <div className={`slide-up sticky inset-x-0 bottom-0 z-10 bg-bar text-white ${className}`}>
      {/* Desktop row (.abar) */}
      <div className="hidden h-10 items-center gap-[9px] px-[13px] lg:flex">
        <span className="font-mono text-[11.5px]">{countLabel}</span>
        <button
          type="button"
          onClick={onClear}
          className="cursor-pointer border-0 bg-transparent p-0 font-mono text-[11px] text-white/50 transition-colors hover:text-white"
        >
          — {t('deselect')}
        </button>
        <div className="ml-auto flex gap-1.5">{children}</div>
      </div>

      {/* Mobile panel (.mbar) */}
      <div className="px-[14px] pt-[9px] pb-[11px] lg:hidden">
        <div className="mb-2 flex items-center font-mono text-[11px]">
          <span>{countLabel}</span>
          <button
            type="button"
            onClick={onClear}
            className="ml-auto cursor-pointer border-0 bg-transparent p-0 font-mono text-[11px] text-white/50"
          >
            {t('Clear selection')}
          </button>
        </div>
        <div className="flex flex-wrap gap-[7px] [&>button]:h-9 [&>button]:flex-1">{children}</div>
      </div>
    </div>
  )
}
