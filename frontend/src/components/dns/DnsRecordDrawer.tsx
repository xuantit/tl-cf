import { useState } from 'react'
import { Button, Drawer, Grid, Input, Select, Switch } from 'antd'
import { useTranslation } from 'react-i18next'
import { Lbl } from '../ui'
import type { DnsRecord, DnsRecordInput } from '../../types/domain'

export const DNS_RECORD_TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SRV', 'CAA'] as const
const PROXYABLE_TYPES = new Set(['A', 'AAAA', 'CNAME'])
const PRIORITY_TYPES = new Set(['MX', 'SRV'])

export interface DnsRecordDrawerProps {
  open: boolean
  zoneName?: string
  /** When set the drawer edits this record; otherwise it creates a new one. */
  initialValues?: DnsRecord | null
  saving?: boolean
  /** Resolves when the record is saved; `again` keeps the drawer open for the next record. */
  onSubmit: (values: DnsRecordInput, again: boolean) => Promise<unknown>
  onClose: () => void
  /** Hiện nút Xoá ở footer khi đang sửa bản ghi (design panel). */
  onDelete?: () => void
}

/** Content-field label per record type (.drw mockup). */
function contentLabel(type: string, t: (key: string) => string): string {
  switch (type) {
    case 'A':
      return t('IPv4 address')
    case 'AAAA':
      return t('IPv6 address')
    case 'CNAME':
      return t('Target')
    case 'MX':
      return t('Mail server')
    case 'NS':
      return t('Nameserver')
    default:
      return t('Content')
  }
}

/**
 * DNS record create/edit drawer (420px right on desktop, ~85% bottom sheet on
 * mobile) with type chips, TTL/proxy coupling and a live zone-file preview.
 */
export default function DnsRecordDrawer({
  open,
  zoneName,
  initialValues,
  saving,
  onSubmit,
  onClose,
}: DnsRecordDrawerProps) {
  const { t } = useTranslation()
  const screens = Grid.useBreakpoint()
  const mobile = !screens.lg

  return (
    <Drawer
      open={open}
      onClose={onClose}
      placement={mobile ? 'bottom' : 'right'}
      width={420}
      height="85%"
      title={
        <span className="flex items-center gap-[8px]">
          <span className="text-[14px] font-semibold">
            {initialValues ? t('Edit DNS record') : t('Add DNS record')}
          </span>
          {zoneName && (
            <span className="rounded-[4px] border border-stroke-2 bg-bg-hover px-[6px] py-[3.5px] font-mono text-[11.5px] leading-none text-fg-2">
              {zoneName}
            </span>
          )}
        </span>
      }
      styles={{ body: { padding: 0 } }}
      destroyOnHidden
    >
      {open && (
        <DrawerBody
          key={initialValues?.id ?? 'new'}
          zoneName={zoneName}
          initialValues={initialValues}
          saving={saving}
          onSubmit={onSubmit}
          onClose={onClose}
        />
      )}
    </Drawer>
  )
}

/**
 * Form tạo/sửa bản ghi DNS — dùng được cả trong Drawer (mobile) lẫn DetailPanel
 * (panel trượt bên phải theo design mới). Có footer riêng nên container không
 * cần padding.
 */
export function DnsRecordForm({
  zoneName,
  initialValues,
  saving,
  onSubmit,
  onClose,
  onDelete,
}: Omit<DnsRecordDrawerProps, 'open'>) {
  return (
    <DrawerBody
      key={initialValues?.id ?? 'new'}
      zoneName={zoneName}
      initialValues={initialValues}
      saving={saving}
      onSubmit={onSubmit}
      onClose={onClose}
      onDelete={onDelete}
    />
  )
}

function DrawerBody({
  zoneName,
  initialValues,
  saving,
  onSubmit,
  onClose,
  onDelete,
}: Omit<DnsRecordDrawerProps, 'open'>) {  const { t } = useTranslation()
  const [type, setType] = useState(initialValues?.type ?? 'A')
  const [name, setName] = useState(initialValues?.name ?? '')
  const [content, setContent] = useState(initialValues?.content ?? '')
  const [ttl, setTtl] = useState(initialValues?.ttl ?? 1)
  const [proxied, setProxied] = useState(initialValues?.proxied ?? PROXYABLE_TYPES.has(initialValues?.type ?? 'A'))
  const [priority, setPriority] = useState(initialValues?.priority?.toString() ?? '')
  const [error, setError] = useState<string | null>(null)

  const canProxy = PROXYABLE_TYPES.has(type)
  const hasPriority = PRIORITY_TYPES.has(type)
  const effectiveProxied = canProxy && proxied

  // Strip the zone suffix when editing (backend returns FQDNs).
  const shortName =
    zoneName && name.endsWith(`.${zoneName}`)
      ? name.slice(0, -zoneName.length - 1)
      : zoneName && name === zoneName
        ? '@'
        : name

  const fqdn = !shortName || shortName === '@' ? `${zoneName ?? ''}` : `${shortName}.${zoneName ?? ''}`
  const previewTtl = effectiveProxied || ttl === 1 ? 'auto' : String(ttl)

  const buildPayload = (): DnsRecordInput => ({
    type,
    name: shortName || '@',
    content: content.trim(),
    ttl: effectiveProxied ? 1 : ttl,
    ...(canProxy ? { proxied: effectiveProxied } : {}),
    ...(hasPriority && priority !== '' ? { priority: Number(priority) } : {}),
  })

  const submit = async (again: boolean) => {
    if (!content.trim()) {
      setError(t('Content is required'))
      return
    }
    setError(null)
    try {
      await onSubmit(buildPayload(), again)
      if (again) {
        setName('')
        setContent('')
        setPriority('')
      }
    } catch {
      // Errors surface via the caller's mutation onError toast.
    }
  }

  const selectType = (next: string) => {
    setType(next)
    if (!PROXYABLE_TYPES.has(next)) setProxied(false)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-auto px-4 py-[14px]">
        {/* Type chips */}
        <Lbl className="mb-[5px] block">{t('Record type')}</Lbl>
        <div className="mb-[11px] flex flex-wrap gap-[5px]">
          {DNS_RECORD_TYPES.map((rt) => {
            const on = rt === type
            return (
              <button
                key={rt}
                type="button"
                onClick={() => selectType(rt)}
                className={`cursor-pointer rounded-[4px] border border-solid px-[9px] py-[6px] font-mono text-[11.5px] leading-none transition-colors ${
                  on
                    ? 'border-transparent bg-accent-soft text-accent'
                    : 'border-stroke-2 bg-bg-hover text-fg-2 hover:text-fg'
                }`}
              >
                {rt}
              </button>
            )
          })}
        </div>

        {/* Name */}
        <Lbl className="mb-[5px] block">{t('Name')}</Lbl>
        <Input value={shortName} onChange={(e) => setName(e.target.value)} placeholder="@" autoFocus />
        <div className="mt-1 mb-[11px] font-mono text-[11px] text-fg-3">
          → <span className="text-fg-2">{fqdn || '…'}</span> · {t('use @ for root')}
        </div>

        {/* Content */}
        <Lbl className="mb-[5px] block">{contentLabel(type, t)}</Lbl>
        <Input
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={type === 'A' ? '203.0.113.10' : type === 'AAAA' ? '2606:4700::1' : ''}
          status={error ? 'error' : undefined}
        />
        {error && <div className="mt-1 font-mono text-[11px] text-danger">{error}</div>}

        <div className="mt-[11px] flex gap-[9px]">
          {/* TTL */}
          <div className="flex-1">
            <Lbl className="mb-[5px] block">TTL</Lbl>
            <Select
              className="w-full"
              value={effectiveProxied ? 1 : ttl}
              disabled={effectiveProxied}
              onChange={setTtl}
              options={[
                { value: 1, label: t('Auto') },
                { value: 60, label: '1 min' },
                { value: 300, label: '5 min' },
                { value: 3600, label: '1 hour' },
                { value: 86400, label: '1 day' },
              ]}
            />
            {effectiveProxied && (
              <div className="mt-1 font-mono text-[11px] text-fg-3">{t('Locked while proxied')}</div>
            )}
          </div>
          {/* Proxy / Priority */}
          {hasPriority ? (
            <div className="flex-1">
              <Lbl className="mb-[5px] block">{t('Priority')}</Lbl>
              <Input
                type="number"
                min={0}
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                placeholder="10"
                aria-label={t('Priority')}
              />
            </div>
          ) : (
            <div className="flex-1">
              <Lbl className="mb-[5px] block">{t('Proxy status')}</Lbl>
              <div className="flex h-8 items-center justify-between rounded-[6px] border border-solid border-stroke px-[9px]">
                <span className={`font-mono text-[12px] ${effectiveProxied ? 'text-accent' : 'text-fg-3'}`}>
                  {effectiveProxied ? t('Proxied') : t('DNS only')}
                </span>
                <Switch
                  size="small"
                  checked={effectiveProxied}
                  disabled={!canProxy}
                  onChange={setProxied}
                  aria-label={t('Proxy status')}
                />
              </div>
              <div className="mt-1 font-mono text-[11px] text-fg-3">
                {t('Hides the origin IP, enables CDN & WAF')}
              </div>
            </div>
          )}
        </div>

        <div className="my-4 border-t border-stroke" />

        {/* Live zone-file preview (.code) */}
        <Lbl className="mb-2 block">{t('Preview')}</Lbl>
        <div
          data-testid="dns-preview"
          className="overflow-auto rounded-[6px] border border-solid border-stroke bg-bg-side px-[11px] py-[10px] font-mono text-[11px] leading-[1.75] whitespace-nowrap text-fg-2"
        >
          {fqdn || '…'}.{'  '}
          <span className="text-fg-3">{previewTtl}</span>
          {'  '}IN{'  '}
          <span className="text-info">{type}</span>
          {'  '}
          {hasPriority && priority !== '' && <span className="text-fg-3">{priority} </span>}
          <span className="text-ok">{content || '…'}</span>
          {effectiveProxied && <span className="text-fg-3">{'  '}; proxied</span>}
        </div>
      </div>

      {/* Footer */}
      <div className="flex gap-[7px] border-t border-stroke bg-bg-side px-4 py-[11px]">
        {initialValues && onDelete && (
          <Button danger onClick={onDelete}>
            {t('Delete')}
          </Button>
        )}
        <Button type="primary" className="flex-1" loading={saving} onClick={() => submit(false)}>
          {t('Save record')}
        </Button>
        {!initialValues && (
          <Button loading={saving} onClick={() => submit(true)}>
            {t('Save & add another')}
          </Button>
        )}
        <Button type="text" onClick={onClose}>
          {t('Cancel')}
        </Button>
      </div>
    </div>
  )
}
