import { useQuery } from '@tanstack/react-query'
import { Button } from 'antd'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../../services/api'
import type { BulkJob } from '../../hooks/useJobPolling'
import BulkProgressModal from '../BulkProgressModal'
import { EmptyState, SkeletonLine, Tag } from '../ui'
import type { TagVariant } from '../ui'
import { CodeChunk, DayHeader, TimelineRow } from './Timeline'
import { groupByDay } from '../../utils/timeline'

const TYPE_LABELS: Record<string, string> = {
  'bulk-purge': 'Bulk purge cache job',
  'bulk-delete': 'Bulk delete domains job',
  'create-zones': 'Bulk create domains job',
  'dns-replace': 'Bulk DNS replace job',
  'apply-template': 'Apply template job',
}

function jobTag(job: BulkJob): { variant: TagVariant; label: string } {
  if (job.status === 'running') return { variant: 'info', label: 'running' }
  if (job.status === 'interrupted') return { variant: 'warn', label: 'interrupted' }
  if (job.failed > 0) return { variant: 'err', label: 'failed' }
  return { variant: 'ok', label: 'ok' }
}

export default function JobsPanel() {
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const jobId = searchParams.get('job')

  const setJobParam = (id: string | null) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (id) next.set('job', id)
        else next.delete('job')
        return next
      },
      { replace: true },
    )
  }

  const { data: jobs = [], isLoading, refetch, isFetching } = useQuery<BulkJob[]>({
    queryKey: ['jobs'],
    queryFn: async () => (await api.get('/jobs')).data,
  })

  const groups = groupByDay(jobs, (job) => job.createdAt)

  return (
    <div>
      <div className="flex justify-end pb-2">
        <Button size="small" type="text" onClick={() => refetch()} loading={isFetching}>
          ↻ {t('Refresh')}
        </Button>
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-[14px] p-4" data-testid="jobs-skeleton">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonLine key={i} width={`${88 - (i % 3) * 12}%`} />
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <EmptyState icon="◷" title={t('No jobs yet')} desc={t('Bulk operations will appear here')} />
      ) : (
        groups.map((group) => (
          <div key={group.date}>
            <DayHeader group={group} />
            {group.items.map((job) => {
              const tag = jobTag(job)
              return (
                <TimelineRow
                  key={job.id}
                  time={job.createdAt}
                  title={
                    <>
                      {t(TYPE_LABELS[job.type] || job.type)} — <CodeChunk>{t('{{count}} items', { count: job.total })}</CodeChunk>
                    </>
                  }
                  meta={t('{{succeeded}} succeeded / {{failed}} failed / {{total}} items', {
                    succeeded: job.succeeded,
                    failed: job.failed,
                    total: job.total,
                  })}
                  right={<Tag variant={tag.variant}>{t(tag.label)}</Tag>}
                  onClick={() => setJobParam(job.id)}
                />
              )
            })}
          </div>
        ))
      )}

      <BulkProgressModal jobId={jobId} open={!!jobId} onClose={() => setJobParam(null)} />
    </div>
  )
}
