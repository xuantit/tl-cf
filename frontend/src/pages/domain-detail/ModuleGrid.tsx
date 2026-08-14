import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { SkeletonLine, Tag } from '../../components/ui'
import { api } from '../../services/api'
import type {
  CacheConfig,
  DnsRecord,
  PageRule,
  SecuritySettings,
  SslSettings,
  TieredCacheSettings,
  ZoneAnalytics,
  ZoneDetail,
} from '../../types/domain'
import { formatBytesStr, formatCompact, formatPercent } from '../../utils/format'
import { DOMAIN_MODULES, type ModuleKey } from './modules'

interface RulesetListResponse {
  rules: Array<{ enabled: boolean }>
}

interface Highlight {
  k: string
  v: string
}

interface CardData {
  sub: string
  highlights: Highlight[]
  tags: Array<{ variant: 'ok' | 'warn' | 'default'; label: string }>
  /** Query chính của khối chưa xong → hiện skeleton thay vì “—”. */
  loading?: boolean
}

const EM_DASH = '—'

/**
 * Lưới các khối chức năng thay cho thanh tab: mỗi khối tóm tắt vài thiết lập
 * nổi bật đã cấu hình, bấm vào sẽ mở khối đó ở chế độ toàn màn hình.
 *
 * Dùng lại đúng queryKey của từng tab nên dữ liệu được chia sẻ, không gọi thêm
 * Cloudflare khi chuyển sang tab tương ứng.
 */
export default function ModuleGrid({
  zoneId,
  zone,
  onOpen,
}: {
  zoneId: string
  zone?: ZoneDetail
  onOpen: (key: ModuleKey) => void
}) {
  const { t } = useTranslation()
  const shared = { enabled: !!zoneId, retry: false, staleTime: 60_000 } as const

  const dns = useQuery<DnsRecord[]>({
    queryKey: ['dns', zoneId],
    queryFn: async () => (await api.get(`/domains/${zoneId}/dns`)).data,
    ...shared,
  })
  const pageRules = useQuery<PageRule[]>({
    queryKey: ['rules', zoneId],
    queryFn: async () => (await api.get(`/domains/${zoneId}/rules`)).data,
    ...shared,
  })
  const cache = useQuery<CacheConfig>({
    queryKey: ['cache', zoneId],
    queryFn: async () => (await api.get(`/domains/${zoneId}/cache-config`)).data,
    ...shared,
  })
  const tiered = useQuery<TieredCacheSettings>({
    queryKey: ['tiered-cache', zoneId],
    queryFn: async () => (await api.get(`/domains/${zoneId}/tiered-cache`)).data,
    ...shared,
  })
  const cacheRules = useQuery<RulesetListResponse>({
    queryKey: ['ruleset-rules', zoneId, 'cache'],
    queryFn: async () => (await api.get(`/rules/${zoneId}/cache`)).data,
    ...shared,
  })
  const redirectRules = useQuery<RulesetListResponse>({
    queryKey: ['ruleset-rules', zoneId, 'redirect'],
    queryFn: async () => (await api.get(`/rules/${zoneId}/redirect`)).data,
    ...shared,
  })
  const configRules = useQuery<RulesetListResponse>({
    queryKey: ['ruleset-rules', zoneId, 'configuration'],
    queryFn: async () => (await api.get(`/rules/${zoneId}/configuration`)).data,
    ...shared,
  })
  const ssl = useQuery<SslSettings>({
    queryKey: ['ssl', zoneId],
    queryFn: async () => (await api.get(`/domains/${zoneId}/ssl`)).data,
    ...shared,
  })
  const security = useQuery<SecuritySettings>({
    queryKey: ['security', zoneId],
    queryFn: async () => (await api.get(`/domains/${zoneId}/security`)).data,
    ...shared,
  })
  // Cùng queryKey với OverviewTab/KPI strip nên dữ liệu được chia sẻ, không gọi thêm.
  const analytics = useQuery<ZoneAnalytics>({
    queryKey: ['zone-analytics', zoneId],
    queryFn: async () =>
      (await api.get(`/analytics/zone/${zoneId}`, { params: { range: '24h' } })).data,
    ...shared,
  })

  const activeCount = (data?: RulesetListResponse) => data?.rules.filter((r) => r.enabled).length ?? 0
  const proxied = dns.data?.filter((r) => r.proxied).length ?? 0
  const tags = zone?.savedSettings?.tags ?? zone?.tags ?? []
  const browserTtl = cache.data?.browser_cache_ttl
  const onOff = (value?: string) => (value === 'on' ? t('On') : value === 'off' ? t('Off') : EM_DASH)

  const cards: Record<ModuleKey, CardData> = {
    dns: {
      sub: t('{{count}} records', { count: dns.data?.length ?? 0 }) + ` · ${proxied} proxied`,
      highlights: (dns.data ?? []).slice(0, 4).map((record) => {
        // Chỉ rút gọn khi đã biết tên zone — thay '.${undefined}' sẽ cắt nhầm dấu chấm đầu tiên.
        const short = !zone?.name
          ? record.name
          : record.name === zone.name
            ? '@'
            : record.name.endsWith(`.${zone.name}`)
              ? record.name.slice(0, -zone.name.length - 1)
              : record.name
        return { k: `${record.type}  ${short}`, v: record.content }
      }),
      tags: [{ variant: 'default', label: `${dns.data?.length ?? 0} ${t('records')}` }],
      loading: dns.isLoading,
    },
    cache: {
      sub: t('{{count}} cache rules active', { count: activeCount(cacheRules.data) }),
      highlights: [
        { k: t('Cache level'), v: cache.data?.cache_level ?? EM_DASH },
        {
          k: t('Browser TTL'),
          v: browserTtl === undefined ? EM_DASH : browserTtl === 0 ? t('Respect origin') : `${browserTtl}s`,
        },
        { k: t('Tiered cache'), v: tiered.data?.topology ?? EM_DASH },
        { k: t('Cache Rules'), v: `${activeCount(cacheRules.data)} ${t('active')}` },
      ],
      tags: [{ variant: 'default', label: t('Purge & TTL') }],
      loading: cache.isLoading,
    },
    rules: {
      sub: `Page ${pageRules.data?.length ?? 0}/20 · Redirect ${activeCount(redirectRules.data)} · Config ${activeCount(configRules.data)}`,
      highlights: [
        { k: t('Page Rules'), v: `${pageRules.data?.length ?? 0} / 20` },
        { k: t('Redirect Rules'), v: `${activeCount(redirectRules.data)} ${t('active')}` },
        { k: t('Configuration Rules'), v: `${activeCount(configRules.data)} ${t('active')}` },
      ],
      tags: [],
      loading: pageRules.isLoading,
    },
    security: {
      sub: ssl.data?.mode ? `SSL ${ssl.data.mode}` : t('Security settings'),
      highlights: [
        { k: 'SSL/TLS', v: ssl.data?.mode ?? EM_DASH },
        { k: t('Always Use HTTPS'), v: onOff(security.data?.always_use_https) },
        { k: t('Security level'), v: security.data?.security_level ?? EM_DASH },
        { k: t('Development mode'), v: onOff(security.data?.development_mode) },
      ],
      tags:
        security.data?.development_mode === 'on'
          ? [{ variant: 'warn', label: t('Development mode') }]
          : [],
      loading: ssl.isLoading && security.isLoading,
    },
    tags: {
      sub: t('{{count}} tags', { count: tags.length }),
      highlights: tags.length
        ? [{ k: t('Tags'), v: tags.join(', ') }]
        : [{ k: t('Tags'), v: t('No tags yet') }],
      tags: tags.slice(0, 3).map((tag) => ({ variant: 'default' as const, label: tag })),
    },
    analytics: {
      sub: t('Last 24 hours'),
      highlights: analytics.data
        ? [
            { k: t('Requests'), v: formatCompact(analytics.data.totals.requests) },
            { k: t('Cache hit'), v: `${formatPercent(analytics.data.totals.cacheHitRatio)}%` },
            { k: t('Bandwidth saved'), v: formatBytesStr(analytics.data.totals.savedBytes) },
          ]
        : [],
      tags: [],
      loading: analytics.isLoading,
    },
  }

  return (
    <div className="grid grid-cols-1 gap-3 pt-3 sm:grid-cols-2 xl:grid-cols-4">
      {DOMAIN_MODULES.map((mod) => {
        const card = cards[mod.key]
        return (
          <button
            key={mod.key}
            type="button"
            aria-label={t(mod.label)}
            onClick={() => onOpen(mod.key)}
            className="group flex cursor-pointer flex-col gap-2.5 rounded-[12px] border border-stroke bg-bg p-[14px_15px_12px] text-left transition-colors hover:border-accent/45 hover:bg-bg-hover"
          >
            <span className="flex items-center gap-2.5">
              <span className="grid h-7 w-7 flex-none place-items-center rounded-[8px] bg-accent-soft text-[14px] text-accent">
                {mod.icon}
              </span>
              <span className="min-w-0">
                <span className="block text-[14.5px] font-semibold tracking-[-0.01em] text-fg">
                  {t(mod.label)}
                </span>
                <span className="block truncate font-mono text-[11.5px] text-fg-3">{card.sub}</span>
              </span>
              <span className="ml-auto text-fg-3 opacity-0 transition-opacity group-hover:opacity-100">
                →
              </span>
            </span>

            <span className="flex flex-col border-t border-t-stroke-2 pt-0.5">
              {card.loading ? (
                /* Skeleton khi query chính chưa xong — tránh hiện "—" gây hiểu nhầm chưa cấu hình */
                <span className="flex flex-col gap-2 py-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <SkeletonLine key={i} width={`${86 - i * 16}%`} />
                  ))}
                </span>
              ) : (
                <>
                  {card.highlights.length === 0 && (
                    <span className="py-1.5 text-[12.5px] text-fg-3">{t('Not configured yet')}</span>
                  )}
                  {card.highlights.map((row, index) => (
                    <span
                      key={`${row.k}-${index}`}
                      className="flex items-center gap-2.5 border-b border-b-stroke-2 py-[5.5px] text-[12.5px] last:border-b-0"
                    >
                      <span className="min-w-[104px] truncate text-[12px] text-fg-3">{row.k}</span>
                      <span className="ml-auto max-w-[62%] truncate text-right font-mono text-[12px] text-fg">
                        {row.v}
                      </span>
                    </span>
                  ))}
                </>
              )}
            </span>

            {card.tags.length > 0 && (
              <span className="flex flex-wrap items-center gap-1.5">
                {card.tags.map((tag) => (
                  <Tag key={tag.label} variant={tag.variant}>
                    {tag.label}
                  </Tag>
                ))}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
