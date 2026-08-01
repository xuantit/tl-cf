import { Fragment, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, Empty, Form, Input, Modal, Progress, Select, Switch } from 'antd'
import { message } from '../../lib/antdApp'
import { useTranslation } from 'react-i18next'
import { api, apiErrorDetail } from '../../services/api'
import { useJobPolling, type BulkJobItem } from '../../hooks/useJobPolling'
import { Lbl, Tag } from '../ui'

interface PreviewRecord {
  zoneId: string
  recordId: string
  type: string
  name: string
  content: string
  ttl: number
  proxied?: boolean
  priority?: number
}

interface BulkDnsReplaceModalProps {
  open: boolean
  onClose: () => void
  zoneIds: string[]
  zoneNames: Record<string, string>
}

interface ConditionValues {
  recordType?: string
  matchContent?: string
  matchName?: string
  newContent: string
  setProxied?: boolean
}

/** Wizard step header (.steps): 18px circles, done=ok, active=accent. */
function StepsHeader({ current }: { current: number }) {
  const { t } = useTranslation()
  const labels = [t('Select zones'), t('Configure'), t('Preview'), t('Execute')]
  return (
    <div className="mb-4 flex items-center border-0 border-b border-solid border-stroke pb-[11px]">
      {labels.map((label, i) => (
        <Fragment key={label}>
          {i > 0 && <span className="mx-[11px] h-px min-w-[16px] flex-1 bg-stroke" />}
          <span
            className={`flex items-center gap-[7px] font-mono text-[11px] whitespace-nowrap ${
              i < current ? 'text-fg-2' : i === current ? 'text-fg' : 'text-fg-3'
            }`}
          >
            <span
              className={`grid h-[18px] w-[18px] flex-none place-items-center rounded-full border-[1.5px] border-solid text-[10.5px] leading-none ${
                i < current
                  ? 'border-ok bg-ok text-white'
                  : i === current
                    ? 'border-accent bg-accent text-white'
                    : 'border-stroke bg-transparent'
              }`}
            >
              {i < current ? '✓' : i + 1}
            </span>
            <span className="hidden sm:inline">{label}</span>
          </span>
        </Fragment>
      ))}
    </div>
  )
}

const JOB_ITEM_TAG: Record<BulkJobItem['status'], { variant: 'default' | 'ok' | 'err' | 'info'; label: string }> = {
  pending: { variant: 'default', label: 'Waiting' },
  running: { variant: 'info', label: 'Running' },
  success: { variant: 'ok', label: 'Success' },
  error: { variant: 'err', label: 'Error' },
}

/**
 * Bulk DNS find/replace as a 4-step wizard (2.html wizard section).
 * Step 0 (zone selection) happens in the table beforehand and renders as done.
 */
export default function BulkDnsReplaceModal({ open, onClose, zoneIds, zoneNames }: BulkDnsReplaceModalProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [form] = Form.useForm<ConditionValues>()
  const [step, setStep] = useState(1)
  const [matches, setMatches] = useState<PreviewRecord[]>([])
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  const [jobId, setJobId] = useState<string | null>(null)

  const previewMutation = useMutation({
    mutationFn: async (values: ConditionValues) =>
      (
        await api.post('/domains/bulk-dns/preview', {
          zoneIds,
          recordType: values.recordType || undefined,
          matchContent: values.matchContent?.trim() || undefined,
          matchName: values.matchName?.trim() || undefined,
        })
      ).data as { matches: PreviewRecord[]; total: number },
    onSuccess: (data) => {
      setMatches(data.matches)
      setSelectedKeys(new Set(data.matches.map((m) => `${m.zoneId}:${m.recordId}`)))
      setStep(2)
      if (data.total === 0) message.info(t('No matching records found'))
    },
    onError: (error) => message.error(apiErrorDetail(error) || t('Could not preview')),
  })

  const replaceMutation = useMutation({
    mutationFn: async () => {
      const values = form.getFieldsValue(true) as ConditionValues
      const selected = matches.filter((m) => selectedKeys.has(`${m.zoneId}:${m.recordId}`))
      return (
        await api.post('/domains/bulk-dns/replace', {
          records: selected.map((m) => ({
            zoneId: m.zoneId,
            recordId: m.recordId,
            type: m.type,
            name: m.name,
            ttl: m.ttl,
            proxied: m.proxied,
            priority: m.priority,
          })),
          newContent: values.newContent.trim(),
          proxied: values.setProxied,
        })
      ).data as { jobId: string }
    },
    onSuccess: (data) => {
      setJobId(data.jobId)
      setStep(3)
    },
    onError: (error) => message.error(apiErrorDetail(error) || t('Could not apply changes')),
  })

  const { data: job } = useJobPolling(open ? jobId : null)
  const jobDone = job != null && job.status !== 'running'
  const jobPercent = job && job.total > 0 ? Math.round((job.processed / job.total) * 100) : 0

  function reset() {
    form.resetFields()
    setStep(1)
    setMatches([])
    setSelectedKeys(new Set())
    setJobId(null)
  }

  const handleClose = () => {
    if (jobId) queryClient.invalidateQueries({ queryKey: ['domains'] })
    reset()
    onClose()
  }

  const toggleKey = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const newContent = Form.useWatch('newContent', form)
  const affectedZones = new Set(
    matches.filter((m) => selectedKeys.has(`${m.zoneId}:${m.recordId}`)).map((m) => m.zoneId),
  ).size

  return (
    <Modal
      title={t('Bulk DNS replace')}
      open={open}
      onCancel={handleClose}
      footer={null}
      width={640}
      maskClosable={step !== 3}
      destroyOnHidden
    >
      <StepsHeader current={step} />
      <p className="mb-[14px] font-mono text-[10.5px] text-fg-3">
        {t('Applies to {{count}} selected domains.', { count: zoneIds.length })}
      </p>

      {step === 1 && (
        <Form
          form={form}
          layout="vertical"
          initialValues={{ recordType: 'A' }}
          onFinish={(values) => previewMutation.mutate(values)}
        >
          {zoneIds.length === 0 && (
            <Form.Item>
              <Empty description={t('No domains selected — close this dialog and tick domains in the table first.')} />
            </Form.Item>
          )}
          <div className="grid gap-x-3 sm:grid-cols-2">
            <Form.Item label={t('Record type')} name="recordType">
              <Select
                allowClear
                placeholder={t('All')}
                options={['A', 'AAAA', 'CNAME', 'TXT', 'MX'].map((rt) => ({ value: rt, label: rt }))}
              />
            </Form.Item>
            <Form.Item label={t('Filter by record name (optional, partial match)')} name="matchName">
              <Input placeholder="VD: www" />
            </Form.Item>
            <Form.Item label={t('Old content (empty = match all records of the type)')} name="matchContent">
              <Input placeholder="VD: 1.2.3.4" className="font-mono" />
            </Form.Item>
            <Form.Item
              label={t('New content')}
              name="newContent"
              rules={[{ required: true, message: t('Enter new content') }]}
            >
              <Input placeholder="VD: 5.6.7.8" className="font-mono" />
            </Form.Item>
          </div>
          <Form.Item
            label={t('Enable proxy (Cloudflare CDN) for the changed records')}
            name="setProxied"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
          <div className="flex justify-end gap-[7px] border-0 border-t border-solid border-stroke pt-3">
            <Button onClick={handleClose}>{t('Cancel')}</Button>
            <Button
              type="primary"
              htmlType="submit"
              loading={previewMutation.isPending}
              disabled={zoneIds.length === 0}
            >
              {t('Continue')} →
            </Button>
          </div>
        </Form>
      )}

      {step === 2 && (
        <div>
          {matches.length === 0 ? (
            <Empty description={t('No records match the conditions')} />
          ) : (
            <>
              <Lbl className="mb-[7px] block">
                {t('Preview changes')} · {selectedKeys.size}/{matches.length} record
              </Lbl>
              <div className="max-h-[280px] overflow-y-auto rounded-[6px] border border-solid border-stroke font-mono text-[11px]">
                {matches.map((m) => {
                  const key = `${m.zoneId}:${m.recordId}`
                  const on = selectedKeys.has(key)
                  return (
                    <div
                      key={key}
                      role="checkbox"
                      aria-checked={on}
                      aria-label={`${zoneNames[m.zoneId] || m.zoneId} ${m.type} ${m.name}`}
                      tabIndex={0}
                      onClick={() => toggleKey(key)}
                      onKeyDown={(e) => e.key === ' ' && toggleKey(key)}
                      className={`cursor-pointer border-0 border-b border-solid border-stroke-2 last:border-b-0 ${on ? '' : 'opacity-35'}`}
                    >
                      <div className="flex bg-[rgba(229,72,77,.06)] px-[9px] py-[4px]">
                        <span className="w-[14px] flex-none text-danger">−</span>
                        <span className="w-[120px] flex-none truncate pr-2 text-fg-3">
                          {zoneNames[m.zoneId] || m.zoneId}
                        </span>
                        <span className="truncate text-fg-2">
                          {m.type} {m.name} → {m.content}
                        </span>
                      </div>
                      <div className="flex bg-[rgba(18,161,80,.06)] px-[9px] py-[4px]">
                        <span className="w-[14px] flex-none text-ok">+</span>
                        <span className="w-[120px] flex-none pr-2" />
                        <span className="truncate text-fg">
                          {m.type} {m.name} → {newContent || '…'}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
              <p className="mt-2 mb-0 font-mono text-[11.5px] text-fg-3">
                {t('Click a row to include/exclude it.')}
              </p>
            </>
          )}
          <div className="mt-4 flex items-center gap-[7px] border-0 border-t border-solid border-stroke pt-3">
            <Button onClick={() => setStep(1)}>← {t('Back')}</Button>
              <span className="ml-auto font-mono text-[11.5px] text-fg-3">
              {t('{{count}} changes', { count: selectedKeys.size })} ·{' '}
              {t('{{count}} zones', { count: affectedZones })}
            </span>
            <Button onClick={handleClose}>{t('Cancel')}</Button>
            <Button
              type="primary"
              danger
              disabled={selectedKeys.size === 0}
              loading={replaceMutation.isPending}
              onClick={() => replaceMutation.mutate()}
            >
              {t('Execute')} →
            </Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div>
          <Progress
            percent={jobPercent}
            status={jobDone ? (job && job.failed > 0 ? 'exception' : 'success') : 'active'}
          />
          {job && (
            <div className="mt-2 flex items-center gap-[9px] font-mono text-[11.5px]">
              <span>
                {job.processed} / {job.total} record
              </span>
              <Tag variant="ok">{job.succeeded} ok</Tag>
              {job.failed > 0 && <Tag variant="err">{t('{{count}} errors', { count: job.failed })}</Tag>}
            </div>
          )}
          <div className="mt-3 max-h-[240px] overflow-y-auto rounded-[6px] border border-solid border-stroke font-mono text-[11px]">
            {(job?.items || []).map((item) => {
              const cfg = JOB_ITEM_TAG[item.status]
              return (
                <div
                  key={item.key}
                  className="flex items-center gap-2 border-0 border-b border-solid border-stroke-2 px-[9px] py-[5px] last:border-b-0"
                >
                  <span className="min-w-0 flex-1 truncate">{item.label || item.key}</span>
                  {item.error && <span className="max-w-[45%] truncate text-danger">{item.error}</span>}
                  <Tag variant={cfg.variant}>{t(cfg.label)}</Tag>
                </div>
              )
            })}
          </div>
          <div className="mt-4 flex justify-end gap-[7px] border-0 border-t border-solid border-stroke pt-3">
            <Button type={jobDone ? 'primary' : 'default'} onClick={handleClose}>
              {jobDone ? t('Done') : t('Close')}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
