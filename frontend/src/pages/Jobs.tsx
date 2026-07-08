import { useQuery } from '@tanstack/react-query'
import { Card, Table, Tag, Typography, Button, Space, Progress } from 'antd'
import { EyeOutlined, ReloadOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../services/api'
import type { BulkJob } from '../hooks/useJobPolling'
import BulkProgressModal from '../components/BulkProgressModal'

const { Title, Text } = Typography

const TYPE_LABELS: Record<string, string> = {
  'bulk-purge': 'Bulk purge cache job',
  'bulk-delete': 'Bulk delete domains job',
  'create-zones': 'Bulk create domains job',
  'dns-replace': 'Bulk DNS replace job',
  'apply-template': 'Apply template job',
}

const STATUS_TAG: Record<BulkJob['status'], { color: string; label: string }> = {
  running: { color: 'processing', label: 'Running' },
  done: { color: 'success', label: 'Done' },
  interrupted: { color: 'warning', label: 'Interrupted' },
}

export default function Jobs() {
  const { t, i18n } = useTranslation()
  const dateLocale = i18n.language === 'vi' ? 'vi-VN' : 'en-US'
  const [searchParams, setSearchParams] = useSearchParams()
  const jobId = searchParams.get('job')

  const setJobParam = (id: string | null) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (id) next.set('job', id)
        else next.delete('job')
        return next
      },
      { replace: true },
    )
  }

  const { data: jobs = [], isLoading, refetch, isFetching } = useQuery<BulkJob[]>({
    queryKey: ['jobs'],
    queryFn: async () => (await api.get('/jobs')).data,
  })

  const columns: ColumnsType<BulkJob> = [
    {
      title: t('Type'),
      dataIndex: 'type',
      render: (type: string) => t(TYPE_LABELS[type] || type),
    },
    {
      title: t('Status'),
      dataIndex: 'status',
      width: 130,
      render: (status: BulkJob['status']) => {
        const cfg = STATUS_TAG[status]
        return <Tag color={cfg.color} bordered={false}>{t(cfg.label)}</Tag>
      },
    },
    {
      title: t('Progress'),
      key: 'progress',
      width: 220,
      render: (_: unknown, job: BulkJob) => (
        <Space direction="vertical" size={0} style={{ width: '100%' }}>
          <Progress
            percent={job.total > 0 ? Math.round((job.processed / job.total) * 100) : 0}
            size="small"
            status={job.status === 'running' ? 'active' : job.failed > 0 || job.status === 'interrupted' ? 'exception' : 'success'}
          />
          <Text type="secondary" style={{ fontSize: 12 }}>
            {t('{{succeeded}} succeeded / {{failed}} failed / {{total}} items', { succeeded: job.succeeded, failed: job.failed, total: job.total })}
          </Text>
        </Space>
      ),
    },
    {
      title: t('Started'),
      dataIndex: 'createdAt',
      width: 170,
      render: (v: number) => new Date(v).toLocaleString(dateLocale),
    },
    {
      title: t('Finished'),
      dataIndex: 'finishedAt',
      width: 170,
      render: (v?: number) => (v ? new Date(v).toLocaleString(dateLocale) : <Text type="secondary">—</Text>),
    },
    {
      title: '',
      key: 'actions',
      width: 120,
      render: (_: unknown, job: BulkJob) => (
        <Button size="small" icon={<EyeOutlined />} onClick={() => setJobParam(job.id)}>
          {t('Details')}
        </Button>
      ),
    },
  ]

  return (
    <div style={{ padding: 24 }}>
      <div className="page-header">
        <Title level={2} style={{ fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 4 }}>
          {t('Jobs history')}
        </Title>
        <Text type="secondary">{t('Results of bulk operations (purge, delete, create domains, DNS replace, apply template)')}</Text>
      </div>
      <Card>
        <Button
          icon={<ReloadOutlined />}
          onClick={() => refetch()}
          loading={isFetching}
          style={{ marginBottom: 16 }}
        >
          {t('Refresh')}
        </Button>
        <Table
          loading={isLoading}
          dataSource={jobs}
          rowKey="id"
          columns={columns}
          pagination={{ pageSize: 20, hideOnSinglePage: true }}
        />
      </Card>

      <BulkProgressModal jobId={jobId} open={!!jobId} onClose={() => setJobParam(null)} />
    </div>
  )
}
