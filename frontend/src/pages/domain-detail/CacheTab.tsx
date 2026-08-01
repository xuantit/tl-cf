import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Input, Select, message } from 'antd'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import ConfirmDestructive from '../../components/ConfirmDestructive'
import { KvRow, Lbl, StatStrip } from '../../components/ui'
import { api, apiErrorCode, apiErrorDetail } from '../../services/api'
import type { CacheConfig, TieredCacheSettings, ZoneAnalytics } from '../../types/domain'
import { formatBytes, formatPercent } from '../../utils/format'

const BROWSER_TTL_OPTIONS = [
  { value: 0, labelKey: 'Respect Existing Headers' },
  { value: 1800, labelKey: '30 minutes' },
  { value: 3600, labelKey: '1 hour' },
  { value: 7200, labelKey: '2 hours' },
  { value: 14400, labelKey: '4 hours' },
  { value: 28800, labelKey: '8 hours' },
  { value: 43200, labelKey: '12 hours' },
  { value: 86400, labelKey: '1 day' },
  { value: 172800, labelKey: '2 days' },
  { value: 259200, labelKey: '3 days' },
  { value: 604800, labelKey: '1 week' },
  { value: 1209600, labelKey: '2 weeks' },
  { value: 2592000, labelKey: '1 month' },
  { value: 5184000, labelKey: '2 months' },
  { value: 15552000, labelKey: '6 months' },
  { value: 31536000, labelKey: '1 year' },
]

export default function CacheTab({
  zoneId,
  zoneName,
  isEnterprise,
}: {
  zoneId: string
  zoneName?: string
  isEnterprise: boolean
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [purgeUrlsText, setPurgeUrlsText] = useState('')

  const purgeAllOpen = searchParams.get('modal') === 'purge-all'
  const setPurgeAllOpen = (open: boolean) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (open) next.set('modal', 'purge-all')
        else next.delete('modal')
        return next
      },
      { replace: true },
    )
  }

  const analytics = useQuery<ZoneAnalytics>({
    queryKey: ['zone-analytics', zoneId],
    queryFn: async () => (await api.get(`/analytics/zone/${zoneId}`, { params: { range: '24h' } })).data,
    enabled: !!zoneId,
    retry: false,
    staleTime: 60_000,
  })

  const { data: cacheConfig } = useQuery<CacheConfig>({
    queryKey: ['cache', zoneId],
    queryFn: async () => (await api.get(`/domains/${zoneId}/cache-config`)).data,
    enabled: !!zoneId,
  })

  const { data: tieredCache } = useQuery<TieredCacheSettings>({
    queryKey: ['tiered-cache', zoneId],
    queryFn: async () => (await api.get(`/domains/${zoneId}/tiered-cache`)).data,
    enabled: !!zoneId,
    retry: false,
  })

  const updateCache = useMutation({
    mutationFn: async (data: CacheConfig) => (await api.put(`/domains/${zoneId}/cache-config`, data)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cache', zoneId] })
      qc.invalidateQueries({ queryKey: ['tiered-cache', zoneId] })
      message.success(t('Cache settings updated'))
    },
    onError: (error) => {
      message.error(apiErrorDetail(error) || t('Failed to update cache settings'))
    },
  })

  const updateTieredCache = useMutation({
    mutationFn: async (data: { topology: string }) =>
      (await api.patch(`/domains/${zoneId}/tiered-cache`, data)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tiered-cache', zoneId] })
      message.success(t('Tiered cache topology updated'))
    },
    onError: (error) => {
      message.error(apiErrorDetail(error) || t('Failed to update tiered cache topology'))
    },
  })

  const purgeCache = useMutation({
    mutationFn: async (files?: string[]) => {
      await api.post(`/domains/${zoneId}/cache-config/purge`, files && files.length ? { files } : {})
    },
    onSuccess: () => {
      setPurgeAllOpen(false)
      message.success(t('Cache purged successfully'))
    },
    onError: (error) => {
      message.error(apiErrorDetail(error) || t('Failed to purge cache'))
    },
  })

  const purgeUrls = purgeUrlsText
    .split('\n')
    .map((u) => u.trim())
    .filter(Boolean)

  const saved = analytics.data ? formatBytes(analytics.data.totals.savedBytes) : null
  const analyticsForbidden = apiErrorCode(analytics.error) === 'ANALYTICS_PERMISSION_MISSING'

  return (
    <div className="border-x border-b border-stroke bg-bg">
      {analytics.data && (
        <StatStrip
          items={[
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
      {analyticsForbidden && (
        <div className="border-b border-stroke px-4 py-[7px] font-mono text-[11.5px] text-fg-3">
          {t('Analytics unavailable — the API token is missing Zone Analytics:Read')}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2">
        {/* Left: cache configuration */}
        <div className="px-4 py-[13px]">
          <Lbl className="mb-[9px] block">{t('Cache configuration')}</Lbl>
          <KvRow
            k={t('Cache level')}
            v={
              <Select
                size="small"
                className="w-[170px]"
                value={cacheConfig?.cache_level}
                loading={updateCache.isPending}
                onChange={(value) => updateCache.mutate({ cache_level: value })}
                options={[
                  { value: 'aggressive', label: t('Standard') },
                  { value: 'basic', label: t('Ignore query string') },
                  { value: 'simplified', label: t('No query string') },
                ]}
              />
            }
            className="!h-[34px]"
          />
          <KvRow
            k={t('Browser TTL')}
            v={
              <Select
                size="small"
                className="w-[170px]"
                value={cacheConfig?.browser_cache_ttl}
                loading={updateCache.isPending}
                onChange={(value) => updateCache.mutate({ browser_cache_ttl: value })}
                options={BROWSER_TTL_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey) }))}
              />
            }
            className="!h-[34px]"
          />
          <KvRow
            k={t('Tiered cache')}
            v={
              <Select
                size="small"
                className="w-[170px]"
                value={tieredCache?.topology ?? undefined}
                disabled={tieredCache?.available === false}
                placeholder={tieredCache?.available === false ? t('Unavailable') : undefined}
                loading={updateTieredCache.isPending}
                onChange={(value) => updateTieredCache.mutate({ topology: value })}
                options={[
                  { value: 'off', label: t('Off') },
                  { value: 'smart', label: t('Smart (recommended)') },
                  ...(isEnterprise ? [{ value: 'generic', label: t('Generic Global (Enterprise)') }] : []),
                ]}
              />
            }
            className="!h-[34px]"
          />
          {tieredCache?.available === false && (
            <p className="mt-2 mb-0 font-mono text-[11.5px] text-fg-3">
              {t('Not available: the API token lacks the Tiered Cache permission or your plan does not include it.')}
            </p>
          )}
        </div>

        {/* Right: purge by URL */}
        <div className="border-t border-stroke px-4 py-[13px] lg:border-t-0 lg:border-l">
          <Lbl className="mb-[9px] block">{t('Purge by URL')}</Lbl>
          <Input.TextArea
            rows={5}
            placeholder={'https://example.com/style.css\nhttps://example.com/app.js'}
            value={purgeUrlsText}
            onChange={(e) => setPurgeUrlsText(e.target.value)}
            className="font-mono !text-[12.5px]"
          />
          <div className="mt-[9px] flex flex-wrap items-center gap-1.5">
            <Button
              type="primary"
              disabled={purgeUrls.length === 0}
              loading={purgeCache.isPending && !purgeAllOpen}
              onClick={() => purgeCache.mutate(purgeUrls, { onSuccess: () => setPurgeUrlsText('') })}
            >
              ↻ {t('Purge {{count}} URL', { count: purgeUrls.length })}
            </Button>
            <Button danger onClick={() => setPurgeAllOpen(true)}>
              {t('Purge everything')}
            </Button>
            <span className="ml-auto font-mono text-[11px] text-fg-3">{t('max 30 URLs per request')}</span>
          </div>
        </div>
      </div>

      <ConfirmDestructive
        open={purgeAllOpen}
        title={t('Purge all cache for {{name}}?', { name: zoneName ?? zoneId })}
        explanation={t(
          'All cached content of this zone will be removed from the Cloudflare edge. The origin server will receive the full traffic until the cache is rebuilt.',
        )}
        confirmText={zoneName ?? zoneId}
        confirmLabel={t('Purge everything')}
        loading={purgeCache.isPending}
        onConfirm={() => purgeCache.mutate(undefined)}
        onCancel={() => setPurgeAllOpen(false)}
      />
    </div>
  )
}
