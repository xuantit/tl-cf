import { useQuery } from '@tanstack/react-query'
import { Button } from 'antd'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import PageHeader from '../../components/PageHeader'
import { Dot, Tag } from '../../components/ui'
import { api } from '../../services/api'
import type { DnsRecord, PageRule, ZoneDetail } from '../../types/domain'
import type { DotStatus } from '../../components/ui'
import OverviewTab from './OverviewTab'
import DnsTab from './DnsTab'
import CacheTab from './CacheTab'
import RulesTab from './RulesTab'
import SecurityTab from './SecurityTab'
import TagsTab from './TagsTab'

const TABS = ['overview', 'dns', 'cache', 'rules', 'security', 'tags'] as const
type DetailTab = (typeof TABS)[number]

const STATUS_DOT: Record<string, DotStatus> = {
  active: 'ok',
  pending: 'warn',
  error: 'err',
}

function normalizeTab(raw: string | null): DetailTab {
  if (raw === 'settings') return 'tags' // legacy tab merged into Tags
  return TABS.includes(raw as DetailTab) ? (raw as DetailTab) : 'overview'
}

export default function DomainDetail() {
  const { t } = useTranslation()
  const { zoneId = '' } = useParams<{ zoneId: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = normalizeTab(searchParams.get('tab'))

  const setParams = (updates: Record<string, string | null>) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        for (const [key, value] of Object.entries(updates)) {
          if (value === null) next.delete(key)
          else next.set(key, value)
        }
        return next
      },
      { replace: true },
    )
  }

  const { data: zone } = useQuery<ZoneDetail>({
    queryKey: ['domain', zoneId],
    queryFn: async () => (await api.get(`/domains/${zoneId}`)).data,
    enabled: !!zoneId,
  })

  // Counts for the DNS / Rules tabs — the tabs themselves share these query keys.
  const { data: dnsRecords } = useQuery<DnsRecord[]>({
    queryKey: ['dns', zoneId],
    queryFn: async () => (await api.get(`/domains/${zoneId}/dns`)).data,
    enabled: !!zoneId,
  })
  const { data: pageRules } = useQuery<PageRule[]>({
    queryKey: ['rules', zoneId],
    queryFn: async () => (await api.get(`/domains/${zoneId}/rules`)).data,
    enabled: !!zoneId,
  })

  const zonePlan = zone?.plan ?? null

  const tabs = [
    { key: 'overview', label: t('Overview') },
    { key: 'dns', label: 'DNS', count: dnsRecords?.length },
    { key: 'cache', label: t('Cache') },
    { key: 'rules', label: t('Rules'), count: pageRules?.length },
    { key: 'security', label: t('Security') },
    { key: 'tags', label: t('Tags') },
  ]

  const headerActions =
    activeTab === 'dns' ? (
      <Button type="primary" onClick={() => setParams({ modal: 'dns-add', edit: null })}>
        + {t('DNS record')}
      </Button>
    ) : activeTab === 'cache' ? (
      <Button danger onClick={() => setParams({ modal: 'purge-all' })}>
        ↻ {t('Purge everything')}
      </Button>
    ) : undefined

  return (
    <div className="relative flex min-h-full flex-col">
      <div className="flex-1 p-[clamp(12px,3vw,24px)]">
        <PageHeader
          title={
            <span className="flex flex-wrap items-center gap-[9px]">
              <Link to="/" className="font-mono text-[11px] font-normal text-fg-3 hover:text-fg">
                Domains ›
              </Link>
              <span className="font-mono text-[15.5px]">{zone?.name || '…'}</span>
            </span>
          }
          crumb={
            zone ? (
              <span className="inline-flex flex-wrap items-center gap-1">
                <Tag variant={zone.status === 'active' ? 'ok' : 'warn'}>
                  <span className="inline-flex items-center gap-[5px]">
                    <Dot status={STATUS_DOT[zone.status] || 'off'} /> {zone.status}
                  </span>
                </Tag>
                {zonePlan && <Tag className="capitalize">{zonePlan}</Tag>}
              </span>
            ) : undefined
          }
          actions={headerActions}
          tabs={tabs}
          activeTab={activeTab}
          onTabChange={(tab) =>
            setParams({ tab: tab === 'overview' ? null : tab, modal: null, edit: null, kind: null, sub: null })
          }
        />

        {activeTab === 'overview' && <OverviewTab zoneId={zoneId} zone={zone} />}
        {activeTab === 'dns' && <DnsTab zoneId={zoneId} zoneName={zone?.name} />}
        {activeTab === 'cache' && (
          <CacheTab zoneId={zoneId} zoneName={zone?.name} isEnterprise={zonePlan === 'enterprise'} />
        )}
        {activeTab === 'rules' && <RulesTab zoneId={zoneId} zoneName={zone?.name} />}
        {activeTab === 'security' && <SecurityTab zoneId={zoneId} />}
        {activeTab === 'tags' && <TagsTab zoneId={zoneId} zone={zone} />}
      </div>
    </div>
  )
}
