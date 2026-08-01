import { useState } from 'react'
import type { ReactNode } from 'react'
import { Button, Input, Modal } from 'antd'
import { useTranslation } from 'react-i18next'
import { useUiPrefStore } from '../stores/useUiPrefStore'
import { Tag } from './ui'

export interface ConfirmDestructiveItem {
  key: string
  label: ReactNode
  meta?: ReactNode
}

export interface ConfirmDestructiveProps {
  open: boolean
  title: ReactNode
  /** Affected items shown as a bordered mono list (first 6 + "+N more"). */
  items?: ConfirmDestructiveItem[]
  /** Explanation of the consequences. */
  explanation?: ReactNode
  /** Exact text the user must type to enable the confirm button, e.g. "xoá 3 zone". */
  confirmText: string
  /** Confirm button label — defaults to t('Delete permanently'). */
  confirmLabel?: ReactNode
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
}

const MAX_ITEMS = 6

/**
 * Reusable destructive confirm modal (2.html confirm section): warning icon,
 * affected item list, explanation and a type-to-confirm input.
 */
export default function ConfirmDestructive({
  open,
  title,
  items,
  explanation,
  confirmText,
  confirmLabel,
  loading,
  onConfirm,
  onCancel,
}: ConfirmDestructiveProps) {
  const { t } = useTranslation()
  return (
    <Modal
      open={open}
      onCancel={onCancel}
      footer={null}
      width={440}
      destroyOnHidden
      title={
        <div className="flex items-center gap-[9px]">
          <span className="grid h-[26px] w-[26px] flex-none place-items-center rounded-[6px] bg-[rgba(229,72,77,.1)] text-[14px] text-danger">
            ⚠
          </span>
          <span>
            <span className="block text-[14px] leading-tight font-semibold">{title}</span>
            <span className="mt-[2px] block font-mono text-[11.5px] font-normal text-fg-3">
              {t('This cannot be undone')}
            </span>
          </span>
        </div>
      }
    >
      {/* Body is a child component so its typed-text state resets on every open (destroyOnHidden). */}
      <ConfirmBody
        items={items}
        explanation={explanation}
        confirmText={confirmText}
        confirmLabel={confirmLabel}
        loading={loading}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    </Modal>
  )
}

function ConfirmBody({
  items,
  explanation,
  confirmText,
  confirmLabel,
  loading,
  onConfirm,
  onCancel,
}: Omit<ConfirmDestructiveProps, 'open' | 'title'>) {
  const { t } = useTranslation()
  const [typed, setTyped] = useState('')
  // Settings → Bảo mật: when the user disables dangerous-action confirms,
  // skip the type-to-confirm input (the modal itself still shows).
  const confirmDanger = useUiPrefStore((s) => s.confirmDanger)
  const ready = !confirmDanger || typed.trim() === confirmText

  const visible = items?.slice(0, MAX_ITEMS) || []
  const more = (items?.length || 0) - visible.length

  return (
    <div className="pt-1">
      {visible.length > 0 && (
        <div className="mb-[13px] overflow-hidden rounded-[6px] border border-solid border-stroke">
          {visible.map((item) => (
            <div
              key={item.key}
              className="flex items-center gap-1.5 border-0 border-b border-solid border-stroke-2 px-[10px] py-[6px] font-mono text-[12px] last:border-b-0"
            >
              <span className="truncate">{item.label}</span>
              {item.meta != null && <Tag>{item.meta}</Tag>}
            </div>
          ))}
          {more > 0 && (
            <div className="px-[10px] py-[6px] font-mono text-[11px] text-fg-3">
              {t('+{{count}} more', { count: more })}
            </div>
          )}
        </div>
      )}

      {explanation != null && <p className="mb-[13px] text-[12.5px] text-fg-2">{explanation}</p>}

      {confirmDanger && (
        <>
          <label className="mb-1.5 block font-mono text-[11px] tracking-[.08em] text-fg-3 uppercase">
            {t('Type')} <span className="normal-case text-danger">{confirmText}</span> {t('to confirm')}
          </label>
          <Input
            autoFocus
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={confirmText}
            onPressEnter={() => ready && !loading && onConfirm()}
          />
        </>
      )}

      <div className="mt-4 flex justify-end gap-[7px]">
        <Button onClick={onCancel}>{t('Cancel')}</Button>
        <Button danger type="primary" disabled={!ready} loading={loading} onClick={onConfirm}>
          {confirmLabel ?? t('Delete permanently')}
        </Button>
      </div>
    </div>
  )
}
