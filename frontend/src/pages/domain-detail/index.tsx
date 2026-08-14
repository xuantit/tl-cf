import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from 'antd'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import PageHeader from '../../components/PageHeader'
import { Dot, Tag } from '../../components/ui'
import { DetailPanelSlotContext } from '../../components/ui/detailPanelSlot'
import { api } from '../../services/api'
import type { DnsRecord, PageRule, ZoneAnalytics, ZoneDetail } from '../../types/domain'
import type { DotStatus } from '../../components/ui'
import { useFocusMode } from '../../stores/useFocusMode'
import { formatBytes, formatCompact, formatPercent } from '../../utils/format'
import OverviewTab from './OverviewTab'
import DnsTab from './DnsTab'
import CacheTab from './CacheTab'
import RulesTab from './RulesTab'
import SecurityTab from './SecurityTab'
import TagsTab from './TagsTab'
import ModuleGrid from './ModuleGrid'
import FunctionRail from './FunctionRail'
import { DOMAIN_MODULES, isModuleKey, type ModuleKey } from './modules'

const STATUS_DOT: Record<string, DotStatus> = {
  active: 'ok',
  pending: 'warn',
  error: 'err',
}

/** `?tab=` cũ vẫn dùng được; giá trị lạ hoặc rỗng → về lưới Overview. */
function normalizeModule(raw: string | null): ModuleKey | null {
  if (raw === 'settings') return 'tags' // tab cũ đã gộp vào Tags
  return isModuleKey(raw) ? raw : null
}

/** Ô KPI nhỏ trên đầu Overview (khớp .kpi của mockup). */
function Kpi({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-[132px] rounded-[8px] border border-stroke bg-bg px-[13px] py-[9px]">
      <div className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-fg-3">{label}</div>
      <div className="text-[17px] font-semibold tracking-[-0.02em]">{value}</div>
    </div>
  )
}

export default function DomainDetail() {
  const { t } = useTranslation()
  const { zoneId = '' } = useParams<{ zoneId: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const activeModule = normalizeModule(searchParams.get('tab'))
  // Slot DOM cho DetailPanel (portal) — state để context cập nhật sau khi mount.
  const [panelSlot, setPanelSlot] = useState<HTMLDivElement | null>(null)

  const setParams = useCallback(
    (updates: Record<string, string | null>) => {
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
    },
    [setSearchParams],
  )

  const openModule = useCallback(
    (key: ModuleKey) => setParams({ tab: key, modal: null, edit: null, kind: null, sub: null }),
    [setParams],
  )
  const backToOverview = useCallback(
    () => setParams({ tab: null, modal: null, edit: null, kind: null, sub: null }),
    [setParams],
  )

  // Focus mode: báo cho AppShell thu sidebar chính lại để rail chiếm mép trái.
  // Gọi setter của zustand store trong effect là hợp lệ (không phải state của component).
  useEffect(() => {
    useFocusMode.getState().setActive(activeModule !== null)
    return () => useFocusMode.getState().setActive(false)
  }, [activeModule])

  // Esc thoát về Overview — nhưng nhường cho panel/modal đang mở tự xử lý trước.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (searchParams.get('modal') || searchParams.get('edit')) return
      if (activeModule) backToOverview()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [activeModule, searchParams, backToOverview])

  const { data: zone } = useQuery<ZoneDetail>({
    queryKey: ['domain', zoneId],
    queryFn: async () => (await api.get(`/domains/${zoneId}`)).data,
    enabled: !!zoneId,
  })

  // Đếm hiển thị trên rail — dùng chung queryKey với các tab nên không tốn thêm request.
  const { data: dnsRecords } = useQuery<DnsRecord[]>({
    queryKey: ['dns', zoneId],
    queryFn: async () => (await api.get(`/domains/${zoneId}/dns`)).data,
    enabled: !!zoneId,
    staleTime: 60_000,
  })
  const { data: pageRules } = useQuery<PageRule[]>({
    queryKey: ['rules', zoneId],
    queryFn: async () => (await api.get(`/domains/${zoneId}/rules`)).data,
    enabled: !!zoneId,
    staleTime: 60_000,
  })

  // KPI 24h — cùng queryKey với OverviewTab/ModuleGrid nên dữ liệu được chia sẻ.
  const { data: analytics } = useQuery<ZoneAnalytics>({
    queryKey: ['zone-analytics', zoneId],
    queryFn: async () =>
      (await api.get(`/analytics/zone/${zoneId}`, { params: { range: '24h' } })).data,
    enabled: !!zoneId,
    retry: false,
    staleTime: 60_000,
  })

  const zonePlan = zone?.plan ?? null
  const railCounts: Partial<Record<ModuleKey, number>> = {
    dns: dnsRecords?.length,
    rules: pageRules?.length,
    tags: (zone?.savedSettings?.tags ?? zone?.tags)?.length,
  }

  const moduleActions =
    activeModule === 'dns' ? (
      <Button type="primary" onClick={() => setParams({ modal: 'dns-add', edit: null })}>
        + {t('DNS record')}
      </Button>
    ) : activeModule === 'cache' ? (
      <Button danger onClick={() => setParams({ modal: 'purge-all' })}>
        ↻ {t('Purge everything')}
      </Button>
    ) : null

  /* ---------- STATE B: focus — full-bleed, rail thay chỗ sidebar chính ---------- */
  if (activeModule !== null) {
    const activeMeta = DOMAIN_MODULES.find((m) => m.key === activeModule)
    const activeCount = railCounts[activeModule]
    return (
      <div className="flex h-full min-h-0">
        <FunctionRail
          zoneName={zone?.name}
          active={activeModule}
          counts={railCounts}
          onSelect={openModule}
          onBack={backToOverview}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          {/* fx-head: nút back + tiêu đề module + actions riêng của module */}
          <div className="flex flex-none flex-wrap items-center gap-x-2.5 gap-y-1.5 border-b border-b-stroke bg-bg px-[clamp(12px,2vw,20px)] py-[9px] md:py-[11px]">
            <button
              type="button"
              aria-label={t('Back to Overview')}
              onClick={backToOverview}
              className="flex cursor-pointer items-center gap-1.5 rounded-[6px] border-none bg-transparent px-2 py-1 text-[12.5px] text-fg-3 hover:bg-bg-hover hover:text-fg"
            >
              ← {t('Overview')}
            </button>
            <span className="flex items-center gap-2 text-[15px] font-semibold tracking-[-0.01em]">
              <span className="opacity-85">{activeMeta?.icon}</span>
              {t(activeMeta?.label ?? '')}
            </span>
            {activeCount !== undefined && (
              <Tag>{t('{{count}} items', { count: activeCount })}</Tag>
            )}
            {moduleActions && <span className="ml-auto flex items-center gap-2">{moduleActions}</span>}
          </div>

          {/* Mobile: rail ẩn dưới md → thanh chip cuộn ngang để vẫn nhảy giữa các module */}
          <nav
            aria-label={t('Features')}
            className="flex flex-none gap-1.5 overflow-x-auto border-b border-b-stroke bg-bg-side px-3 py-2 [-ms-overflow-style:none] [scrollbar-width:none] md:hidden [&::-webkit-scrollbar]:hidden"
          >
            {DOMAIN_MODULES.map((mod) => {
              const on = mod.key === activeModule
              return (
                <button
                  key={mod.key}
                  type="button"
                  onClick={() => openModule(mod.key)}
                  className={`flex flex-none cursor-pointer items-center gap-1.5 rounded-full border border-solid px-3 py-[5px] text-[12.5px] whitespace-nowrap transition-colors ${
                    on
                      ? 'border-transparent bg-accent-soft font-medium text-accent'
                      : 'border-stroke bg-bg text-fg-2'
                  }`}
                >
                  <span className="text-[12px] opacity-85">{mod.icon}</span>
                  {t(mod.label)}
                  {railCounts[mod.key] !== undefined && (
                    <span className={`font-mono text-[11px] ${on ? 'text-accent/75' : 'text-fg-3'}`}>
                      {railCounts[mod.key]}
                    </span>
                  )}
                </button>
              )
            })}
          </nav>

          {/* Vùng dưới fx-head: nội dung + slot panel cạnh phải (cơ chế push).
              DetailPanel của tab con portal vào slot → khi mở nó đẩy content
              sang trái và cao full vùng nội dung, đè mọi section bên dưới. */}
          <DetailPanelSlotContext.Provider value={panelSlot}>
            <div className="flex min-h-0 flex-1">
              <div className="min-w-0 flex-1 overflow-auto px-[clamp(12px,2vw,20px)] pb-6">
                {activeModule === 'dns' && <DnsTab zoneId={zoneId} zoneName={zone?.name} />}
                {activeModule === 'cache' && (
                  <CacheTab
                    zoneId={zoneId}
                    zoneName={zone?.name}
                    isEnterprise={zonePlan === 'enterprise'}
                  />
                )}
                {activeModule === 'rules' && <RulesTab zoneId={zoneId} zoneName={zone?.name} />}
                {activeModule === 'security' && <SecurityTab zoneId={zoneId} />}
                {activeModule === 'tags' && <TagsTab zoneId={zoneId} zone={zone} />}
                {activeModule === 'analytics' && <OverviewTab zoneId={zoneId} zone={zone} />}
              </div>
              {/* Slot nhận DetailPanel qua portal */}
              <div ref={setPanelSlot} className="flex h-full flex-none" />
            </div>
          </DetailPanelSlotContext.Provider>
        </div>
      </div>
    )
  }

  /* ---------- STATE A: overview — header + KPI + lưới chức năng ---------- */
  const saved = analytics ? formatBytes(analytics.totals.savedBytes) : null
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
        />

        {/* Dòng sub (.ov-sub) */}
        <div className="pt-[3px] text-[12.5px] text-fg-3">
          {dnsRecords !== undefined &&
            `${t('{{count}} records', { count: dnsRecords.length })} DNS · `}
          {t('Click a card to open it full screen')}
        </div>

        {/* KPI strip (.kpis) — ẩn hoàn toàn khi analytics lỗi/chưa có */}
        {analytics && (
          <div className="flex flex-wrap gap-2 pt-3.5">
            <Kpi label={t('requests 24h')} value={formatCompact(analytics.totals.requests)} />
            <Kpi
              label={t('cache hit')}
              value={
                <>
                  {formatPercent(analytics.totals.cacheHitRatio)}
                  <span className="text-[11px] font-medium text-fg-3">%</span>
                </>
              }
            />
            <Kpi
              label={t('bandwidth saved')}
              value={
                <>
                  {saved?.value}
                  <span className="text-[11px] font-medium text-fg-3">{saved?.unit}</span>
                </>
              }
            />
          </div>
        )}

        <ModuleGrid zoneId={zoneId} zone={zone} onOpen={openModule} />
      </div>
    </div>
  )
}
