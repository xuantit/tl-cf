import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Dropdown, Table } from 'antd'
import { message } from '../../lib/antdApp'
import type { ColumnsType } from 'antd/es/table'
import type { Key } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import BulkActionBar, { BulkActionButton } from '../../components/BulkActionBar'
import ConfirmDestructive from '../../components/ConfirmDestructive'
import DnsRecordDrawer from '../../components/dns/DnsRecordDrawer'
import { EmptyState, SectionHeader, SkeletonLine, Tag } from '../../components/ui'
import type { TagVariant } from '../../components/ui'
import { api, apiErrorDetail } from '../../services/api'
import type { DnsRecord, DnsRecordInput } from '../../types/domain'

const PROXYABLE_TYPES = new Set(['A', 'AAAA', 'CNAME'])

function typeVariant(type: string): TagVariant {
  if (type === 'A' || type === 'AAAA') return 'info'
  if (type === 'MX') return 'warn'
  return 'default'
}

export default function DnsTab({ zoneId, zoneName }: { zoneId: string; zoneName?: string }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [selected, setSelected] = useState<string[]>([])
  // ids pending deletion — a single-record delete from the row menu also flows through here
  const [deleteIds, setDeleteIds] = useState<string[]>([])

  const activeModal = searchParams.get('modal')
  const editId = searchParams.get('edit')

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

  const { data: records = [], isLoading } = useQuery<DnsRecord[]>({
    queryKey: ['dns', zoneId],
    queryFn: async () => (await api.get(`/domains/${zoneId}/dns`)).data,
    enabled: !!zoneId,
  })

  const editingRecord =
    activeModal === 'dns-edit' ? (records.find((r) => r.id === editId) ?? null) : null
  const drawerOpen = activeModal === 'dns-add' || (activeModal === 'dns-edit' && !!editingRecord)

  const invalidate = () => qc.invalidateQueries({ queryKey: ['dns', zoneId] })

  const saveRecord = useMutation({
    mutationFn: async ({ recordId, data }: { recordId: string | null; data: DnsRecordInput }) =>
      recordId
        ? (await api.put(`/domains/${zoneId}/dns/${recordId}`, data)).data
        : (await api.post(`/domains/${zoneId}/dns`, data)).data,
    onSuccess: (_data, variables) => {
      invalidate()
      message.success(variables.recordId ? t('DNS record updated') : t('DNS record created'))
    },
    onError: (error) => {
      message.error(apiErrorDetail(error) || t('Could not save DNS record'))
    },
  })

  const deleteRecords = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(ids.map((id) => api.delete(`/domains/${zoneId}/dns/${id}`)))
    },
    onSuccess: (_data, ids) => {
      invalidate()
      setDeleteIds([])
      setSelected((prev) => prev.filter((id) => !ids.includes(id)))
      message.success(t('{{count}} DNS record(s) deleted', { count: ids.length }))
    },
    onError: (error) => {
      invalidate()
      message.error(apiErrorDetail(error) || t('Could not delete DNS records'))
    },
  })

  const toggleProxy = useMutation({
    mutationFn: async (ids: string[]) => {
      const targets = records.filter((r) => ids.includes(r.id) && PROXYABLE_TYPES.has(r.type))
      await Promise.all(
        targets.map((r) =>
          api.put(`/domains/${zoneId}/dns/${r.id}`, {
            type: r.type,
            name: r.name,
            content: r.content,
            ttl: r.ttl,
            proxied: !r.proxied,
            ...(r.priority !== undefined ? { priority: r.priority } : {}),
          }),
        ),
      )
      return targets.length
    },
    onSuccess: (count) => {
      invalidate()
      if (count === 0) message.info(t('None of the selected records support proxy'))
      else message.success(t('Proxy toggled on {{count}} record(s)', { count }))
    },
    onError: (error) => {
      invalidate()
      message.error(apiErrorDetail(error) || t('Could not toggle proxy'))
    },
  })

  const columns: ColumnsType<DnsRecord> = [
    {
      title: t('Type'),
      dataIndex: 'type',
      key: 'type',
      width: 80,
      render: (type: string) => <Tag variant={typeVariant(type)}>{type}</Tag>,
    },
    {
      title: t('Name'),
      dataIndex: 'name',
      key: 'name',
      render: (name: string) => {
        const short =
          zoneName && name.endsWith(`.${zoneName}`)
            ? name.slice(0, -zoneName.length - 1)
            : zoneName && name === zoneName
              ? '@'
              : name
        return <span className="font-mono text-[12px] font-medium text-fg">{short}</span>
      },
    },
    {
      title: t('Content'),
      dataIndex: 'content',
      key: 'content',
      ellipsis: true,
      render: (content: string) => (
        <span className="font-mono text-[11.5px] text-fg-2" title={content}>
          {content}
        </span>
      ),
    },
    {
      title: 'TTL',
      dataIndex: 'ttl',
      key: 'ttl',
      width: 80,
      render: (ttl: number) => (
        <span className="font-mono text-[11.5px] text-fg-2">{ttl === 1 ? 'auto' : ttl}</span>
      ),
    },
    {
      title: 'Proxy',
      dataIndex: 'proxied',
      key: 'proxied',
      width: 100,
      render: (proxied: boolean | undefined) =>
        proxied ? <Tag variant="acc">proxied</Tag> : <Tag>dns only</Tag>,
    },
    {
      title: 'Prio',
      dataIndex: 'priority',
      key: 'priority',
      width: 60,
      render: (priority?: number) =>
        priority !== undefined ? (
          <span className="font-mono text-[11.5px] text-fg-2">{priority}</span>
        ) : (
          <span className="text-fg-3">—</span>
        ),
    },
    {
      title: '',
      key: 'menu',
      width: 44,
      align: 'right',
      render: (_: unknown, record: DnsRecord) => (
        <Dropdown
          trigger={['click']}
          menu={{
            items: [
              { key: 'edit', label: t('Edit') },
              { key: 'delete', label: t('Delete'), danger: true },
            ],
            onClick: ({ key }) => {
              if (key === 'edit') setParams({ modal: 'dns-edit', edit: record.id })
              else setDeleteIds([record.id])
            },
          }}
        >
          <button
            type="button"
            aria-label={t('Record actions')}
            className="cursor-pointer border-0 bg-transparent px-1 text-[13px] text-fg-3 hover:text-fg"
          >
            ⋯
          </button>
        </Dropdown>
      ),
    },
  ]

  const deleteTargets = records.filter((r) => deleteIds.includes(r.id))
  const deleteConfirmText = t('delete {{count}} record', { count: deleteIds.length })

  return (
    <>
      <SectionHeader
        title={`${t('DNS records')} · ${records.length}`}
        actions={<Tag>zone {zoneId.slice(0, 12)}</Tag>}
      />

      {isLoading ? (
        <div className="flex flex-col gap-[14px] py-3" data-testid="dns-skeleton">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonLine key={i} width={`${90 - (i % 3) * 12}%`} />
          ))}
        </div>
      ) : (
        <Table
          dataSource={records}
          rowKey="id"
          columns={columns}
          rowSelection={{
            selectedRowKeys: selected,
            onChange: (keys: Key[]) => setSelected(keys as string[]),
          }}
          locale={{
            emptyText: (
              <EmptyState
                icon="⊞"
                title={t('No DNS records')}
                desc={t('Add the first record for this zone')}
              />
            ),
          }}
          pagination={records.length > 50 ? { pageSize: 50 } : false}
          scroll={{ x: 'max-content' }}
        />
      )}

      <BulkActionBar count={selected.length} unit={t('record')} onClear={() => setSelected([])}>
        <BulkActionButton
          variant="primary"
          disabled={toggleProxy.isPending}
          onClick={() => toggleProxy.mutate(selected)}
        >
          ◐ {t('Toggle proxy')}
        </BulkActionButton>
        <BulkActionButton variant="danger" onClick={() => setDeleteIds(selected)}>
          ▢ {t('Delete')}
        </BulkActionButton>
      </BulkActionBar>

      <ConfirmDestructive
        open={deleteIds.length > 0}
        title={t('Delete {{count}} DNS record(s)?', { count: deleteIds.length })}
        items={deleteTargets.map((r) => ({
          key: r.id,
          label: `${r.type} ${r.name}`,
          meta: r.content.length > 24 ? `${r.content.slice(0, 24)}…` : r.content,
        }))}
        explanation={t('The records will be removed from Cloudflare DNS immediately.')}
        confirmText={deleteConfirmText}
        loading={deleteRecords.isPending}
        onConfirm={() => deleteRecords.mutate(deleteIds)}
        onCancel={() => setDeleteIds([])}
      />

      <DnsRecordDrawer
        open={drawerOpen}
        zoneName={zoneName}
        initialValues={editingRecord}
        saving={saveRecord.isPending}
        onSubmit={async (values, again) => {
          await saveRecord.mutateAsync({ recordId: editingRecord?.id ?? null, data: values })
          if (!again) setParams({ modal: null, edit: null })
        }}
        onClose={() => setParams({ modal: null, edit: null })}
      />
    </>
  )
}
