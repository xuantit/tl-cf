import { useId, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { isNavActive, type NavEntry } from '../layouts/nav'

/** Inline disclosure menu: opens in the sidebar/More menu, never in the page header. */
export default function NavMenuGroup({ item, mobile = false }: { item: NavEntry; mobile?: boolean }) {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const panelId = useId()
  const active = isNavActive(item.path, pathname)
  const [toggle, setToggle] = useState<{ pathname: string; open: boolean } | null>(null)
  // Deep links and navigation into the group reveal the selected child. Manual
  // collapse is respected until pathname changes; query-only edits do not reset it.
  const open = toggle?.pathname === pathname ? toggle.open : active
  return (
    <div className={mobile ? 'border-b border-stroke-2' : ''}>
      <button type="button" aria-expanded={open} aria-controls={panelId}
        onClick={() => setToggle({ pathname, open: !open })}
        className={`flex w-full cursor-pointer items-center gap-[9px] border-0 bg-transparent text-left transition-colors ${
          mobile ? 'px-[14px] py-[12px] text-[14px]' : 'h-[40px] rounded-[10px] px-[12px] text-[14px]'
        } ${active ? '!bg-accent-soft font-medium text-accent' : 'text-fg-2 hover:bg-bg-hover hover:text-fg'}`}>
        <span aria-hidden="true" className="w-[18px] flex-none text-center text-[15px] opacity-90">{item.icon}</span>
        <span className="truncate">{t(item.label)}</span>
        <span aria-hidden="true" className={`ml-auto text-[12px] transition-transform ${open ? 'rotate-90' : ''}`}>›</span>
      </button>
      <div id={panelId} role="group" aria-label={t(item.label)} hidden={!open}
        className={`my-1 border-l border-stroke ${mobile ? 'mr-3 ml-[23px] pl-3' : 'mr-1 ml-[18px] pl-[9px]'}`}>
        {item.children?.map((child) => {
          const selected = isNavActive(child.path, pathname)
          return <Link key={child.path} to={child.path} aria-current={selected ? 'page' : undefined}
            className={`flex min-h-[32px] items-center gap-2 rounded-[6px] px-[9px] text-[13px] transition-colors ${
              selected ? 'bg-accent-soft font-medium !text-accent' : '!text-fg-2 hover:bg-bg-hover hover:!text-fg'
            }`}>
            <span aria-hidden="true" className="w-[18px] flex-none text-center opacity-85">{child.icon}</span>
            <span className="truncate">{t(child.label)}</span>
          </Link>
        })}
      </div>
    </div>
  )
}