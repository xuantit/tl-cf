import type { ReactNode } from 'react'

export interface PageHeaderTab {
  key: string
  label: ReactNode
  count?: ReactNode
}

interface PageHeaderProps {
  title: ReactNode
  /** Secondary line under the title (kept for backward compatibility). */
  description?: ReactNode
  /** Mono micro-crumb rendered inline next to the title (.hd .crumb). */
  crumb?: ReactNode
  /** Right-aligned actions on the title row. */
  actions?: ReactNode
  /** Optional .tabs row under the header — pages adopt this in later phases. */
  tabs?: PageHeaderTab[]
  activeTab?: string
  onTabChange?: (key: string) => void
}

/** Console-style page header (.hd): h1 + crumb + actions, optional .tabs row. */
export default function PageHeader({
  title,
  description,
  crumb,
  actions,
  tabs,
  activeTab,
  onTabChange,
}: PageHeaderProps) {
  return (
    <div className="page-header">
      <div className="flex flex-wrap items-center gap-[9px]">
        <h1 className="text-[clamp(21px,2vw,27px)] font-semibold tracking-[-0.035em] text-fg">{title}</h1>
        {crumb && <span className="font-mono text-[11px] text-fg-3">{crumb}</span>}
        {actions && <div className="ml-auto flex flex-wrap gap-1.5">{actions}</div>}
      </div>
      {description && <p className="mt-1.5 mb-0 text-[13px] text-fg-2">{description}</p>}
      {tabs && (
        <div className="mt-[9px] flex gap-4 overflow-x-auto border-b border-stroke [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {tabs.map((tab) => {
            const on = tab.key === activeTab
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => onTabChange?.(tab.key)}
                className={`cursor-pointer border-x-0 border-t-0 border-b-2 border-solid bg-transparent px-0 pt-[5px] pb-[7px] text-[12.5px] whitespace-nowrap transition-colors ${
                  on
                    ? 'border-accent font-medium text-fg'
                    : 'border-transparent text-fg-2 hover:text-fg'
                }`}
              >
                {tab.label}
                {tab.count !== undefined && (
                  <span className="ml-1 font-mono text-[11px] text-fg-3">{tab.count}</span>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
