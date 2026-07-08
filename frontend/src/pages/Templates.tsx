import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Table,
  Button,
  Card,
  Space,
  Typography,
  Modal,
  Form,
  Input,
  Select,
  Switch,
  InputNumber,
  Popconfirm,
  Radio,
  Tag,
  Alert,
  message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { Key } from 'react'
import {
  PlusOutlined,
  DeleteOutlined,
  EditOutlined,
  CloudDownloadOutlined,
  SendOutlined,
} from '@ant-design/icons'
import { api } from '../services/api'
import { useTranslation } from 'react-i18next'
import BulkProgressModal from '../components/BulkProgressModal'

const { Title, Text } = Typography

const RECORD_TYPES = ['A', 'AAAA', 'CNAME', 'TXT', 'MX']

interface TemplateRecord {
  type: string
  name: string
  content: string
  ttl?: number
  proxied?: boolean
  priority?: number
}

interface DnsTemplate {
  id: string
  name: string
  description?: string
  records: TemplateRecord[]
  createdAt: string
  updatedAt: string
}

interface Zone {
  id: string
  name: string
  status: string
}

interface EditorValues {
  name: string
  description?: string
  records: TemplateRecord[]
}

export default function Templates() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [applyZoneKeys, setApplyZoneKeys] = useState<string[]>([])
  const [applyMode, setApplyMode] = useState<'skip' | 'overwrite'>('skip')
  const [editorForm] = Form.useForm<EditorValues>()
  const [fromZoneForm] = Form.useForm<{ zoneId: string; name: string; description?: string }>()

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

  const { data: templates = [], isLoading } = useQuery<DnsTemplate[]>({
    queryKey: ['templates'],
    queryFn: async () => (await api.get('/templates')).data,
  })

  const { data: domains = [] } = useQuery<Zone[]>({
    queryKey: ['domains'],
    queryFn: async () => (await api.get('/domains')).data,
  })

  // Modal & job state live in the URL so F5 / shared links restore the view
  const activeModal = searchParams.get('modal') // 'create' | 'from-zone'
  const editId = searchParams.get('edit')
  const applyId = searchParams.get('apply')
  const jobId = searchParams.get('job')

  const editing = editId ? templates.find((tpl) => tpl.id === editId) || null : null
  const applyTemplate = applyId ? templates.find((tpl) => tpl.id === applyId) || null : null
  const editorOpen = activeModal === 'create' || !!editing

  // Prefill editor when opened (including after F5 once templates load)
  useEffect(() => {
    if (!editorOpen) return
    editorForm.setFieldsValue(
      editing
        ? { name: editing.name, description: editing.description, records: editing.records }
        : { name: '', description: '', records: [{ type: 'A', name: '@', content: '', ttl: 1, proxied: true }] },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorOpen, editing?.id])

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['templates'] })

  const saveMutation = useMutation({
    mutationFn: async (values: EditorValues) => {
      if (editing) {
        return (await api.put(`/templates/${editing.id}`, values)).data
      }
      return (await api.post('/templates', values)).data
    },
    onSuccess: () => {
      message.success(editing ? t('Template updated') : t('Template created'))
      setParams({ modal: null, edit: null })
      editorForm.resetFields()
      invalidate()
    },
    onError: (e: any) => message.error(e.response?.data?.detail || t('Could not save template')),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/templates/${id}`),
    onSuccess: () => {
      message.success(t('Template deleted'))
      invalidate()
    },
    onError: (e: any) => message.error(e.response?.data?.detail || t('Could not delete template')),
  })

  const fromZoneMutation = useMutation({
    mutationFn: async (values: { zoneId: string; name: string; description?: string }) =>
      (
        await api.post(`/templates/from-zone/${values.zoneId}`, {
          name: values.name,
          description: values.description,
        })
      ).data,
    onSuccess: () => {
      message.success(t('Template created from domain'))
      setParams({ modal: null })
      fromZoneForm.resetFields()
      invalidate()
    },
    onError: (e: any) => message.error(e.response?.data?.detail || t('Could not create template')),
  })

  const applyMutation = useMutation({
    mutationFn: async () => {
      const zones = domains
        .filter((d) => applyZoneKeys.includes(d.id))
        .map((d) => ({ zoneId: d.id, zoneName: d.name }))
      return (
        await api.post(`/templates/${applyTemplate!.id}/apply`, { zones, mode: applyMode })
      ).data as { jobId: string }
    },
    onSuccess: (data) => setParams({ apply: null, job: data.jobId }),
    onError: (e: any) => message.error(e.response?.data?.detail || t('Could not apply template')),
  })

  const closeApply = () => {
    setParams({ apply: null, job: null })
    setApplyZoneKeys([])
    setApplyMode('skip')
  }

  const columns: ColumnsType<DnsTemplate> = [
    {
      title: t('Template name'),
      dataIndex: 'name',
      key: 'name',
      render: (text: string) => <Text strong>{text}</Text>,
    },
    { title: t('Description'), dataIndex: 'description', key: 'description', ellipsis: true },
    {
      title: t('Record count'),
      key: 'count',
      width: 110,
      render: (_: unknown, r: DnsTemplate) => <Tag bordered={false}>{r.records.length}</Tag>,
    },
    {
      title: t('Actions'),
      key: 'actions',
      width: 320,
      render: (_: unknown, record: DnsTemplate) => (
        <Space>
          <Button type="primary" icon={<SendOutlined />} onClick={() => setParams({ apply: record.id })}>
            Apply
          </Button>
          <Button icon={<EditOutlined />} onClick={() => setParams({ edit: record.id })}>
            {t('Edit')}
          </Button>
          <Popconfirm
            title={t('Delete template')}
            description={t('Delete template "{{name}}"?', { name: record.name })}
            okText={t('Delete')}
            cancelText={t('Cancel')}
            okButtonProps={{ danger: true }}
            onConfirm={() => deleteMutation.mutate(record.id)}
          >
            <Button danger icon={<DeleteOutlined />}>
              {t('Delete')}
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div style={{ padding: 24 }}>
      <div className="page-header">
        <Title level={2} style={{ fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 4 }}>
          DNS Templates
        </Title>
        <Text type="secondary">
          {t('Save a standard DNS record set and apply it to many domains at once. Supports placeholders')}{' '}
          <Text code>{'{domain}'}</Text> {t('and')} <Text code>@</Text> {t('(root domain)')}.
        </Text>
      </div>

      <Card style={{ marginTop: 16 }}>
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          <Space>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setParams({ modal: 'create' })}>
              {t('Create template')}
            </Button>
            <Button icon={<CloudDownloadOutlined />} onClick={() => setParams({ modal: 'from-zone' })}>
              {t('Create from existing domain')}
            </Button>
          </Space>
          <Table
            loading={isLoading}
            dataSource={templates}
            rowKey="id"
            columns={columns}
            pagination={{ pageSize: 10, hideOnSinglePage: true }}
          />
        </Space>
      </Card>

      {/* Editor modal */}
      <Modal
        title={editing ? t('Edit template: {{name}}', { name: editing.name }) : t('Create template')}
        open={editorOpen}
        onCancel={() => setParams({ modal: null, edit: null })}
        onOk={() => editorForm.submit()}
        okText={t('Save')}
        cancelText={t('Cancel')}
        width={900}
        confirmLoading={saveMutation.isPending}
      >
        <Form form={editorForm} layout="vertical" onFinish={(v) => saveMutation.mutate(v)}>
          <Form.Item label={t('Template name')} name="name" rules={[{ required: true, message: t('Enter template name') }]}>
            <Input placeholder={t('e.g. Standard records for landing pages')} />
          </Form.Item>
          <Form.Item label={t('Description')} name="description">
            <Input placeholder={t('Short description (optional)')} />
          </Form.Item>
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 12 }}
            message={t('Use @ or {domain} in Name/Content — they will be replaced with the domain name when applied.')}
          />
          <Form.List name="records">
            {(fields, { add, remove }) => (
              <Space direction="vertical" style={{ width: '100%' }}>
                {fields.map((field) => (
                  <Space key={field.key} align="baseline" wrap>
                    <Form.Item
                      name={[field.name, 'type']}
                      rules={[{ required: true, message: t('Type') }]}
                      style={{ marginBottom: 8 }}
                    >
                      <Select style={{ width: 90 }} options={RECORD_TYPES.map((rt) => ({ value: rt, label: rt }))} />
                    </Form.Item>
                    <Form.Item
                      name={[field.name, 'name']}
                      rules={[{ required: true, message: t('Name') }]}
                      style={{ marginBottom: 8 }}
                    >
                      <Input placeholder={t('Name (@, www...)')} style={{ width: 160 }} />
                    </Form.Item>
                    <Form.Item
                      name={[field.name, 'content']}
                      rules={[{ required: true, message: 'Content' }]}
                      style={{ marginBottom: 8 }}
                    >
                      <Input placeholder={t('Content (IP, target...)')} style={{ width: 220 }} />
                    </Form.Item>
                    <Form.Item name={[field.name, 'ttl']} style={{ marginBottom: 8 }}>
                      <InputNumber placeholder="TTL" min={1} style={{ width: 100 }} />
                    </Form.Item>
                    <Form.Item noStyle shouldUpdate>
                      {() =>
                        editorForm.getFieldValue(['records', field.name, 'type']) === 'MX' && (
                          <Form.Item
                            name={[field.name, 'priority']}
                            rules={[{ required: true, message: 'Priority' }]}
                            style={{ marginBottom: 8 }}
                          >
                            <InputNumber placeholder="Priority" min={0} style={{ width: 100 }} />
                          </Form.Item>
                        )
                      }
                    </Form.Item>
                    <Form.Item
                      name={[field.name, 'proxied']}
                      valuePropName="checked"
                      style={{ marginBottom: 8 }}
                    >
                      <Switch checkedChildren="Proxy" unCheckedChildren="DNS" />
                    </Form.Item>
                    <Button type="text" danger icon={<DeleteOutlined />} onClick={() => remove(field.name)} />
                  </Space>
                ))}
                <Button
                  type="dashed"
                  icon={<PlusOutlined />}
                  onClick={() => add({ type: 'A', name: '', content: '', ttl: 1, proxied: true })}
                  block
                >
                  {t('Add record')}
                </Button>
              </Space>
            )}
          </Form.List>
        </Form>
      </Modal>

      {/* Create from zone modal */}
      <Modal
        title={t('Create template from existing domain')}
        open={activeModal === 'from-zone'}
        onCancel={() => setParams({ modal: null })}
        onOk={() => fromZoneForm.submit()}
        okText={t('Create')}
        cancelText={t('Cancel')}
        confirmLoading={fromZoneMutation.isPending}
      >
        <Form form={fromZoneForm} layout="vertical" onFinish={(v) => fromZoneMutation.mutate(v)}>
          <Form.Item label={t('Select domain')} name="zoneId" rules={[{ required: true, message: t('Select domain') }]}>
            <Select
              showSearch
              optionFilterProp="label"
              placeholder={t('Select source domain')}
              options={domains.map((d) => ({ value: d.id, label: d.name }))}
            />
          </Form.Item>
          <Form.Item label={t('Template name')} name="name" rules={[{ required: true, message: t('Enter template name') }]}>
            <Input placeholder={t('e.g. Records from example.com')} />
          </Form.Item>
          <Form.Item label={t('Description')} name="description">
            <Input placeholder={t('Optional')} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Apply modal */}
      {applyTemplate && !jobId && (
        <Modal
          title={t('Apply template: {{name}}', { name: applyTemplate.name })}
          open={!!applyTemplate}
          onCancel={closeApply}
          onOk={() => applyMutation.mutate()}
          okText={t('Apply to {{count}} domains', { count: applyZoneKeys.length })}
          cancelText={t('Cancel')}
          okButtonProps={{ disabled: applyZoneKeys.length === 0 }}
          confirmLoading={applyMutation.isPending}
          width={720}
        >
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <div>
              <Text strong>{t('Existing records (same type + name): ')}</Text>
              <Radio.Group value={applyMode} onChange={(e) => setApplyMode(e.target.value)}>
                <Radio.Button value="skip">{t('Skip')}</Radio.Button>
                <Radio.Button value="overwrite">{t('Overwrite')}</Radio.Button>
              </Radio.Group>
            </div>
            <Table
              dataSource={domains}
              rowKey="id"
              size="small"
              columns={[
                { title: 'Domain', dataIndex: 'name', key: 'name' },
                {
                  title: t('Status'),
                  dataIndex: 'status',
                  key: 'status',
                  width: 120,
                  render: (s: string) => <Tag color={s === 'active' ? 'success' : 'warning'}>{s}</Tag>,
                },
              ]}
              rowSelection={{
                selectedRowKeys: applyZoneKeys,
                onChange: (keys: Key[]) => setApplyZoneKeys(keys as string[]),
              }}
              pagination={{ pageSize: 8, hideOnSinglePage: true }}
            />
          </Space>
        </Modal>
      )}

      {/* Apply progress */}
      {jobId && (
        <BulkProgressModal
          jobId={jobId}
          open={!!jobId}
          onClose={closeApply}
        />
      )}
    </div>
  )
}
