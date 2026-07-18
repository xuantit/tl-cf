import { Tabs } from 'antd'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import JobsPanel from '../components/history/JobsPanel'
import ChangesPanel from '../components/history/ChangesPanel'
import PageHeader from '../components/PageHeader'

export default function History() {
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = searchParams.get('tab') === 'changes' ? 'changes' : 'jobs'

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
    <div style={{ padding: 'clamp(12px, 3vw, 24px)' }}>
      <PageHeader title={t('History')} description={t('Bulk job results and change history with rollback')} />

      <Tabs
        activeKey={activeTab}
        onChange={setTab}
        items={[
          { key: 'jobs', label: t('Jobs'), children: <JobsPanel /> },
          { key: 'changes', label: t('Changes'), children: <ChangesPanel /> },
        ]}
      />
    </div>
  )
}
