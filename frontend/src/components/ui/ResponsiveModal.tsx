import type { ReactNode } from 'react'
import { Modal, Drawer } from 'antd'
import type { ModalProps } from 'antd'
import { useIsMobile } from '../../hooks/useIsMobile'

export interface ResponsiveModalProps
  extends Omit<ModalProps, 'children'> {
  /** Modal/Drawer content */
  children?: ReactNode
  /**
   * Title displayed in the header.
   * Forwarded to both Modal `title` and Drawer `title`.
   */
  title?: ReactNode
  /** Whether the overlay is visible */
  open?: boolean
  /** Called when the user requests to close */
  onCancel?: () => void
  /** Footer content — passed to Modal; ignored on Drawer (use form submit) */
  footer?: ReactNode | null
  /** Drawer height on mobile (default: auto) */
  drawerHeight?: number | string
  /** Additional className */
  className?: string
}

/**
 * Responsive modal primitive.
 *
 * - `md+` (≥768px): renders an AntD `<Modal>`.
 * - `<md` (<768px): renders an AntD `<Drawer placement="bottom">` with rounded
 *   top corners and a visual drag handle.
 *
 * API mirrors AntD `<Modal>` so it can be used as a drop-in replacement.
 *
 * @example
 * <ResponsiveModal
 *   open={open}
 *   title="Edit Domain"
 *   onCancel={() => setOpen(false)}
 *   footer={null}
 * >
 *   <DomainForm />
 * </ResponsiveModal>
 */
export default function ResponsiveModal({
  children,
  title,
  open,
  onCancel,
  footer,
  drawerHeight,
  className,
  ...modalProps
}: ResponsiveModalProps) {
  const isMobile = useIsMobile()

  if (isMobile) {
    return (
      <Drawer
        title={title}
        open={open}
        onClose={onCancel}
        placement="bottom"
        height={drawerHeight ?? 'auto'}
        className={className}
        styles={{
          wrapper: {
            borderTopLeftRadius: 14,
            borderTopRightRadius: 14,
            overflow: 'hidden',
          },
          header: { borderBottom: 'none', paddingBottom: 8 },
          body: { paddingTop: 0 },
        }}
        extra={
          <div
            className="mx-auto mb-2 h-1 w-10 rounded-full bg-[var(--color-stroke)] dark:bg-[var(--color-stroke-dark)]"
            aria-hidden="true"
          />
        }
      >
        {children}
      </Drawer>
    )
  }

  return (
    <Modal
      title={title}
      open={open}
      onCancel={onCancel}
      footer={footer}
      className={className}
      {...modalProps}
    >
      {children}
    </Modal>
  )
}
