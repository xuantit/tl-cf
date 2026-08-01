import { Modal } from 'antd'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useJobPolling, type BulkJob, type BulkJobItem } from '../hooks/useJobPolling'
import { Banner, Dot, Tag } from './ui'
import type { DotStatus } from './ui'

const ITEM_DOT: Record<BulkJobItem['status'], DotStatus> = {
  pending: 'off',
  running: 'info',
  success: 'ok',
  error: 'err',
}

const TYPE_TITLES: Record<string, string> = {
  'bulk-purge': 'Purging cache in bulk',
  'bulk-delete': 'Deleting domains in bulk',
  'create-zones': 'Creating domains in bulk',
  'dns-replace': 'Replacing DNS in bulk',
  'apply-template': 'Applying template',
}

/** "còn ~14s" estimate from throughput so far; null while it cannot be computed. */
function remainingEstimate(job: BulkJob): string | null {
  if (job.status !== 'running' || job.processed <= 0 || job.total <= job.processed) return null
  const elapsedMs = Date.now() - job.createdAt
  if (elapsedMs <= 0) return null
  const remainingMs = (elapsedMs / job.processed) * (job.total - job.processed)
  const s = Math.max(1, Math.round(remainingMs / 1000))
  return s < 90 ? `~${s}s` : `~${Math.round(s / 60)}m`
}

interface BulkProgressModalProps {
  jobId: string | null
  open: boolean
  onClose: () => void
  title?: string
  /** Render extra content when the job is done (e.g. result table) */
  renderDone?: (job: BulkJob) => ReactNode
}

export default function BulkProgressModal({ jobId, open, onClose, title, renderDone }: BulkProgressModalProps) {
  const { t } = useTranslation()
  const { data: job, isError } = useJobPolling(open ? jobId : null)

  const percent = job && job.total > 0 ? Math.round((job.processed / job.total) * 100) : 0
  const isDone = job != null && job.status !== 'running'
  const resolvedTitle = title || (job && TYPE_TITLES[job.type] && t(TYPE_TITLES[job.type])) || t('Bulk operation progress')
  const eta = job ? remainingEstimate(job) : null

  return (
    <Modal
      title={
        <div>
          <div className="text-[14px] font-semibold">{resolvedTitle}</div>
          {job && (
            <div className="mt-[3px] font-mono text-[11.5px] font-normal text-fg-3">
              {job.type} · {t('{{count}} items', { count: job.total })}
            </div>
          )}
        </div>
      }
      open={open}
      onCancel={onClose}
      footer={null}
      width={520}
      maskClosable={isDone}
      destroyOnHidden
    >
      <div className="flex flex-col gap-[11px] pt-1">
        {isError && (
          <Banner tone="warn" className="rounded-[6px] border border-solid border-stroke">
            {t('The job does not exist or you do not have permission to view it. Check older jobs in the Jobs history page.')}
          </Banner>
        )}
        {job?.status === 'interrupted' && (
          <Banner tone="warn" className="rounded-[6px] border border-solid border-stroke">
            {t('The server restarted while the job was running. Unprocessed items will not continue — review and re-run if needed.')}
          </Banner>
        )}

        {job && (
          <>
            <div className="flex items-center gap-[9px]">
              <span className="font-mono text-[12.5px] text-fg">
                {job.processed} / {job.total}
              </span>
              {job.succeeded > 0 && <Tag variant="ok">{job.succeeded} ok</Tag>}
              {job.failed > 0 && <Tag variant="err">{t('{{count}} errors', { count: job.failed })}</Tag>}
              <span className="ml-auto font-mono text-[11.5px] text-fg-3">
                {isDone
                  ? job.status === 'interrupted'
                    ? t('interrupted')
                    : t('done')
                  : eta
                    ? t('{{eta}} left', { eta })
                    : ''}
              </span>
            </div>
            <div
              className="h-[4px] overflow-hidden rounded-full bg-stroke"
              role="progressbar"
              aria-valuenow={percent}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-full rounded-full bg-accent transition-[width]"
                style={{ width: `${percent}%` }}
              />
            </div>

            <div className="max-h-[184px] overflow-auto rounded-[6px] border border-solid border-stroke">
              {job.items.map((item) => (
                <div
                  key={item.key}
                  className={`flex items-center gap-2 border-0 border-b border-solid border-stroke-2 px-[10px] py-[6px] font-mono text-[12px] last:border-b-0 ${
                    item.status === 'error'
                      ? 'bg-[rgba(229,72,77,.05)]'
                      : item.status === 'running'
                        ? 'bg-bg-side'
                        : ''
                  }`}
                >
                  <Dot status={ITEM_DOT[item.status]} />
                  <span className="truncate text-fg">{item.label || item.key}</span>
                  {item.status === 'error' && item.error && (
                    <span className="ml-[6px] min-w-0 flex-1 truncate text-danger" title={item.error}>
                      {item.error}
                    </span>
                  )}
                  <span className="ml-auto flex-none pl-2 text-fg-3">
                    {item.status === 'running'
                      ? t('processing…')
                      : item.status === 'pending'
                        ? t('waiting')
                        : ''}
                  </span>
                </div>
              ))}
              {job.items.length === 0 && (
                <div className="px-[10px] py-[9px] font-mono text-[11px] text-fg-3">…</div>
              )}
            </div>
          </>
        )}
        {isDone && job && renderDone?.(job)}
      </div>
    </Modal>
  )
}
