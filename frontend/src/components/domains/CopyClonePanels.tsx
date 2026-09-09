import { useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Button, Checkbox, Input, Radio, Select } from 'antd'
import { message } from '../../lib/antdApp'
import { useTranslation } from 'react-i18next'
import { api, apiErrorDetail } from '../../services/api'
import type { Zone } from '../../types/domain'
import { DetailPanel, Tag } from '../ui'

type ZoneConfigComponent = 'dns' | 'settings' | 'rules' | 'securityRules' | 'pageRules'

const ALL_COMPONENTS: ZoneConfigComponent[] = ['dns', 'settings', 'rules', 'securityRules', 'pageRules']

const COMPONENT_LABELS: Record<ZoneConfigComponent, string> = {
  dns: 'DNS records',
  settings: 'Zone settings',
  rules: 'Rules',
  securityRules: 'Security rules (WAF)',
  pageRules: 'Page Rules',
}

const DOMAIN_REGEX = /^([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/
const MAX_CLONE_DOMAINS = 50
const MAX_TARGET_PREVIEW = 6

const LABEL_CLASS = 'mb-1.5 block font-mono text-[11px] tracking-[.08em] text-fg-3 uppercase'

/** Shared "which components + DNS conflict mode" fields for copy-config and clone. */
function ComponentsFields({
  components,
  onComponentsChange,
  dnsMode,
  onDnsModeChange,
}: {
  components: ZoneConfigComponent[]
  onComponentsChange: (components: ZoneConfigComponent[]) => void
  dnsMode: 'skip' | 'overwrite'
  onDnsModeChange: (mode: 'skip' | 'overwrite') => void
}) {
  const { t } = useTranslation()
  const toggle = (key: ZoneConfigComponent, checked: boolean) =>
    // Keep the canonical order so the request body is deterministic
    onComponentsChange(ALL_COMPONENTS.filter((c) => (c === key ? checked : components.includes(c))))
  return (
    <>
      <label className={LABEL_CLASS}>{t('Components to copy')}</label>
      <div className="mb-3 flex flex-col gap-1">
        {ALL_COMPONENTS.map((key) => (
          <Checkbox
            key={key}
            checked={components.includes(key)}
            onChange={(e) => toggle(key, e.target.checked)}
          >
            {t(COMPONENT_LABELS[key])}
          </Checkbox>
        ))}
      </div>
      <label className={LABEL_CLASS}>{t('Existing DNS records')}</label>
      <Radio.Group
        value={dnsMode}
        onChange={(e) => onDnsModeChange(e.target.value)}
        disabled={!components.includes('dns')}
        options={[
          { value: 'skip', label: t('Skip') },
          { value: 'overwrite', label: t('Overwrite') },
        ]}
      />
    </>
  )
}

interface CopyConfigPanelProps {
  open: boolean
  zones: Zone[]
  /** Nguồn chọn sẵn khi mở từ nút Copy trên dòng (null = user tự chọn). */
  initialSourceZoneId?: string | null
  /** Đích khởi tạo (selection từ bảng khi mở từ bulk bar). */
  initialTargetIds: string[]
  onClose: () => void
  onJobCreated: (jobId: string) => void
}

/** Copy one zone's config onto other zones — mở từ bulk bar (đích chọn sẵn) hoặc nút Copy trên dòng (nguồn chọn sẵn). */
export function CopyConfigPanel({
  open,
  zones,
  initialSourceZoneId = null,
  initialTargetIds,
  onClose,
  onJobCreated,
}: CopyConfigPanelProps) {
  const { t } = useTranslation()
  const [sourceZoneId, setSourceZoneId] = useState<string | null>(null)
  const [targetIds, setTargetIds] = useState<string[]>([])
  const [components, setComponents] = useState<ZoneConfigComponent[]>(ALL_COMPONENTS)
  const [dnsMode, setDnsMode] = useState<'skip' | 'overwrite'>('skip')

  // Panel children luôn mounted — nạp lại props khi panel chuyển đóng→mở (render-time sync, không dùng effect)
  const [lastOpen, setLastOpen] = useState(false)
  if (open !== lastOpen) {
    setLastOpen(open)
    if (open) {
      setSourceZoneId(initialSourceZoneId)
      setTargetIds(initialTargetIds.filter((id) => id !== initialSourceZoneId))
      setComponents(ALL_COMPONENTS)
      setDnsMode('skip')
    }
  }

  const source = zones.find((z) => z.id === sourceZoneId)
  const targets = zones.filter((z) => targetIds.includes(z.id) && z.id !== sourceZoneId)

  const reset = () => {
    setSourceZoneId(null)
    setTargetIds([])
    setComponents(ALL_COMPONENTS)
    setDnsMode('skip')
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const copyMutation = useMutation({
    mutationFn: async () =>
      (
        await api.post('/domains/copy-config', {
          sourceZoneId: source!.id,
          sourceZoneName: source!.name,
          targets: targets.map((z) => ({ zoneId: z.id, zoneName: z.name })),
          components,
          dnsMode,
        })
      ).data as { jobId: string },
    onSuccess: (data) => {
      reset()
      onJobCreated(data.jobId)
    },
    onError: (error) => message.error(apiErrorDetail(error) || t('Could not copy config')),
  })

  return (
    <DetailPanel
      open={open}
      title={t('Copy config')}
      onClose={handleClose}
      footer={
        <span className="ml-auto flex gap-2">
          <Button onClick={handleClose}>{t('Cancel')}</Button>
          <Button
            type="primary"
            disabled={!source || targets.length === 0 || components.length === 0}
            loading={copyMutation.isPending}
            onClick={() => copyMutation.mutate()}
          >
            {t('Copy to {{count}} domains', { count: targets.length })}
          </Button>
        </span>
      }
    >
      {/* Panel children luôn mounted — chỉ render body khi mở để tránh Select multiple đo layout liên tục khi ẩn */}
      {open && (
        <>
          <div className="mb-3" data-testid="copy-source">
            <label className={LABEL_CLASS}>{t('Source domain')}</label>
            <Select
              style={{ width: '100%' }}
              showSearch
              optionFilterProp="label"
              placeholder={t('Select source domain')}
              value={sourceZoneId ?? undefined}
              onChange={setSourceZoneId}
              options={zones.map((z) => ({ value: z.id, label: z.name }))}
            />
          </div>

          <div className="mb-3">
            <label className={LABEL_CLASS}>
              {t('Target domains')} · {targets.length}
            </label>
            <Select
              mode="multiple"
              style={{ width: '100%' }}
              showSearch
              optionFilterProp="label"
              placeholder={t('Select target domains')}
              aria-label={t('Target domains')}
              value={targets.map((z) => z.id)}
              onChange={(ids: string[]) => setTargetIds(ids)}
              options={zones
                .filter((z) => z.id !== sourceZoneId)
                .map((z) => ({ value: z.id, label: z.name }))}
              maxTagCount={MAX_TARGET_PREVIEW}
            />
            {targets.length === 0 && (
              <div className="mt-1 font-mono text-[11px] text-fg-3">
                {t('Pick at least one target domain')}
              </div>
            )}
          </div>

          <ComponentsFields
            components={components}
            onComponentsChange={setComponents}
            dnsMode={dnsMode}
            onDnsModeChange={setDnsMode}
          />

          <p className="mt-3 mb-0 font-mono text-[11px] text-fg-3">
            {t(
              "Rules and Page Rules are added on top of the target's existing ones — copying twice creates duplicates.",
            )}
          </p>
        </>
      )}
    </DetailPanel>
  )
}

type CloneLineStatus = 'valid' | 'invalid' | 'duplicate'

interface CloneLine {
  raw: string
  name: string
  status: CloneLineStatus
}

function parseCloneLines(raw: string): CloneLine[] {
  const seen = new Set<string>()
  return raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const name = line.toLowerCase()
      let status: CloneLineStatus
      if (!DOMAIN_REGEX.test(line)) status = 'invalid'
      else if (seen.has(name)) status = 'duplicate'
      else status = 'valid'
      seen.add(name)
      return { raw: line, name, status }
    })
}

export interface CloneSource {
  zoneId: string
  zoneName: string
}

interface CloneDomainPanelProps {
  source: CloneSource | null
  onClose: () => void
  onJobCreated: (jobId: string) => void
}

/** Row action: create new zones as copies of an existing zone (push DetailPanel). */
export function CloneDomainPanel({ source, onClose, onJobCreated }: CloneDomainPanelProps) {
  const { t } = useTranslation()
  const [raw, setRaw] = useState('')
  const [components, setComponents] = useState<ZoneConfigComponent[]>(ALL_COMPONENTS)
  const [dnsMode, setDnsMode] = useState<'skip' | 'overwrite'>('skip')

  const lines = useMemo(() => parseCloneLines(raw), [raw])
  const validNames = useMemo(
    () => [...new Set(lines.filter((l) => l.status === 'valid').map((l) => l.name))],
    [lines],
  )
  const errorCount = lines.filter((l) => l.status === 'invalid').length
  const overLimit = validNames.length > MAX_CLONE_DOMAINS

  const reset = () => {
    setRaw('')
    setComponents(ALL_COMPONENTS)
    setDnsMode('skip')
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const cloneMutation = useMutation({
    mutationFn: async () =>
      (
        await api.post('/domains/clone', {
          sourceZoneId: source!.zoneId,
          sourceZoneName: source!.zoneName,
          newDomains: validNames,
          components,
          dnsMode,
        })
      ).data as { jobId: string },
    onSuccess: (data) => {
      reset()
      onJobCreated(data.jobId)
    },
    onError: (error) => message.error(apiErrorDetail(error) || t('Could not clone domain')),
  })

  return (
    <DetailPanel
      open={!!source}
      title={t('Clone domain')}
      onClose={handleClose}
      footer={
        <span className="ml-auto flex gap-2">
          <Button onClick={handleClose}>{t('Cancel')}</Button>
          <Button
            type="primary"
            disabled={validNames.length === 0 || overLimit || components.length === 0}
            loading={cloneMutation.isPending}
            onClick={() => cloneMutation.mutate()}
          >
            {t('Clone to {{count}} domains', { count: validNames.length })}
          </Button>
        </span>
      }
    >
      <div className="mb-3">
        <label className={LABEL_CLASS}>{t('Source domain')}</label>
        <div className="font-mono text-[12.5px] font-medium text-fg">{source?.zoneName}</div>
      </div>

      <label className={LABEL_CLASS}>{t('New domains')}</label>
      <Input.TextArea
        rows={5}
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        placeholder={'newshop.com\nnewshop.net'}
        className="font-mono"
      />
      <div className="mt-1.5 mb-3 font-mono text-[11.5px] text-fg-3">
        {t('One domain per line · max 50')}
        {lines.length > 0 && (
          <>
            {' '}
            · <span className="text-ok">{t('{{count}} valid', { count: validNames.length })}</span>
            {errorCount > 0 && (
              <>
                {' '}
                · <span className="text-danger">{t('{{count}} errors', { count: errorCount })}</span>
              </>
            )}
            {overLimit && (
              <>
                {' '}
                · <span className="text-danger">{t('Max 50 domains')}</span>
              </>
            )}
          </>
        )}
      </div>
      {lines.some((l) => l.status !== 'valid') && (
        <div className="mb-3 max-h-[110px] overflow-y-auto rounded-[6px] border border-solid border-stroke">
          {lines.map(
            (line, i) =>
              line.status !== 'valid' && (
                <div
                  key={`${line.raw}-${i}`}
                  className="flex items-center gap-1.5 border-0 border-b border-solid border-stroke-2 px-[9px] py-[5px] font-mono text-[11.5px] text-danger last:border-b-0"
                >
                  <span className="min-w-0 truncate">{line.raw}</span>
                  <Tag variant={line.status === 'invalid' ? 'err' : 'warn'}>{t(line.status)}</Tag>
                </div>
              ),
          )}
        </div>
      )}

      <ComponentsFields
        components={components}
        onComponentsChange={setComponents}
        dnsMode={dnsMode}
        onDnsModeChange={setDnsMode}
      />
    </DetailPanel>
  )
}
