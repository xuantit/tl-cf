import { useTranslation } from 'react-i18next'

import { DOMAIN_MODULES, type ModuleKey } from './modules'

/**
 * Rail trái ở chế độ focus: sidebar thật full-height thay chỗ sidebar chính
 * của AppShell (đã thu lại), giúp nhảy nhanh giữa các chức năng của zone.
 */
export default function FunctionRail({
  zoneName,
  active,
  counts,
  onSelect,
  onBack,
}: {
  zoneName?: string
  active: ModuleKey
  counts?: Partial<Record<ModuleKey, number>>
  onSelect: (key: ModuleKey) => void
  onBack: () => void
}) {
  const { t } = useTranslation()

  // Khớp SideNavItem của AppShell (sidebar chính): h-32px, text-14px,
  // active = nền accent-soft chữ accent — rail trông như sidebar chính "biến hình".
  const itemClass = (on: boolean) =>
    `flex h-[32px] w-full cursor-pointer items-center gap-[9px] rounded-[6px] border-none px-[9px] text-left text-[14px] transition-colors ${
      on
        ? 'bg-accent-soft font-medium text-accent'
        : 'bg-transparent text-fg-2 hover:bg-bg-hover hover:text-fg'
    }`

  const sectionLabel = 'px-[9px] pt-2 pb-1 font-mono text-[10px] uppercase tracking-[0.08em] text-fg-3'

  return (
    <nav className="hidden w-[264px] flex-none flex-col gap-[1px] overflow-y-auto border-r border-r-stroke bg-bg-side px-[11px] py-[11px] md:flex">
      <span className={sectionLabel}>{zoneName || '…'}</span>

      <button type="button" aria-label={t('Overview')} onClick={onBack} className={itemClass(false)}>
        <span className="w-[18px] text-center text-[15px] opacity-90">▦</span>
        <span className="truncate">{t('Overview')}</span>
      </button>

      <span className={sectionLabel}>{t('Features')}</span>

      {DOMAIN_MODULES.map((mod) => (
        <button
          key={mod.key}
          type="button"
          aria-label={t(mod.label)}
          onClick={() => onSelect(mod.key)}
          className={itemClass(mod.key === active)}
        >
          <span className="w-[18px] text-center text-[15px] opacity-90">{mod.icon}</span>
          <span className="truncate">{t(mod.label)}</span>
          {counts?.[mod.key] !== undefined && (
            <span
              className={`ml-auto font-mono text-[12px] ${
                mod.key === active ? 'text-accent opacity-75' : 'text-fg-3'
              }`}
            >
              {counts[mod.key]}
            </span>
          )}
        </button>
      ))}

      <div className="mt-auto border-t border-t-stroke pt-2">
        <button
          type="button"
          aria-label={t('Back to Overview')}
          onClick={onBack}
          className={itemClass(false)}
        >
          ← {t('Back to Overview')}
        </button>
      </div>
    </nav>
  )
}
