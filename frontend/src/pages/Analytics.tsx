import { Button, Segmented } from 'antd'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api, apiErrorCode, apiErrorDetail } from '../services/api'
import { useAccountStore } from '../stores/useAccountStore'
import type { AnalyticsRange, AnalyticsSummary } from '../types/analytics'
import PageHeader from '../components/PageHeader'
import MetricsChart from '../components/monitoring/MetricsChart'
import { Banner, Dot, EmptyState, KvRow, Lbl, SectionHeader, SkeletonLine, StatStrip, Tag } from '../components/ui'
import { formatBytesStr, formatCompact, formatPercent, formatShare } from '../utils/format'
import type { DotStatus, TagVariant } from '../components/ui'

const RANGES: AnalyticsRange[] = ['24h', '7d', '30d']

const STATUS_ROWS: Array<{ key: '2xx' | '3xx' | '4xx' | '5xx'; dot: DotStatus; tag: TagVariant }> = [
  { key: '2xx', dot: 'ok', tag: 'ok' },
  { key: '3xx', dot: 'info', tag: 'default' },
  { key: '4xx', dot: 'warn', tag: 'warn' },
  { key: '5xx', dot: 'err', tag: 'err' },
]

/** Analytics (route /analytics) — 2.html "analytics" view over GET /analytics/summary. */
export default function Analytics() {
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const activeAccountId = useAccountStore((s) => s.activeAccountId)

  const rangeParam = searchParams.get('range')
  const range: AnalyticsRange = RANGES.includes(rangeParam as AnalyticsRange)
    ? (rangeParam as AnalyticsRange)
    : '24h'

  const { data, isLoading, isError, error, refetch } = useQuery<AnalyticsSummary>({
    queryKey: ['analytics-summary', activeAccountId, range],
    queryFn: async () => (await api.get('/analytics/summary', { params: { range } })).data,
    retry: false,
  })
  const permissionMissing = isError && apiErrorCode(error) === 'ANALYTICS_PERMISSION_MISSING'

  const rangeLabel = { '24h': t('last 24 hours'), '7d': t('last 7 days'), '30d': t('last 30 days') }[range]

  const header = (
    <PageHeader
      title="Analytics"
      crumb={data ? `${t('{{count}} zones', { count: data.zoneCount })} · ${rangeLabel}` : rangeLabel}
      actions={
        <Segmented
          size="small"
          value={range}
          onChange={(value) =>
            setSearchParams(value === '24h' ? {} : { range: String(value) }, { replace: true })
          }
          options={RANGES.map((r) => ({ value: r, label: r }))}
        />
      }
    />
  )

  if (permissionMissing) {
    return (
      <div className="fade-in p-[clamp(12px,3vw,24px)]">
        {header}
        <Banner tone="warn">
          {t('The Cloudflare API token is missing the permission required for analytics.')}
        </Banner>
        <EmptyState
          icon="◱"
          title={t('Analytics needs an extra token permission')}
          desc={
            <>
              {t('Edit the API token on Cloudflare and add')}{' '}
              <span className="text-fg-2">Zone → Analytics → Read</span>{' '}
              {t('(see the CLOUDFLARE_API_PERMISSIONS guide)')}
            </>
          }
          actions={
            <Button size="small" onClick={() => refetch()}>
              ↻ {t('Retry')}
            </Button>
          }
        />
      </div>
    )
  }

  const totals = data?.totals
  const totalRequests = totals?.requests ?? 0
  const err5xxRate = totalRequests > 0 ? ((data?.statusBuckets['5xx'] ?? 0) / totalRequests) * 100 : 0

  return (
    <div className="fade-in p-[clamp(12px,3vw,24px)]">
      {header}

      {isError && (
        <Banner
          tone="err"
          actions={
            <Button size="small" onClick={() => refetch()}>
              ↻ {t('Retry')}
            </Button>
          }
        >
          {apiErrorDetail(error) || t('Could not load analytics data')}
        </Banner>
      )}

      {isLoading ? (
        <div className="flex flex-col gap-[14px] py-3" data-testid="analytics-skeleton">
          {Array.from({ length: 8 }).map((_, i) => (
            <SkeletonLine key={i} width={`${92 - (i % 4) * 12}%`} />
          ))}
        </div>
      ) : data && totals ? (
        <>
          <StatStrip
            items={[
              { value: formatCompact(totals.requests), label: 'requests' },
              { value: formatBytesStr(totals.bytes), label: 'bandwidth' },
              {
                value: `${formatPercent(totals.cacheHitRatio)}%`,
                label: t('cache hit'),
                delta: t('saved {{amount}}', { amount: formatBytesStr(totals.savedBytes) }),
                deltaTone: 'up',
              },
              {
                value: `${err5xxRate.toFixed(2)}%`,
                label: t('5xx rate'),
                delta: formatCompact(data.statusBuckets['5xx']),
                deltaTone: err5xxRate > 1 ? 'down' : 'muted',
              },
            ]}
          />

          <SectionHeader title={range === '24h' ? t('Requests by hour') : t('Requests by day')} />
          <div className="py-[14px]">
            <MetricsChart series={data.series} range={range} height={190} />
          </div>

          <div className="grid grid-cols-1 border-y border-stroke md:grid-cols-3">
            <div className="border-b border-stroke p-[13px_16px] md:border-b-0">
              <Lbl className="mb-[9px] block">{t('Top zones by requests')}</Lbl>
              {data.topZones.length === 0 && <div className="py-2 font-mono text-[11px] text-fg-3">—</div>}
              {data.topZones.slice(0, 6).map((zone) => (
                <KvRow
                  key={zone.zoneTag}
                  k={<span className="font-mono text-[11.5px]">{zone.name}</span>}
                  v={
                    <>
                      {formatCompact(zone.requests)} <Tag>{formatShare(zone.requests, totals.requests)}</Tag>
                    </>
                  }
                />
              ))}
            </div>
            <div className="border-b border-stroke p-[13px_16px] md:border-b-0 md:border-l md:border-solid md:border-l-stroke">
              <Lbl className="mb-[9px] block">{t('Status codes')}</Lbl>
              {STATUS_ROWS.map(({ key, dot, tag }) => (
                <KvRow
                  key={key}
                  k={
                    <span className="flex items-center gap-[6px]">
                      <Dot status={dot} /> {key}
                    </span>
                  }
                  v={
                    <>
                      {formatCompact(data.statusBuckets[key])}{' '}
                      <Tag variant={tag}>{formatShare(data.statusBuckets[key], totals.requests)}</Tag>
                    </>
                  }
                />
              ))}
            </div>
            <div className="p-[13px_16px] md:border-l md:border-solid md:border-l-stroke">
              <Lbl className="mb-[9px] block">{t('Countries')}</Lbl>
              {data.topCountries.length === 0 && <div className="py-2 font-mono text-[11px] text-fg-3">—</div>}
              {data.topCountries.map((row) => (
                <KvRow
                  key={row.country}
                  k={row.country === 'other' ? t('Other') : row.country}
                  v={
                    <>
                      {formatCompact(row.requests)} <Tag>{formatShare(row.requests, totals.requests)}</Tag>
                    </>
                  }
                />
              ))}
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}
