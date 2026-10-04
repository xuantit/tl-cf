import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { EyeOutlined, ReloadOutlined, RollbackOutlined } from '@ant-design/icons'
import { Button, Card, Modal, Popconfirm, Space, Table, Tag, Typography, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { api } from '../../services/api'

const { Text, Paragraph } = Typography

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

const STATUS_COLOR: Record<string, string> = {
  done: 'success',
  pending: 'processing',
  failed: 'error',
  rollback_requested: 'warning',
  rolled_back: 'default',
  rollback_failed: 'error',
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

  const columns: ColumnsType<ChangeSet> = [
    {
      title: t('Action'),
      dataIndex: 'action',
      render: (value: string) => <code>{value}</code>,
    },
    {
      title: t('Zone'),
      dataIndex: 'zoneId',
      render: (value: string | null) => value || <Text type='secondary'>—</Text>,
    },
    {
      title: t('Status'),
      dataIndex: 'status',
      width: 160,
      render: (status: string) => (
        <Tag color={STATUS_COLOR[status] || 'default'} variant="filled">
          {t(status)}
        </Tag>
      ),
    },
    {
      title: t('Reversible'),
      dataIndex: 'reversible',
      width: 120,
      render: (value: boolean) => (
        <Tag color={value ? 'success' : 'default'} variant="filled">
          {value ? t('Yes') : t('No')}
        </Tag>
      ),
    },
    {
      title: t('Created'),
      dataIndex: 'createdAt',
      width: 180,
      render: (v: string) => new Date(v).toLocaleString(dateLocale),
    },
    {
      title: '',
      key: 'actions',
      width: 120,
      render: (_v, record) => (
        <Button size='small' icon={<EyeOutlined />} onClick={() => setChangeParam(record.id)}>
          {t('Details')}
        </Button>
      ),
    },
  ]

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

  return (
    <>
      <Card>
        <Space style={{ marginBottom: 16 }} wrap>
          <Button icon={<ReloadOutlined />} onClick={() => refetch()} loading={isFetching}>
            {t('Refresh')}
          </Button>
          {zoneFilter && (
            <Tag closable onClose={clearZoneFilter} color="blue">
              {t('Zone')}: {zoneFilter}
            </Tag>
          )}
        </Space>
        <Table loading={isLoading} dataSource={changes} rowKey='id' columns={columns} scroll={{ x: 'max-content' }} />
      </Card>

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
          <Space orientation='vertical' size='middle' style={{ width: '100%' }}>
            <Space wrap>
              <Tag color={STATUS_COLOR[selected.status] || 'default'} variant="filled">{t(selected.status)}</Tag>
              <Tag color={selected.reversible ? 'success' : 'default'} variant="filled">
                {selected.reversible ? t('Reversible') : t('Not reversible')}
              </Tag>
              {selected.zoneId ? <Text type='secondary'>zone: {selected.zoneId}</Text> : null}
            </Space>

            {selected.reversible && preview && (
              <Card size='small' title={t('Rollback preview')}>
                <Paragraph type='secondary' style={{ marginBottom: 8 }}>
                  {t('{{count}} operation(s) will be applied', { count: preview.itemCount })}
                </Paragraph>
                <Space orientation='vertical' size={4} style={{ width: '100%' }}>
                  {preview.operations.map((op, index) => (
                    <Text key={index} style={{ fontSize: 12 }}>
                      • {op.action} — <code>{op.resourceType}</code> {op.resourceId}
                    </Text>
                  ))}
                </Space>
              </Card>
            )}

            <Table
              size='small'
              dataSource={selected.items}
              rowKey='id'
              columns={itemColumns}
              pagination={false}
              scroll={{ x: 'max-content' }}
            />
          </Space>
        )}
      </Modal>
    </>
  )
}
