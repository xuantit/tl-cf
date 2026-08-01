import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { RollbackOutlined } from '@ant-design/icons'
import { Button, Modal, Popconfirm, Table, Typography } from 'antd'
import { message } from '../../lib/antdApp'
import type { ColumnsType } from 'antd/es/table'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { api } from '../../services/api'
import { EmptyState, SkeletonLine, Tag } from '../ui'
import type { TagVariant } from '../ui'
import { CodeChunk, DayHeader, TimelineRow } from './Timeline'
import { groupByDay } from '../../utils/timeline'

const { Text } = Typography

interface ChangeItem {
  id: string
  resourceType: string
  resourceId: string
  before: unknown
  after: unknown
  status: string
  error: string | null
}

interface ChangeSet {
  id: string
  ownerId: string
  accountId: string | null
  zoneId: string | null
  action: string
  status: string
  reversible: boolean
  jobId: string | null
  createdAt: string
  finishedAt: string | null
  items: ChangeItem[]
}

interface RollbackOperation {
  resourceType: string
  resourceId: string
  action: string
  before?: unknown
  after?: unknown
  status: string
}

interface RollbackPreview {
  id: string
  action: string
  reversible: boolean
  itemCount: number
  operations: RollbackOperation[]
}

const STATUS_VARIANT: Record<string, TagVariant> = {
  done: 'ok',
  pending: 'info',
  failed: 'err',
  rollback_requested: 'warn',
  rolled_back: 'default',
  rollback_failed: 'err',
}

export default function ChangesPanel() {
  const { t, i18n } = useTranslation()
  const dateLocale = i18n.language === 'vi' ? 'vi-VN' : 'en-US'
  const qc = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedId = searchParams.get('change')
  const zoneFilter = searchParams.get('zone') || undefined

  const setChangeParam = (id: string | null) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (id) next.set('change', id)
        else next.delete('change')
        return next
      },
      { replace: true },
    )
  }

  const clearZoneFilter = () => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('zone')
        return next
      },
      { replace: true },
    )
  }

  const { data: changes = [], isLoading, refetch, isFetching } = useQuery<ChangeSet[]>({
    queryKey: ['changes', zoneFilter],
    queryFn: async () =>
      (await api.get('/changes', { params: zoneFilter ? { zoneId: zoneFilter } : {} })).data,
  })

  const { data: selected } = useQuery<ChangeSet>({
    queryKey: ['change', selectedId],
    queryFn: async () => (await api.get(`/changes/${selectedId}`)).data,
    enabled: !!selectedId,
  })

  const { data: preview } = useQuery<RollbackPreview>({
    queryKey: ['change-preview', selectedId],
    queryFn: async () => (await api.post(`/changes/${selectedId}/rollback-preview`)).data,
    enabled: !!selectedId && !!selected?.reversible,
    retry: false,
  })

  const rollback = useMutation({
    mutationFn: async (id: string) => (await api.post(`/changes/${id}/rollback`)).data,
    onSuccess: (data: { status: string }) => {
      qc.invalidateQueries({ queryKey: ['changes'] })
      qc.invalidateQueries({ queryKey: ['change', selectedId] })
      if (data.status === 'rolled_back') message.success(t('Rollback completed'))
      else if (data.status === 'rollback_failed') message.warning(t('Rollback finished with errors'))
      else message.info(t('Rollback requested'))
    },
    onError: (e: { response?: { data?: { detail?: string } } }) =>
      message.error(e?.response?.data?.detail || t('Failed to rollback')),
  })

  const itemColumns: ColumnsType<ChangeItem> = [
    { title: t('Resource'), dataIndex: 'resourceType', width: 150 },
    { title: 'ID', dataIndex: 'resourceId', width: 160, render: (v: string) => <code style={{ fontSize: 12 }}>{v}</code> },
    {
      title: t('Before'),
      dataIndex: 'before',
      render: (v: unknown) => (
        <pre style={{ margin: 0, fontSize: 11, maxWidth: 260, overflow: 'auto' }}>{v ? JSON.stringify(v, null, 2) : '—'}</pre>
      ),
    },
    {
      title: t('After'),
      dataIndex: 'after',
      render: (v: unknown) => (
        <pre style={{ margin: 0, fontSize: 11, maxWidth: 260, overflow: 'auto' }}>{v ? JSON.stringify(v, null, 2) : '—'}</pre>
      ),
    },
  ]

  const groups = groupByDay(changes, (change) => change.createdAt)

  return (
    <>
      <div className="flex items-center justify-end gap-2 pb-2">
        {zoneFilter && (
          <Tag variant="info">
            {t('Zone')}: {zoneFilter}
            <span
              className="ml-1 cursor-pointer"
              role="button"
              aria-label={t('Clear zone filter')}
              onClick={clearZoneFilter}
            >
              ✕
            </span>
          </Tag>
        )}
        <Button size="small" type="text" onClick={() => refetch()} loading={isFetching}>
          ↻ {t('Refresh')}
        </Button>
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-[14px] p-4" data-testid="changes-skeleton">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonLine key={i} width={`${88 - (i % 3) * 12}%`} />
          ))}
        </div>
      ) : changes.length === 0 ? (
        <EmptyState icon="◷" title={t('No changes yet')} desc={t('DNS and settings changes will appear here')} />
      ) : (
        groups.map((group) => (
          <div key={group.date}>
            <DayHeader group={group} />
            {group.items.map((change) => (
              <TimelineRow
                key={change.id}
                time={change.createdAt}
                title={
                  <>
                    <CodeChunk>{change.action}</CodeChunk>
                    {change.zoneId ? <span className="ml-2 font-mono text-[11px] text-fg-3">{change.zoneId}</span> : null}
                  </>
                }
                meta={new Date(change.createdAt).toLocaleString(dateLocale)}
                right={
                  <>
                    <Tag variant={STATUS_VARIANT[change.status] || 'default'}>{t(change.status)}</Tag>
                    {change.reversible && (
                      <Button
                        size="small"
                        type="text"
                        onClick={(e) => {
                          e.stopPropagation()
                          setChangeParam(change.id)
                        }}
                      >
                        ↺ {t('rollback')}
                      </Button>
                    )}
                  </>
                }
                onClick={() => setChangeParam(change.id)}
              />
            ))}
          </div>
        ))
      )}

      <Modal
        open={!!selectedId}
        title={selected ? `${selected.action}` : t('Change details')}
        width={860}
        style={{ maxWidth: '95vw' }}
        onCancel={() => setChangeParam(null)}
        footer={[
          <Button key='close' onClick={() => setChangeParam(null)}>
            {t('Close')}
          </Button>,
          selected?.reversible ? (
            <Popconfirm
              key='rollback'
              title={t('Roll back this change?')}
              okText={t('Rollback')}
              cancelText={t('Cancel')}
              onConfirm={() => selected && rollback.mutate(selected.id)}
            >
              <Button type='primary' danger icon={<RollbackOutlined />} loading={rollback.isPending}>
                {t('Rollback')}
              </Button>
            </Popconfirm>
          ) : null,
        ]}
      >
        {selected && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <Tag variant={STATUS_VARIANT[selected.status] || 'default'}>{t(selected.status)}</Tag>
              <Tag variant={selected.reversible ? 'ok' : 'default'}>
                {selected.reversible ? t('Reversible') : t('Not reversible')}
              </Tag>
              {selected.zoneId ? <Text type='secondary'>zone: {selected.zoneId}</Text> : null}
            </div>

            {selected.reversible && preview && (
              <div className="rounded-md border border-solid border-stroke">
                <div className="border-0 border-b border-solid border-stroke bg-bg-side px-3 py-2 font-mono text-[11px] uppercase tracking-[.08em] text-fg-3">
                  {t('Rollback preview')} · {t('{{count}} operation(s) will be applied', { count: preview.itemCount })}
                </div>
                <div className="flex flex-col">
                  {preview.operations.map((op, index) => (
                    <div
                      key={index}
                      className="border-0 border-b border-solid border-stroke-2 px-3 py-[6px] font-mono text-[11px] text-fg-2 last:border-b-0"
                    >
                      {op.action} — <CodeChunk>{op.resourceType}</CodeChunk> {op.resourceId}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Table
              size='small'
              dataSource={selected.items}
              rowKey='id'
              columns={itemColumns}
              pagination={false}
              scroll={{ x: 'max-content' }}
            />
          </div>
        )}
      </Modal>
    </>
  )
}
