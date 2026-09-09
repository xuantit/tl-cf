import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Form, Input, Popconfirm, Select, Table } from 'antd'
import type { FormInstance } from 'antd'
import { message } from '../lib/antdApp'
import type { ColumnsType } from 'antd/es/table'
import type { Key } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api, apiErrorDetail } from '../services/api'
import { useDomains } from '../hooks/useDomains'
import { useDomainSelection } from '../hooks/useDomainSelection'
import { useDomainFilters, type DomainTab } from '../hooks/useDomainFilters'
import { useAccountStore } from '../stores/useAccountStore'
import { useSelectionMode } from '../stores/useSelectionMode'
import type { Zone } from '../types/domain'
import type { CfAccount } from '../components/AccountSwitcher'
import PageHeader from '../components/PageHeader'
import BulkActionBar, { BulkActionButton } from '../components/BulkActionBar'
import ConfirmDestructive from '../components/ConfirmDestructive'
import BulkProgressModal from '../components/BulkProgressModal'
import BulkAddDomainsPanel, { CreateZonesDone } from '../components/domains/BulkAddDomainsModal'
import BulkDnsReplacePanel from '../components/domains/BulkDnsReplaceModal'
import { CopyConfigPanel, CloneDomainPanel, type CloneSource } from '../components/domains/CopyClonePanels'
import { DetailPanel, Dot, EmptyState, Banner, SkeletonLine, Tag } from '../components/ui'
import type { DotStatus } from '../components/ui'

const STATUS_DOT: Record<string, DotStatus> = {
  active: 'ok',
  pending: 'warn',
  error: 'err',
}

function SslCell({ zone }: { zone: Zone }) {
  const mode = zone.sslMode || zone.ssl?.mode
  if (mode) {
    return (
      <span className="inline-flex items-center gap-[6px]">
        <Dot status={mode !== 'off' ? 'ok' : 'off'} />
        <span className="font-mono text-[12px] text-fg-2">{mode}</span>
      </span>
    )
  }
  const status = zone.ssl?.status
  if (status && status !== 'unknown') {
    return (
      <span className="inline-flex items-center gap-[6px]">
        <Dot status={status === 'active' ? 'ok' : 'warn'} />
        <span className="font-mono text-[12px] text-fg-2">{status}</span>
      </span>
    )
  }
  return <span className="text-fg-3">—</span>
}

export default function Domains() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [form] = Form.useForm()

  // Modal, job, search, tab and selection state live in the URL so F5 / shared links restore the view
  const activeModal = searchParams.get('modal') // 'add' | 'bulk-add' | 'bulk-dns' | 'tags' | 'delete'
  const jobId = searchParams.get('job')
  const searchText = searchParams.get('q') || ''
  const tab = (searchParams.get('tab') as DomainTab) || 'all'
  // Tag filter lives in the URL (?tag=a,b) so /tags and the palette can deep-link into it.
  const tagFilter = (searchParams.get('tag') || '').split(',').filter(Boolean)
  const [tagsToAssign, setTagsToAssign] = useState<string[]>([])
  // Clone source is row-scoped, ephemeral state (no URL param — F5 restore not needed here)
  const [cloneSource, setCloneSource] = useState<CloneSource | null>(null)
  // Copy-config mở từ nút Copy trên dòng → nguồn chọn sẵn; mở từ bulk bar → null
  const [copySourceId, setCopySourceId] = useState<string | null>(null)

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

  const selection = useDomainSelection()
  const selectionMode = useSelectionMode((s) => s.on)

  const setTagFilter = (tags: string[]) => setParams({ tag: tags.length > 0 ? tags.join(',') : null })

  const { data: domains = [], isLoading, isError, error, refetch } = useDomains()
  const { filtered, counts, allTags } = useDomainFilters(domains, {
    search: searchText,
    tab,
    tags: tagFilter,
  })

  // Account label for the header crumb — shares the ['cf-accounts'] cache with AccountSwitcher.
  const activeAccountId = useAccountStore((s) => s.activeAccountId)
  const { data: accounts = [] } = useQuery<CfAccount[]>({
    queryKey: ['cf-accounts'],
    queryFn: async () => (await api.get('/cf/accounts')).data,
    staleTime: 60_000,
  })
  const account = accounts.find((a) => a.id === activeAccountId)
  const accountLabel = account?.label || account?.email

  const createMutation = useMutation({
    mutationFn: async (name: string) => (await api.post('/domains', { name })).data,
    onSuccess: () => {
      message.success(t('Domain added successfully'))
      setParams({ modal: null })
      form.resetFields()
      queryClient.invalidateQueries({ queryKey: ['domains'] })
    },
    onError: (error) => {
      message.error(apiErrorDetail(error) || t('Could not add domain'))
    },
  })

  const bulkMutation = useMutation({
    mutationFn: async (payload: { action: 'purge' | 'delete' }) => {
      const res = await api.post('/domains/bulk', { ...payload, zoneIds: selection.selected })
      return res.data as { jobId: string }
    },
    onSuccess: (data) => {
      setParams({ job: data.jobId, modal: null })
    },
    onError: (error) => {
      message.error(apiErrorDetail(error) || t('Bulk operation failed'))
    },
  })

  const assignTagsMutation = useMutation({
    mutationFn: async (tags: string[]) => {
      await Promise.all(
        selection.selected.map((zoneId) => {
          const zone = domains.find((d) => d.id === zoneId)
          const merged = [...new Set([...(zone?.tags || []), ...tags])]
          return api.put(`/domains/${zoneId}/tags`, { tags: merged })
        }),
      )
    },
    onSuccess: () => {
      message.success(t('Tags updated'))
      setParams({ modal: null })
      setTagsToAssign([])
      queryClient.invalidateQueries({ queryKey: ['domains'] })
    },
    onError: (error) => {
      message.error(apiErrorDetail(error) || t('Could not update tags'))
    },
  })

  const closeBulkJob = () => {
    // Remove job + selected zones in a single update; two sequential setSearchParams calls are
    // unreliable (react-router ref not updated between calls) and would leave the modal open.
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('job')
        next.delete('zone')
        return next
      },
      { replace: true },
    )
    queryClient.invalidateQueries({ queryKey: ['domains'] })
  }

  const selectedZones = domains.filter((d) => selection.selectedSet.has(d.id))
  const deleteConfirmText = t('delete {{count}} zone', { count: selection.selected.length })

  const tabs = [
    { key: 'all', label: t('All'), count: counts.all },
    { key: 'active', label: t('Active'), count: counts.active },
    { key: 'pending', label: t('Pending'), count: counts.pending },
    { key: 'tag', label: t('By tag'), count: tagFilter.length > 0 ? tagFilter.length : undefined },
  ]

  const columns: ColumnsType<Zone> = [
    {
      title: 'Domain',
      dataIndex: 'name',
      key: 'name',
      render: (name: string) => (
        <span className="font-mono text-[12px] font-medium text-fg">{name}</span>
      ),
    },
    {
      title: 'Plan',
      dataIndex: 'plan',
      key: 'plan',
      width: 110,
      responsive: ['md'],
      render: (plan?: string) =>
        plan ? (
          <span className="text-[12px] text-fg-2 capitalize">{plan}</span>
        ) : (
          <span className="text-fg-3">—</span>
        ),
    },
    {
      title: t('Status'),
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status: string) => (
        <span className="inline-flex items-center gap-[6px]">
          <Dot status={STATUS_DOT[status] || 'off'} />
          <span className="text-[12px] capitalize">{status}</span>
        </span>
      ),
    },
    {
      title: 'SSL',
      key: 'ssl',
      width: 110,
      render: (_: unknown, zone: Zone) => <SslCell zone={zone} />,
    },
    {
      title: 'Tags',
      key: 'tags',
      width: 220,
      render: (_: unknown, zone: Zone) => (
        <span className="flex flex-wrap gap-1">
          {(zone.tags || []).map((tag) => (
            <button
              key={tag}
              type="button"
              className="cursor-pointer border-0 bg-transparent p-0"
              onClick={(e) => {
                e.stopPropagation()
                setParams({ tag, tab: 'tag' })
              }}
            >
              <Tag>{tag}</Tag>
            </button>
          ))}
        </span>
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 110,
      align: 'right',
      render: (_: unknown, zone: Zone) => (
        <span className="inline-flex">
          <Button
            type="link"
            size="small"
            className="font-mono !text-[11.5px]"
            onClick={(e) => {
              e.stopPropagation()
              setCopySourceId(zone.id)
              setParams({ modal: 'copy-config' })
            }}
          >
            {t('Copy')}
          </Button>
          <Button
            type="link"
            size="small"
            className="font-mono !text-[11.5px]"
            onClick={(e) => {
              e.stopPropagation()
              setCloneSource({ zoneId: zone.id, zoneName: zone.name })
            }}
          >
            {t('Clone')}
          </Button>
        </span>
      ),
    },
    {
      title: '',
      key: 'chevron',
      width: 36,
      align: 'right',
      render: () => <span className="text-[13px] text-fg-3">›</span>,
    },
  ]

  const barActions = (
    <>
      <Popconfirm
        title={t('Bulk purge cache')}
        description={t('Purge all cache for the {{count}} selected domain(s)?', {
          count: selection.selected.length,
        })}
        okText={t('Purge')}
        cancelText={t('Cancel')}
        onConfirm={() => bulkMutation.mutate({ action: 'purge' })}
      >
        <BulkActionButton variant="primary" disabled={bulkMutation.isPending}>
          ↻ {t('Purge cache')}
        </BulkActionButton>
      </Popconfirm>
      <BulkActionButton onClick={() => setParams({ modal: 'bulk-dns' })}>
        ⇄ {t('DNS replace')}
      </BulkActionButton>
      <BulkActionButton onClick={() => setParams({ modal: 'copy-config' })}>
        ⧉ {t('Copy config')}
      </BulkActionButton>
      <BulkActionButton onClick={() => setParams({ modal: 'tags' })}>
        ⊘ {t('Assign tags')}
      </BulkActionButton>
      <BulkActionButton variant="danger" onClick={() => setParams({ modal: 'delete' })}>
        ▢ {t('Delete')}
      </BulkActionButton>
    </>
  )

  const closeAddPanel = () => {
    setParams({ modal: null })
    form.resetFields()
  }

  const closeTagsPanel = () => {
    setParams({ modal: null })
    setTagsToAssign([])
  }

  return (
    // Panels are flex siblings of the content so they push it left (DetailPanel pattern)
    <div className="relative flex min-h-full">
      <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex-1 p-[clamp(12px,3vw,24px)]">
        <PageHeader
          title="Domains"
          crumb={
            accountLabel
              ? `${accountLabel} · ${t('{{count}} zones', { count: domains.length })}`
              : t('{{count}} zones', { count: domains.length })
          }
          actions={
            <>
              <Button onClick={() => setParams({ modal: 'bulk-add' })}>⊞ {t('Bulk add')}</Button>
              <Button type="primary" onClick={() => setParams({ modal: 'add' })}>
                + {t('Add domain')}
              </Button>
            </>
          }
          tabs={tabs}
          activeTab={tab}
          onTabChange={(key) => setParams({ tab: key === 'all' ? null : key })}
        />

        {isError && (
          <Banner
            tone="err"
            className="mb-3"
            actions={
              <Button size="small" onClick={() => refetch()}>
                ↻ {t('Retry')}
              </Button>
            }
          >
            {apiErrorDetail(error) || t('Could not load domains')}
          </Banner>
        )}

        {/* Toolbar: search (?q= handed off from the palette) + tag picker on the "By tag" tab */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Input
            prefix={<span className="text-fg-3">⌕</span>}
            placeholder={t('Search domains...')}
            allowClear
            value={searchText}
            onChange={(e) => setParams({ q: e.target.value || null })}
            className="max-w-[260px] min-w-[180px] flex-1"
          />
          {(tab === 'tag' || tagFilter.length > 0) && (
            <Select
              mode="multiple"
              allowClear
              autoFocus={tab === 'tag'}
              placeholder={t('Filter by tag')}
              value={tagFilter}
              onChange={setTagFilter}
              options={allTags.map((tag) => ({ value: tag, label: tag }))}
              className="min-w-[180px]"
            />
          )}
        </div>

        {isLoading ? (
          <div className="flex flex-col gap-[14px] py-3" data-testid="domains-skeleton">
            {Array.from({ length: 8 }).map((_, i) => (
              <SkeletonLine key={i} width={`${88 - (i % 4) * 9}%`} />
            ))}
          </div>
        ) : (
          <>
            {/* Mobile selection mode: pickable rows (.mrow.pick) instead of the table */}
            {selectionMode && (
              <div className="lg:hidden">
                {filtered.map((zone) => {
                  const on = selection.selectedSet.has(zone.id)
                  return (
                    <button
                      key={zone.id}
                      type="button"
                      onClick={() => selection.toggle(zone.id)}
                      className={`flex w-full cursor-pointer items-center gap-[11px] border-0 border-b border-solid border-stroke-2 px-[3px] py-[9px] text-left ${
                        on ? 'bg-bg-sel' : 'bg-transparent'
                      }`}
                    >
                      <span
                        aria-hidden
                        className={`grid h-[16px] w-[16px] flex-none place-items-center rounded-[4px] border border-solid text-[11px] leading-none ${
                          on ? 'border-accent bg-accent text-white' : 'border-stroke bg-bg text-transparent'
                        }`}
                      >
                        ✓
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-mono text-[12.5px] font-medium text-fg">
                          {zone.name}
                        </span>
                        <span className="mt-[3px] block truncate font-mono text-[11px] text-fg-3">
                          {[zone.plan, zone.status, zone.sslMode ? `ssl ${zone.sslMode}` : null]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </span>
                    </button>
                  )
                })}
                {filtered.length === 0 && (
                  <EmptyState icon="◈" title={t('No domains')} desc={t('No domains match the current filter')} />
                )}
              </div>
            )}

            <div className={selectionMode ? 'hidden lg:block' : undefined}>
              <Table
                dataSource={filtered}
                rowKey="id"
                columns={columns}
                rowClassName="hover-row"
                onRow={(record) => ({ onClick: () => navigate(`/domains/${record.id}`) })}
                rowSelection={{
                  selectedRowKeys: selection.selected,
                  preserveSelectedRowKeys: true,
                  onChange: (keys: Key[]) => selection.setSelected(keys as string[]),
                }}
                locale={{
                  emptyText: (
                    <EmptyState
                      icon="◈"
                      title={t('No domains')}
                      desc={
                        searchText || tagFilter.length > 0 || tab !== 'all'
                          ? t('No domains match the current filter')
                          : t('Add your first domain to get started')
                      }
                      actions={
                        <Button type="primary" size="small" onClick={() => setParams({ modal: 'add' })}>
                          + {t('Add domain')}
                        </Button>
                      }
                    />
                  ),
                }}
                pagination={{
                  pageSize: 20,
                  showSizeChanger: true,
                  showTotal: (total) => t('Total {{total}} domains', { total }),
                }}
                scroll={{ x: 'max-content' }}
              />
            </div>
          </>
        )}
      </div>

      <BulkActionBar count={selection.selected.length} onClear={selection.clear}>
        {barActions}
      </BulkActionBar>

      <ConfirmDestructive
        open={activeModal === 'delete'}
        title={t('Delete {{count}} zones from Cloudflare?', { count: selection.selected.length })}
        items={selectedZones.map((z) => ({ key: z.id, label: z.name, meta: z.status }))}
        explanation={t(
          'All DNS records, page rules and cache configuration of these zones will be permanently deleted on Cloudflare. Websites will stop working if their nameservers still point to Cloudflare.',
        )}
        confirmText={deleteConfirmText}
        loading={bulkMutation.isPending}
        onConfirm={() => bulkMutation.mutate({ action: 'delete' })}
        onCancel={() => setParams({ modal: null })}
      />

      <BulkProgressModal
        jobId={jobId}
        open={!!jobId}
        onClose={closeBulkJob}
        renderDone={(job) =>
          job.type === 'create-zones' || job.type === 'clone-domain' ? <CreateZonesDone job={job} /> : null
        }
      />
      </div>

      <AddDomainPanel
        open={activeModal === 'add'}
        form={form}
        saving={createMutation.isPending}
        onClose={closeAddPanel}
        onFinish={(values) => createMutation.mutate(values.name.trim())}
      />

      <AssignTagsPanel
        open={activeModal === 'tags'}
        count={selection.selected.length}
        allTags={allTags}
        value={tagsToAssign}
        onChange={setTagsToAssign}
        saving={assignTagsMutation.isPending}
        onClose={closeTagsPanel}
        onAssign={() => assignTagsMutation.mutate(tagsToAssign)}
      />

      <BulkAddDomainsPanel
        open={activeModal === 'bulk-add'}
        onClose={() => setParams({ modal: null })}
        onJobCreated={(id) => setParams({ modal: null, job: id })}
      />

      <BulkDnsReplacePanel
        open={activeModal === 'bulk-dns'}
        onClose={() => setParams({ modal: null })}
        zoneIds={selection.selected}
        zoneNames={Object.fromEntries(domains.map((d) => [d.id, d.name]))}
      />

      <CopyConfigPanel
        open={activeModal === 'copy-config'}
        zones={domains}
        initialSourceZoneId={copySourceId}
        initialTargetIds={selection.selected}
        onClose={() => {
          setCopySourceId(null)
          setParams({ modal: null })
        }}
        onJobCreated={(id) => {
          setCopySourceId(null)
          setParams({ modal: null, job: id })
          selection.clear()
        }}
      />

      <CloneDomainPanel
        source={cloneSource}
        onClose={() => setCloneSource(null)}
        onJobCreated={(id) => {
          setCloneSource(null)
          setParams({ job: id })
        }}
      />
    </div>
  )
}

function AddDomainPanel({
  open,
  form,
  saving,
  onClose,
  onFinish,
}: {
  open: boolean
  form: FormInstance<{ name: string }>
  saving: boolean
  onClose: () => void
  onFinish: (values: { name: string }) => void
}) {
  const { t } = useTranslation()
  return (
    <DetailPanel
      open={open}
      title={t('Add new domain')}
      onClose={onClose}
      footer={
        <span className="ml-auto flex gap-2">
          <Button onClick={onClose}>{t('Cancel')}</Button>
          <Button type="primary" loading={saving} onClick={() => form.submit()}>
            {t('Add')}
          </Button>
        </span>
      }
    >
      <Form form={form} layout="vertical" onFinish={onFinish}>
        <Form.Item
          label={t('Domain name')}
          name="name"
          rules={[
            { required: true, message: t('Please enter a domain name') },
            {
              pattern: /^([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/,
              message: t('Invalid domain name (e.g. example.com)'),
            },
          ]}
        >
          <Input placeholder="example.com" size="large" />
        </Form.Item>
      </Form>
    </DetailPanel>
  )
}

function AssignTagsPanel({
  open,
  count,
  allTags,
  value,
  onChange,
  saving,
  onClose,
  onAssign,
}: {
  open: boolean
  count: number
  allTags: string[]
  value: string[]
  onChange: (tags: string[]) => void
  saving: boolean
  onClose: () => void
  onAssign: () => void
}) {
  const { t } = useTranslation()
  return (
    <DetailPanel
      open={open}
      title={t('Assign tags')}
      onClose={onClose}
      footer={
        <span className="ml-auto flex gap-2">
          <Button onClick={onClose}>{t('Cancel')}</Button>
          <Button type="primary" loading={saving} disabled={value.length === 0} onClick={onAssign}>
            {t('Assign')}
          </Button>
        </span>
      }
    >
      <p className="mt-0 mb-2 text-[12.5px] text-fg-2">
        {t('Tags will be added to the {{count}} selected domain(s).', { count })}
      </p>
      <Select
        mode="tags"
        style={{ width: '100%' }}
        placeholder={t('Choose or type new tags')}
        value={value}
        onChange={onChange}
        options={allTags.map((tag) => ({ value: tag, label: tag }))}
      />
    </DetailPanel>
  )
}
