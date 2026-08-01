import { useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from 'antd'
import { message } from '../../lib/antdApp'
import { CopyOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Dot, KvRow, Lbl, SkeletonLine, StatStrip, Tag } from '../../components/ui'
import type { TagVariant } from '../../components/ui'
import { api, apiErrorCode } from '../../services/api'
import type { ZoneAnalytics, ZoneDetail } from '../../types/domain'
import { formatBytes, formatCompact, formatPercent } from '../../utils/format'

type FeatureState = 'available' | 'forbidden' | 'plan_limited' | 'unavailable' | 'unknown'

interface FeatureCapability {
  state: FeatureState
  requiredPermission: string
  reason: string | null
}

interface CapabilitiesResponse {
  token: { valid: boolean; authType?: string; accountId: string | null }
  zone: { id: string; plan: string | null } | null
  features: Record<string, FeatureCapability>
}

interface ChangeSetSummary {
  id: string
  action: string
  status: string
  reversible: boolean
  createdAt: string
  zoneId: string | null
}

const FEATURE_TAG: Record<FeatureState, TagVariant> = {
  available: 'ok',
  forbidden: 'err',
  plan_limited: 'warn',
  unavailable: 'default',
  unknown: 'default',
}

const CHANGE_TAG: Record<string, TagVariant> = {
  done: 'ok',
  failed: 'err',
  pending: 'info',
  rolled_back: 'default',
  rollback_failed: 'err',
}

export default function OverviewTab({ zoneId, zone }: { zoneId: string; zone?: ZoneDetail }) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const dateLocale = i18n.language === 'vi' ? 'vi-VN' : 'en-US'

  const analytics = useQuery<ZoneAnalytics>({
    queryKey: ['zone-analytics', zoneId],
    queryFn: async () => (await api.get(`/analytics/zone/${zoneId}`, { params: { range: '24h' } })).data,
    enabled: !!zoneId,
    retry: false,
    staleTime: 60_000,
  })

  const forceFreshCaps = useRef(false)
  const capabilities = useQuery<CapabilitiesResponse>({
    queryKey: ['capabilities', zoneId],
    queryFn: async () => {
      const refresh = forceFreshCaps.current
      forceFreshCaps.current = false
      return (await api.get('/cf/capabilities', { params: { zoneId, ...(refresh ? { refresh: 1 } : {}) } })).data
    },
    enabled: !!zoneId,
  })

  const changes = useQuery<ChangeSetSummary[]>({
    queryKey: ['changes', zoneId],
    queryFn: async () => (await api.get('/changes', { params: { zoneId } })).data,
    enabled: !!zoneId,
  })

  const featureLabels: Record<string, string> = {
    dns: 'DNS',
    cachePurge: t('Cache Purge'),
    ssl: 'SSL/TLS',
    pageRules: t('Page Rules'),
    modernRules: t('Rules'),
  }

  const saved = analytics.data ? formatBytes(analytics.data.totals.savedBytes) : null
  const analyticsForbidden = apiErrorCode(analytics.error) === 'ANALYTICS_PERMISSION_MISSING'

  return (
    <div className="border-x border-b border-stroke bg-bg">
      {/* Quick stats from the analytics proxy — hidden when the token lacks the permission */}
      {analytics.data && (
        <StatStrip
          items={[
            {
              value: formatCompact(analytics.data.totals.requests),
              label: t('requests 24h'),
            },
            {
              value: (
                <>
                  {formatPercent(analytics.data.totals.cacheHitRatio)}
                  <span className="text-[12px] text-fg-3">%</span>
                </>
              ),
              label: t('cache hit'),
            },
            {
              value: (
                <>
                  {saved?.value}
                  <span className="text-[12px] text-fg-3">{saved?.unit}</span>
                </>
              ),
              label: t('bandwidth saved'),
            },
          ]}
        />
      )}
      {analytics.isError && (
        <div className="border-b border-stroke px-4 py-[7px] font-mono text-[11.5px] text-fg-3">
          {analyticsForbidden
            ? t('Analytics unavailable — the API token is missing Zone Analytics:Read')
            : t('Analytics unavailable')}
        </div>
      )}

      <div className="grid grid-cols-1 border-b border-stroke lg:grid-cols-2">
        <div className="px-4 py-[13px]">
          <Lbl className="mb-[9px] block">{t('Zone information')}</Lbl>
          <KvRow k="Zone ID" v={<span className="text-fg-2">{zoneId}</span>} />
          <KvRow
            k={t('Status')}
            v={
              zone ? (
                <>
                  <Dot status={zone.status === 'active' ? 'ok' : 'warn'} />
                  {zone.status}
                </>
              ) : (
                '—'
              )
            }
          />
          <KvRow k="Plan" v={zone?.plan ? <span className="capitalize">{zone.plan}</span> : '—'} />
          {(zone?.nameServers?.length ? zone.nameServers : []).map((ns, i) => (
            <KvRow
              key={ns + i}
              k={i === 0 ? 'Nameservers' : ''}
              v={
                <>
                  <span className="text-fg-2">{ns}</span>
                  <button
                    type="button"
                    aria-label={t('Copy {{value}}', { value: ns })}
                    title={t('Copy')}
                    className="cursor-pointer border-0 bg-transparent p-0 text-[12px] leading-none text-fg-3 transition-colors hover:text-accent"
                    onClick={async () => {
                      await navigator.clipboard.writeText(ns)
                      message.success(t('Copied {{value}}', { value: ns }))
                    }}
                  >
                    <CopyOutlined />
                  </button>
                </>
              }
            />
          ))}
          {!zone?.nameServers?.length && <KvRow k="Nameservers" v="—" />}
        </div>

        <div className="border-t border-stroke px-4 py-[13px] lg:border-t-0 lg:border-l">
          <div className="mb-[9px] flex items-center">
            <Lbl>{t('Permissions & Capabilities')}</Lbl>
            <Button
              size="small"
              className="ml-auto"
              loading={capabilities.isFetching}
              onClick={() => { forceFreshCaps.current = true; capabilities.refetch() }}
            >
              ↻ {t('Re-check')}
            </Button>
          </div>
          {capabilities.data ? (
            Object.entries(capabilities.data.features).map(([name, feature]) => (
              <KvRow
                key={name}
                k={featureLabels[name] || name}
                v={
                  <span title={feature.reason ? `${feature.requiredPermission} — ${feature.reason}` : feature.requiredPermission}>
                    <Tag variant={FEATURE_TAG[feature.state]}>{t(feature.state)}</Tag>
                  </span>
                }
              />
            ))
          ) : (
            <div className="flex flex-col gap-[10px] py-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <SkeletonLine key={i} width={`${80 - i * 10}%`} />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 border-b border-stroke bg-bg-side px-4 py-[9px]">
        <Lbl>{t('Recent changes')}</Lbl>
        <div className="ml-auto">
          <Button size="small" type="text" onClick={() => navigate(`/history?tab=changes&zone=${zoneId}`)}>
            {t('View all')} →
          </Button>
        </div>
      </div>
      {changes.data && changes.data.length > 0 ? (
        <div>
          {changes.data.slice(0, 5).map((change) => (
            <div
              key={change.id}
              className="flex items-center gap-[11px] border-b border-stroke-2 px-4 py-[9px] last:border-b-0"
            >
              <span className="w-[130px] flex-none font-mono text-[11.5px] text-fg-3">
                {new Date(change.createdAt).toLocaleString(dateLocale)}
              </span>
              <code className="min-w-0 truncate font-mono text-[12.5px] text-fg">{change.action}</code>
              <span className="ml-auto flex items-center gap-1">
                {change.reversible && <Tag>rollback</Tag>}
                <Tag variant={CHANGE_TAG[change.status] || 'default'}>{change.status}</Tag>
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="px-4 py-[13px] font-mono text-[11px] text-fg-3">
          {changes.isLoading ? <SkeletonLine width="40%" /> : t('No changes recorded for this zone')}
        </div>
      )}
    </div>
  )
}
