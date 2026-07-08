import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Modal, Form, Select, Input, Switch, Steps, Table, Button, Space, Typography, Popconfirm, Empty, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { Key } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../../services/api'

const { Text } = Typography

interface PreviewRecord {
  zoneId: string
  recordId: string
  type: string
  name: string
  content: string
  ttl: number
  proxied?: boolean
  priority?: number
}

interface BulkDnsReplaceModalProps {
  open: boolean
  onClose: () => void
  onJobCreated: (jobId: string) => void
  zoneIds: string[]
  zoneNames: Record<string, string>
}

interface ConditionValues {
  recordType?: string
  matchContent?: string
  matchName?: string
  newContent: string
  setProxied?: boolean
}

export default function BulkDnsReplaceModal({ open, onClose, onJobCreated, zoneIds, zoneNames }: BulkDnsReplaceModalProps) {
  const { t } = useTranslation()
  const [form] = Form.useForm<ConditionValues>()
  const [step, setStep] = useState(0)
  const [matches, setMatches] = useState<PreviewRecord[]>([])
  const [selectedKeys, setSelectedKeys] = useState<string[]>([])

  const previewMutation = useMutation({
    mutationFn: async (values: ConditionValues) =>
      (
        await api.post('/domains/bulk-dns/preview', {
          zoneIds,
          recordType: values.recordType || undefined,
          matchContent: values.matchContent?.trim() || undefined,
          matchName: values.matchName?.trim() || undefined,
        })
      ).data as { matches: PreviewRecord[]; total: number },
    onSuccess: (data) => {
      setMatches(data.matches)
      setSelectedKeys(data.matches.map((m) => `${m.zoneId}:${m.recordId}`))
      setStep(1)
      if (data.total === 0) message.info(t('No matching records found'))
    },
    onError: (error: any) => message.error(error.response?.data?.detail || t('Could not preview')),
  })

  const replaceMutation = useMutation({
    mutationFn: async () => {
      const values = form.getFieldsValue(true) as ConditionValues
      const selected = matches.filter((m) => selectedKeys.includes(`${m.zoneId}:${m.recordId}`))
      return (
        await api.post('/domains/bulk-dns/replace', {
          records: selected.map((m) => ({
            zoneId: m.zoneId,
            recordId: m.recordId,
            type: m.type,
            name: m.name,
            ttl: m.ttl,
            proxied: m.proxied,
            priority: m.priority,
          })),
          newContent: values.newContent.trim(),
          proxied: values.setProxied,
        })
      ).data as { jobId: string }
    },
    onSuccess: (data) => {
      reset()
      onJobCreated(data.jobId)
    },
    onError: (error: any) => message.error(error.response?.data?.detail || t('Could not apply changes')),
  })

  function reset() {
    form.resetFields()
    setStep(0)
    setMatches([])
    setSelectedKeys([])
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const newContent = Form.useWatch('newContent', form)

  const columns: ColumnsType<PreviewRecord> = [
    {
      title: 'Domain',
      dataIndex: 'zoneId',
      key: 'zone',
      render: (zoneId: string) => zoneNames[zoneId] || zoneId,
    },
    { title: t('Type'), dataIndex: 'type', key: 'type', width: 80 },
    { title: t('Name'), dataIndex: 'name', key: 'name' },
    {
      title: t('Content'),
      key: 'content',
      render: (_: unknown, record: PreviewRecord) => (
        <Space direction="vertical" size={0}>
          <Text delete type="secondary" style={{ fontFamily: 'monospace' }}>
            {record.content}
          </Text>
          <Text style={{ fontFamily: 'monospace' }}>{newContent || '…'}</Text>
        </Space>
      ),
    },
  ]

  return (
    <Modal
      title={t('Bulk DNS replace')}
      open={open}
      onCancel={handleClose}
      footer={null}
      width={780}
      destroyOnClose
    >
      <Space direction="vertical" style={{ width: '100%' }} size="large">
        <Steps
          current={step}
          items={[{ title: t('Conditions') }, { title: t('Preview & apply') }]}
          size="small"
        />

        {step === 0 && (
          <Form
            form={form}
            layout="vertical"
            initialValues={{ recordType: 'A' }}
            onFinish={(values) => previewMutation.mutate(values)}
          >
            {zoneIds.length === 0 && (
              <Form.Item>
                <Empty description={t('No domains selected — close this dialog and tick domains in the table first.')} />
              </Form.Item>
            )}
            <Text type="secondary">
              {t('Applies to {{count}} selected domains.', { count: zoneIds.length })}
            </Text>
            <Form.Item label={t('Record type')} name="recordType" style={{ marginTop: 12 }}>
              <Select
                allowClear
                placeholder={t('All')}
                options={['A', 'AAAA', 'CNAME', 'TXT', 'MX'].map((rt) => ({ value: rt, label: rt }))}
              />
            </Form.Item>
            <Form.Item
              label={t('Old content (empty = match all records of the type)')}
              name="matchContent"
            >
              <Input placeholder="VD: 1.2.3.4" />
            </Form.Item>
            <Form.Item label={t('Filter by record name (optional, partial match)')} name="matchName">
              <Input placeholder="VD: www" />
            </Form.Item>
            <Form.Item
              label={t('New content')}
              name="newContent"
              rules={[{ required: true, message: t('Enter new content') }]}
            >
              <Input placeholder="VD: 5.6.7.8" />
            </Form.Item>
            <Form.Item label={t('Enable proxy (Cloudflare CDN) for the changed records')} name="setProxied" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Button type="primary" htmlType="submit" loading={previewMutation.isPending} disabled={zoneIds.length === 0}>
              {t('Preview')}
            </Button>
          </Form>
        )}

        {step === 1 && (
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            {matches.length === 0 ? (
              <Empty description={t('No records match the conditions')} />
            ) : (
              <>
                <Text>
                  <Text strong>{selectedKeys.length}</Text> / {matches.length} {t('records will be changed to')}{' '}
                  <Text code>{newContent}</Text>
                </Text>
                <Table
                  dataSource={matches}
                  rowKey={(r) => `${r.zoneId}:${r.recordId}`}
                  columns={columns}
                  size="small"
                  rowSelection={{
                    selectedRowKeys: selectedKeys,
                    onChange: (keys: Key[]) => setSelectedKeys(keys as string[]),
                  }}
                  pagination={{ pageSize: 10, hideOnSinglePage: true }}
                />
              </>
            )}
            <Space>
              <Button onClick={() => setStep(0)}>{t('Back')}</Button>
              <Popconfirm
                title={t('Apply DNS changes')}
                description={t('Change {{count}} records to "{{content}}"?', { count: selectedKeys.length, content: newContent })}
                okText={t('Apply')}
                cancelText={t('Cancel')}
                onConfirm={() => replaceMutation.mutate()}
                disabled={selectedKeys.length === 0}
              >
                <Button
                  type="primary"
                  danger
                  disabled={selectedKeys.length === 0}
                  loading={replaceMutation.isPending}
                >
                  {t('Apply')}
                </Button>
              </Popconfirm>
            </Space>
          </Space>
        )}
      </Space>
    </Modal>
  )
}
