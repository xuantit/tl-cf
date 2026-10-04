import { useContext, useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { DetailPanelSlotContext } from './detailPanelSlot'

export interface DetailPanelProps {
  open: boolean
  title: ReactNode
  /** Nội dung cố định dưới đáy (nút Lưu/Huỷ/Xoá). */
  footer?: ReactNode
  /** Tắt padding mặc định khi children tự quản layout + footer riêng. */
  padded?: boolean
  onClose: () => void
  children: ReactNode
}

/**
 * Panel cấu hình bên phải, thay cho modal — cơ chế PUSH như mockup 3.html:
 * panel là flex sibling của vùng nội dung nên khi mở nó ĐẨY content sang
 * trái (không nổi đè như modal).
 *
 * Trong focus mode của DomainDetail, panel portal vào slot full-height do
 * layout cung cấp (DetailPanelSlotContext) nên chiếm trọn chiều cao vùng
 * nội dung và đè mọi section bên dưới. Khi không có slot, panel render
 * tại chỗ như một cột flex.
 */
export function DetailPanel({ open, title, footer, padded = true, onClose, children }: DetailPanelProps) {
  const slot = useContext(DetailPanelSlotContext)

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const panel = (
    <aside
      aria-hidden={!open}
      inert={!open}
      className={`h-full flex-none overflow-hidden bg-bg transition-[width] duration-200 ease-out max-md:fixed max-md:inset-y-0 max-md:right-0 max-md:z-40 ${
        open
          ? 'w-[min(440px,46vw)] border-l border-l-stroke max-md:w-[min(420px,94vw)] max-md:shadow-[-18px_0_40px_-24px_rgba(0,0,0,0.5)]'
          : 'w-0'
      }`}
    >
      <div className="flex h-full w-[min(440px,46vw)] flex-col max-md:w-[min(420px,94vw)]">
        <div className="flex flex-none items-center gap-2 border-b border-b-stroke px-3.5 py-2.5">
          <span className="truncate text-[13.5px] font-semibold text-fg">{title}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="ml-auto grid h-7 w-7 cursor-pointer place-items-center rounded-[6px] border-none bg-transparent text-fg-3 hover:bg-bg-hover hover:text-fg"
          >
            ✕
          </button>
        </div>
        <div className={`min-h-0 flex-1 overflow-auto ${padded ? 'p-3.5' : ''}`}>{children}</div>
        {footer && (
          <div className="flex flex-none gap-2 border-t border-t-stroke bg-bg-side px-3.5 py-2.5">
            {footer}
          </div>
        )}
      </div>
    </aside>
  )

  return slot ? createPortal(panel, slot) : panel
}
