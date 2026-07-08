import { Modal, Progress, Table, Tag, Space, Statistic, Row, Col, Typography, Alert } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useJobPolling, type BulkJob, type BulkJobItem } from '../hooks/useJobPolling'

const { Text } = Typography

const STATUS_TAG: Record<BulkJobItem['status'], { color: string; label: string }> = {
  pending: { color: 'default', label: 'Waiting' },
  running: { color: 'processing', label: 'Running' },
  success: { color: 'success', label: 'Success' },
  error: { color: 'error', label: 'Error' },
}

const TYPE_TITLES: Record<string, string> = {
  'bulk-purge': 'Purging cache in bulk',
  'bulk-delete': 'Deleting domains in bulk',
  'create-zones': 'Creating domains in bulk',
  'dns-replace': 'Replacing DNS in bulk',
  'apply-template': 'Applying template',
}

interface BulkProgressModalProps {
  jobId: string | null
  open: boolean
  onClose: () => void
  title?: string
  /** Render extra content when the job is done (e.g. result table) */
  renderDone?: (job: BulkJob) => ReactNode
}

export default function BulkProgressModal({ jobId, open, onClose, title, renderDone }: BulkProgressModalProps) {
  const { t } = useTranslation()
  const { data: job, isError } = useJobPolling(open ? jobId : null)

  const percent = job && job.total > 0 ? Math.round((job.processed / job.total) * 100) : 0
  const isDone = job != null && job.status !== 'running'
  const resolvedTitle = title || (job && TYPE_TITLES[job.type] && t(TYPE_TITLES[job.type])) || t('Bulk operation progress')

  const columns: ColumnsType<BulkJobItem> = [
    {
      title: t('Item'),
      key: 'label',
      render: (_: unknown, record: BulkJobItem) => <Text>{record.label || record.key}</Text>,
    },
    {
      title: t('Status'),
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (status: BulkJobItem['status']) => {
        const cfg = STATUS_TAG[status]
        return <Tag color={cfg.color}>{t(cfg.label)}</Tag>
      },
    },
    {
      title: t('Error'),
      dataIndex: 'error',
      key: 'error',
      render: (error?: string) => (error ? <Text type="danger">{error}</Text> : null),
    },
  ]

  return (
    <Modal
      title={resolvedTitle}
      open={open}
      onCancel={onClose}
      footer={null}
      width={720}
      maskClosable={isDone}
      destroyOnClose
    >
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        {isError && (
          <Alert
            type="warning"
            showIcon
            message={t('Job not found')}
            description={t('The job does not exist or you do not have permission to view it. Check older jobs in the Jobs history page.')}
          />
        )}
        {job?.status === 'interrupted' && (
          <Alert
            type="warning"
            showIcon
            message={t('Job interrupted')}
            description={t('The server restarted while the job was running. Unprocessed items will not continue — review and re-run if needed.')}
          />
        )}
        <Progress
          percent={percent}
          status={isDone ? (job && (job.failed > 0 || job.status === 'interrupted') ? 'exception' : 'success') : 'active'}
        />
        {job && (
          <Row gutter={16}>
            <Col span={8}>
              <Statistic title={t('Total')} value={job.total} />
            </Col>
            <Col span={8}>
              <Statistic title={t('Success')} value={job.succeeded} valueStyle={{ color: '#52c41a' }} />
            </Col>
            <Col span={8}>
              <Statistic title={t('Error')} value={job.failed} valueStyle={{ color: job.failed ? '#ff4d4f' : undefined }} />
            </Col>
          </Row>
        )}
        <Table
          dataSource={job?.items || []}
          rowKey="key"
          columns={columns}
          size="small"
          pagination={{ pageSize: 10, hideOnSinglePage: true }}
        />
        {isDone && job && renderDone?.(job)}
      </Space>
    </Modal>
  )
}
