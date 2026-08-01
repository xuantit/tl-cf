import { Button } from 'antd'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api, apiErrorCode, apiErrorDetail } from '../services/api'
import { useAccountStore } from '../stores/useAccountStore'
import type { CfAccount } from '../components/AccountSwitcher'
import type { AnalyticsSummary, DashboardSummary } from '../types/analytics'
import PageHeader from '../components/PageHeader'
import MetricsChart from '../components/monitoring/MetricsChart'
import { Banner, Dot, EmptyState, KvRow, Lbl, SectionHeader, SkeletonLine, Tag } from '../components/ui'
import { formatCompact, formatPercent, formatShare } from '../utils/format'

const CHANGE_STATUS_VARIANT: Record<string, 'ok' | 'err' | 'warn'> = {
  applied: 'ok',
  done: 'ok',
  ok: 'ok',
  failed: 'err',
  error: 'err',
  rolled_back: 'warn',
}

function formatChangeTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  const today = new Date()
  if (d.toDateString() === today.toDateString()) return hm
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${hm}`
}

/** Overview dashboard (route /overview) — 2.html "overview" view. */
export default function Overview() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const activeAccountId = useAccountStore((s) => s.activeAccountId)

  const { data: accounts, isLoading: accountsLoading } = useQuery<CfAccount[]>({
    queryKey: ['cf-accounts'],
    queryFn: async () => (await api.get('/cf/accounts')).data,
    staleTime: 60_000,
  })
  const noAccounts = !accountsLoading && (accounts?.length ?? 0) === 0

  const {
    data: summary,
    isLoading,
    isError,
    error: summaryError,
    refetch,
    isFetching,
  } = useQuery<DashboardSummary>({
    queryKey: ['dashboard-summary', activeAccountId],
    queryFn: async () => (await api.get('/dashboard/summary')).data,
    enabled: !noAccounts,
  })

  const analytics = useQuery<AnalyticsSummary>({
    queryKey: ['analytics-summary', activeAccountId, '24h'],
    queryFn: async () => (await api.get('/analytics/summary', { params: { range: '24h' } })).data,
    enabled: !noAccounts,
    retry: false,
  })
  const analyticsPermissionMissing =
    analytics.isError && apiErrorCode(analytics.error) === 'ANALYTICS_PERMISSION_MISSING'

  const account = accounts?.find((a) => a.id === activeAccountId)
  const accountLabel = account?.label || account?.email

  if (noAccounts) {
    return (
      <div className="fade-in p-[clamp(12px,3vw,24px)]">
        <PageHeader title={t('Overview')} />
        <EmptyState
          icon="⌂"
          title={t('No Cloudflare account connected yet')}
          desc={t('Connect an API token to start managing domains')}
          actions={
            <Button type="primary" size="small" onClick={() => navigate('/accounts')}>
              + {t('Connect API Token')}
            </Button>
          }
        />
      </div>
    )
  }

  const zones = summary?.zones
  const attention = summary?.attention
  const showAttentionBanner = !!attention && (attention.sslOff > 0 || attention.pendingNs > 0)

  const planDistribution = summary?.planDistribution?.filter((p) => p.count > 0) ?? []
  const showPlanPane = planDistribution.length > 0

  return (
    <div className="fade-in p-[clamp(12px,3vw,24px)]">
      <PageHeader
        title={t('Overview')}
        crumb={accountLabel}
        actions={
          <>
            <Button
              loading={isFetching && !isLoading}
              onClick={() => {
                refetch()
                analytics.refetch()
                queryClient.invalidateQueries({ queryKey: ['domains'] })
              }}
            >
              ↻ {t('Refresh')}
            </Button>
            <Button type="primary" onClick={() => navigate('/?modal=add')}>
              + {t('Add domain')}
            </Button>
          </>
        }
      />

      {isError && (
        <Banner
          tone="err"
          actions={
            <Button size="small" onClick={() => refetch()}>
              ↻ {t('Retry')}
            </Button>
          }
        >
          {apiErrorDetail(summaryError) || t('Could not load the dashboard summary')}
        </Banner>
      )}

      {showAttentionBanner && attention && (
        <Banner
          tone="warn"
          actions={
            <Button size="small" onClick={() => navigate(attention.pendingNs > 0 ? '/?tab=pending' : '/')}>
              {t('View list')}
            </Button>
          }
        >
          {t('{{ssl}} zones have SSL off and {{nsCount}} zones have nameserver issues.', {
            ssl: attention.sslOff,
            nsCount: attention.pendingNs,
          })}
        </Banner>
      )}

      {isLoading ? (
        <div className="flex flex-col gap-[14px] p-4" data-testid="overview-skeleton">
          {Array.from({ length: 8 }).map((_, i) => (
            <SkeletonLine key={i} width={`${90 - (i % 4) * 12}%`} />
          ))}
        </div>
      ) : summary && zones ? (
        <>
          {/* Stat strip — mirrors StatStrip markup with clickable cells */}
          <div className="flex flex-wrap border-b border-stroke">
            {[
              { value: zones.total, label: t('total zones'), to: '/' },
              {
                value: zones.active,
                label: 'active',
                delta: zones.total > 0 ? `${formatPercent(zones.active / zones.total)}%` : undefined,
                deltaTone: 'text-fg-3',
                to: '/?tab=active',
              },
              { value: zones.pending, label: 'pending', to: '/?tab=pending' },
              {
                value: summary.jobs7d.total,
                label: t('ops 7d'),
                delta:
                  summary.jobs7d.failed > 0
                    ? t('{{count}} failed', { count: summary.jobs7d.failed })
                    : undefined,
                deltaTone: 'text-danger',
                to: '/history',
              },
            ].map((item, i) => (
              <button
                key={i}
                type="button"
                onClick={() => navigate(item.to)}
                className="flex-1 cursor-pointer border-0 border-r border-solid border-stroke bg-transparent p-[10px_16px] text-left transition-colors last:border-r-0 hover:bg-bg-hover"
              >
                <div className="font-mono text-[19px] font-semibold leading-[1.15] tracking-[-.02em] text-fg">
                  {item.value}
                </div>
                <div className="mt-[2px] font-mono text-[11px] uppercase tracking-[.09em] text-fg-3">
                  {item.label}
                </div>
                {item.delta != null && (
                  <div className={`mt-[3px] font-mono text-[11px] ${item.deltaTone}`}>{item.delta}</div>
                )}
              </button>
            ))}
          </div>

          {/* grid-3 panes */}
          <div className="grid grid-cols-1 border-b border-stroke md:grid-cols-3">
            {showPlanPane && (
              <div className="border-b border-stroke p-[13px_16px] md:border-b-0">
                <Lbl className="mb-[9px] block">{t('Plan distribution')}</Lbl>
                {planDistribution.map((p) => (
                  <KvRow
                    key={p.plan}
                    k={<span className="capitalize">{p.plan}</span>}
                    v={
                      <>
                        {p.count} <Tag>{formatShare(p.count, zones.total)}</Tag>
                      </>
                    }
                  />
                ))}
              </div>
            )}
            <div className="border-b border-stroke p-[13px_16px] md:border-b-0 md:border-l md:border-solid md:border-l-stroke md:first:border-l-0">
              <Lbl className="mb-[9px] block">{t('Needs attention')}</Lbl>
              <KvRow
                k={
                  <span className="flex items-center gap-[6px]">
                    <Dot status="err" /> {t('Nameservers not pointed')}
                  </span>
                }
                v={
                  <Link to="/?tab=pending" className="!text-danger">
                    {attention?.pendingNs ?? 0} →
                  </Link>
                }
              />
              <KvRow
                k={
                  <span className="flex items-center gap-[6px]">
                    <Dot status="warn" /> SSL off
                  </span>
                }
                v={
                  <Link to="/" className="!text-warn">
                    {attention?.sslOff ?? 0} →
                  </Link>
                }
              />
              {(attention?.devMode ?? 0) > 0 && (
                <KvRow
                  k={
                    <span className="flex items-center gap-[6px]">
                      <Dot status="info" /> {t('Dev mode enabled')}
                    </span>
                  }
                  v={<span className="text-info">{attention?.devMode}</span>}
                />
              )}
            </div>
            <div className="p-[13px_16px] md:border-l md:border-solid md:border-l-stroke">
              <Lbl className="mb-[9px] block">{t('CF accounts')}</Lbl>
              {summary.accounts.map((acc) => (
                <KvRow
                  key={acc.id}
                  k={
                    <span className="flex min-w-0 items-center gap-[6px]">
                      <Dot status={acc.isActive ? 'ok' : 'off'} />
                      <span className="truncate">{acc.label}</span>
                    </span>
                  }
                  v={t('{{count}} zones', { count: acc.domainCount })}
                />
              ))}
              {summary.accounts.length === 0 && (
                <div className="py-2 font-mono text-[11px] text-fg-3">—</div>
              )}
            </div>
          </div>

          {/* Requests 24h */}
          <SectionHeader
            title={t('Requests 24h · all zones')}
            actions={
              analytics.data ? (
                <>
                  <Tag>{formatCompact(analytics.data.totals.requests)}</Tag>
                  <Tag variant="ok">hit {formatPercent(analytics.data.totals.cacheHitRatio)}%</Tag>
                </>
              ) : undefined
            }
          />
          {analyticsPermissionMissing ? (
            <Banner tone="info">
              {t('The API token is missing the Zone → Analytics → Read permission, so charts are unavailable.')}
            </Banner>
          ) : analytics.isError ? (
            <Banner tone="warn">
              {apiErrorDetail(analytics.error) || t('Could not load analytics data')}
            </Banner>
          ) : analytics.isLoading ? (
            <div className="flex flex-col gap-[14px] p-4">
              <SkeletonLine width="100%" />
              <SkeletonLine width="82%" />
              <SkeletonLine width="64%" />
            </div>
          ) : (
            <div className="py-[14px]">
              <MetricsChart series={analytics.data?.series ?? []} range="24h" height={150} />
            </div>
          )}

          {/* Recent activity */}
          <SectionHeader
            title={t('Recent activity')}
            actions={
              <Link to="/history" className="font-mono text-[11px] !text-fg-2 hover:!text-fg">
                {t('view all')} →
              </Link>
            }
          />
          {summary.recentChanges.length === 0 ? (
            <EmptyState icon="◷" title={t('No recent changes')} desc={t('Bulk operations and DNS edits will appear here')} />
          ) : (
            <table className="w-full border-collapse">
              <tbody>
                {summary.recentChanges.map((change) => (
                  <tr
                    key={change.id}
                    onClick={() => navigate('/history')}
                    className="cursor-pointer border-0 border-b border-solid border-stroke-2 transition-colors hover:bg-bg-hover"
                  >
                    <td className="h-[29px] w-[110px] pl-4 font-mono text-[12.5px] whitespace-nowrap text-fg-3">
                      {formatChangeTime(change.createdAt)}
                    </td>
                    <td className="h-[29px] px-[10px] font-mono text-[12px] font-medium text-fg">
                      {change.action}
                      {change.itemCount > 0 && (
                        <span className="ml-[6px] font-normal text-fg-3">
                          · {t('{{count}} items', { count: change.itemCount })}
                        </span>
                      )}
                    </td>
                    <td className="h-[29px] pr-4 text-right">
                      <Tag variant={CHANGE_STATUS_VARIANT[change.status] ?? 'default'}>{change.status}</Tag>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      ) : null}
    </div>
  )
}
