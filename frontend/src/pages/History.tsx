import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { api } from '../services/api'
import type { BulkJob } from '../hooks/useJobPolling'
import JobsPanel from '../components/history/JobsPanel'
import ChangesPanel from '../components/history/ChangesPanel'
import PageHeader from '../components/PageHeader'

export default function History() {
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = searchParams.get('tab') === 'changes' ? 'changes' : 'jobs'
  const zoneFilter = searchParams.get('zone') || undefined

  // Subscribe to the panels' caches for the crumb/tab counts without triggering extra fetches.
  const { data: jobs } = useQuery<BulkJob[]>({
    queryKey: ['jobs'],
    queryFn: async () => (await api.get('/jobs')).data,
    enabled: false,
  })
  const { data: changes } = useQuery<{ id: string }[]>({
    queryKey: ['changes', zoneFilter],
    queryFn: async () =>
      (await api.get('/changes', { params: zoneFilter ? { zoneId: zoneFilter } : {} })).data,
    enabled: false,
  })

  const total = (jobs?.length ?? 0) + (changes?.length ?? 0)

  const setTab = (tab: string) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.set('tab', tab)
        // Clear tab-specific params when switching tabs
        next.delete('job')
        next.delete('change')
        return next
      },
      { replace: true },
    )
  }

  return (
    <div className="fade-in p-[clamp(12px,3vw,24px)]">
      <PageHeader
        title={t('History')}
        crumb={jobs || changes ? t('{{count}} operations', { count: total }) : undefined}
        tabs={[
          { key: 'jobs', label: t('Jobs'), count: jobs?.length },
          { key: 'changes', label: t('Changes'), count: changes?.length },
        ]}
        activeTab={activeTab}
        onTabChange={setTab}
      />

      {activeTab === 'jobs' ? <JobsPanel /> : <ChangesPanel />}
    </div>
  )
}
