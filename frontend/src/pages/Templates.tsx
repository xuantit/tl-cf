import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Table,
  Button,
  Card,
  Space,
  Typography,
  Form,
  Input,
  Select,
  Switch,
  InputNumber,
  Popconfirm,
  Radio,
  Tag,
  Checkbox,
} from 'antd'
import type { FormInstance } from 'antd'
import { message } from '../lib/antdApp'
import type { ColumnsType } from 'antd/es/table'
import {
  PlusOutlined,
  DeleteOutlined,
  EditOutlined,
  CloudDownloadOutlined,
  SendOutlined,
} from '@ant-design/icons'
import { api, apiErrorDetail } from '../services/api'
import { useTranslation } from 'react-i18next'
import BulkProgressModal from '../components/BulkProgressModal'
import PageHeader from '../components/PageHeader'
import { Banner, DetailPanel, Lbl } from '../components/ui'

const { Text } = Typography

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

  const { data: templates = [], isLoading, isError, error, refetch, isFetching } = useQuery<DnsTemplate[]>({
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
  const applyZoneKeys = searchParams.getAll('zone')
  const applyMode = searchParams.get('mode') === 'overwrite' ? 'overwrite' : 'skip'

  const setApplyZoneKeys = (zoneIds: string[]) => {
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous)
        next.delete('zone')
        zoneIds.forEach((zoneId) => next.append('zone', zoneId))
        return next
      },
      { replace: true },
    )
  }

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
    onError: (error) => message.error(apiErrorDetail(error) || t('Could not save template')),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/templates/${id}`),
    onSuccess: () => {
      message.success(t('Template deleted'))
      invalidate()
    },
    onError: (error) => message.error(apiErrorDetail(error) || t('Could not delete template')),
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
    onError: (error) => message.error(apiErrorDetail(error) || t('Could not create template')),
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
    onSuccess: (data) => setParams({ apply: null, mode: null, zone: null, job: data.jobId }),
    onError: (error) => message.error(apiErrorDetail(error) || t('Could not apply template')),
  })

  const closeApply = () => {
    // Remove all apply-related params in a single update. Calling setSearchParams twice in one
    // handler is unreliable because react-router's ref isn't updated between synchronous calls,
    // which would let the second call overwrite the first (leaving the modal open).
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('apply')
        next.delete('job')
        next.delete('mode')
        next.delete('zone')
        return next
      },
      { replace: true },
    )
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
      render: (_: unknown, r: DnsTemplate) => <Tag variant="filled">{r.records.length}</Tag>,
    },
    {
      title: t('Actions'),
      key: 'actions',
      width: 320,
      render: (_: unknown, record: DnsTemplate) => (
        <Space>
          <Button type="primary" icon={<SendOutlined />} onClick={() => setParams({ apply: record.id, mode: 'skip' })}>
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
    <div style={{ padding: 'clamp(12px, 3vw, 24px)' }}>
      <PageHeader
        title="DNS Templates"
        description={
          <>
            {t('Save a standard DNS record set and apply it to many domains at once. Supports placeholders')}{' '}
            <Text code>{'{domain}'}</Text> {t('and')} <Text code>@</Text> {t('(root domain)')}.
          </>
        }
        actions={
          <>
            <Button icon={<CloudDownloadOutlined />} onClick={() => setParams({ modal: 'from-zone' })}>
              {t('Create from existing domain')}
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setParams({ modal: 'create' })}>
              {t('Create template')}
            </Button>
          </>
        }
      />

      {isError && (
        <Banner
          tone="err"
          className="mt-3"
          actions={
            <Button size="small" loading={isFetching} onClick={() => refetch()}>
              ↻ {t('Retry')}
            </Button>
          }
        >
          {apiErrorDetail(error) || t('Could not load templates')}
        </Banner>
      )}

      {/* Panels are flex siblings of the list so they push content left (DetailPanel pattern) */}
      <div className="flex" style={{ marginTop: 16 }}>
        <div className="min-w-0 flex-1">
          <Card>
            <Space orientation="vertical" style={{ width: '100%' }} size="large">
              <Table
                loading={isLoading}
                dataSource={templates}
                rowKey="id"
                columns={columns}
                pagination={{ pageSize: 10, hideOnSinglePage: true }}
                scroll={{ x: 'max-content' }}
              />
            </Space>
          </Card>
        </div>

        <TemplateEditorPanel
          open={editorOpen}
          editing={editing}
          form={editorForm}
          saving={saveMutation.isPending}
          onClose={() => {
            editorForm.resetFields()
            setParams({ modal: null, edit: null })
          }}
          onFinish={(values) => saveMutation.mutate(values)}
        />

        <TemplateFromZonePanel
          open={activeModal === 'from-zone'}
          form={fromZoneForm}
          domains={domains}
          saving={fromZoneMutation.isPending}
          onClose={() => {
            fromZoneForm.resetFields()
            setParams({ modal: null })
          }}
          onFinish={(values) => fromZoneMutation.mutate(values)}
        />

        <TemplateApplyPanel
          open={!!applyTemplate && !jobId}
          template={applyTemplate}
          domains={domains}
          mode={applyMode}
          selectedKeys={applyZoneKeys}
          applying={applyMutation.isPending}
          onModeChange={(mode) => setParams({ mode })}
          onSelectionChange={setApplyZoneKeys}
          onClose={closeApply}
          onApply={() => applyMutation.mutate()}
        />
      </div>

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

function TemplateEditorPanel({
  open,
  editing,
  form,
  saving,
  onClose,
  onFinish,
}: {
  open: boolean
  editing: DnsTemplate | null
  form: FormInstance<EditorValues>
  saving: boolean
  onClose: () => void
  onFinish: (values: EditorValues) => void
}) {
  const { t } = useTranslation()
  return (
    <DetailPanel
      open={open}
      title={editing ? t('Edit template: {{name}}', { name: editing.name }) : t('Create template')}
      onClose={onClose}
      footer={
        <span className="ml-auto flex gap-2">
          <Button onClick={onClose}>{t('Cancel')}</Button>
          <Button type="primary" loading={saving} onClick={() => form.submit()}>
            {t('Save')}
          </Button>
        </span>
      }
    >
      {/* key remounts the form DOM when switching between create/edit */}
      <Form key={editing?.id ?? 'new'} form={form} layout="vertical" onFinish={onFinish}>
        <Form.Item label={t('Template name')} name="name" rules={[{ required: true, message: t('Enter template name') }]}>
          <Input placeholder={t('e.g. Standard records for landing pages')} />
        </Form.Item>
        <Form.Item label={t('Description')} name="description">
          <Input placeholder={t('Short description (optional)')} />
        </Form.Item>
        <Banner tone="info" className="mb-3 rounded-[6px] border border-stroke">
          {t('Use @ or {domain} in Name/Content — they will be replaced with the domain name when applied.')}
        </Banner>
        <Form.List name="records">
          {(fields, { add, remove }) => (
            <div className="flex flex-col gap-2">
              {fields.map((field) => (
                <div
                  key={field.key}
                  className="flex flex-col gap-[6px] rounded-[6px] border border-stroke-2 px-[10px] py-[8px]"
                >
                  <div className="flex gap-[6px]">
                    <Form.Item
                      name={[field.name, 'type']}
                      rules={[{ required: true, message: t('Type') }]}
                      style={{ marginBottom: 0 }}
                    >
                      <Select style={{ width: 90 }} options={RECORD_TYPES.map((rt) => ({ value: rt, label: rt }))} />
                    </Form.Item>
                    <Form.Item
                      name={[field.name, 'name']}
                      rules={[{ required: true, message: t('Name') }]}
                      style={{ marginBottom: 0 }}
                      className="min-w-0 flex-1"
                    >
                      <Input placeholder={t('Name (@, www...)')} />
                    </Form.Item>
                    <Button type="text" danger icon={<DeleteOutlined />} onClick={() => remove(field.name)} />
                  </div>
                  <div className="flex gap-[6px]">
                    <Form.Item
                      name={[field.name, 'content']}
                      rules={[{ required: true, message: 'Content' }]}
                      style={{ marginBottom: 0 }}
                      className="min-w-0 flex-1"
                    >
                      <Input placeholder={t('Content (IP, target...)')} />
                    </Form.Item>
                    <Form.Item name={[field.name, 'ttl']} style={{ marginBottom: 0 }}>
                      <InputNumber placeholder="TTL" min={1} style={{ width: 90 }} />
                    </Form.Item>
                  </div>
                  <div className="flex items-center gap-[10px]">
                    <Form.Item noStyle shouldUpdate>
                      {() =>
                        form.getFieldValue(['records', field.name, 'type']) === 'MX' && (
                          <Form.Item
                            name={[field.name, 'priority']}
                            rules={[{ required: true, message: 'Priority' }]}
                            style={{ marginBottom: 0 }}
                          >
                            <InputNumber placeholder="Priority" min={0} style={{ width: 90 }} />
                          </Form.Item>
                        )
                      }
                    </Form.Item>
                    <Form.Item
                      name={[field.name, 'proxied']}
                      valuePropName="checked"
                      style={{ marginBottom: 0 }}
                      className="ml-auto"
                    >
                      <Switch checkedChildren="Proxy" unCheckedChildren="DNS" />
                    </Form.Item>
                  </div>
                </div>
              ))}
              <Button
                type="dashed"
                icon={<PlusOutlined />}
                onClick={() => add({ type: 'A', name: '', content: '', ttl: 1, proxied: true })}
                block
              >
                {t('Add record')}
              </Button>
            </div>
          )}
        </Form.List>
      </Form>
    </DetailPanel>
  )
}

function TemplateFromZonePanel({
  open,
  form,
  domains,
  saving,
  onClose,
  onFinish,
}: {
  open: boolean
  form: FormInstance<{ zoneId: string; name: string; description?: string }>
  domains: Zone[]
  saving: boolean
  onClose: () => void
  onFinish: (values: { zoneId: string; name: string; description?: string }) => void
}) {
  const { t } = useTranslation()
  return (
    <DetailPanel
      open={open}
      title={t('Create template from existing domain')}
      onClose={onClose}
      footer={
        <span className="ml-auto flex gap-2">
          <Button onClick={onClose}>{t('Cancel')}</Button>
          <Button type="primary" loading={saving} onClick={() => form.submit()}>
            {t('Create')}
          </Button>
        </span>
      }
    >
      <Form form={form} layout="vertical" onFinish={onFinish}>
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
    </DetailPanel>
  )
}

function TemplateApplyPanel({
  open,
  template,
  domains,
  mode,
  selectedKeys,
  applying,
  onModeChange,
  onSelectionChange,
  onClose,
  onApply,
}: {
  open: boolean
  template: DnsTemplate | null
  domains: Zone[]
  mode: 'skip' | 'overwrite'
  selectedKeys: string[]
  applying: boolean
  onModeChange: (mode: string) => void
  onSelectionChange: (zoneIds: string[]) => void
  onClose: () => void
  onApply: () => void
}) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')

  // Children stay mounted when the panel is closed — reset local search on close
  const close = () => {
    setSearch('')
    onClose()
  }

  const query = search.trim().toLowerCase()
  const filtered = query ? domains.filter((d) => d.name.toLowerCase().includes(query)) : domains
  const filteredIds = filtered.map((d) => d.id)
  const allSelected = filtered.length > 0 && filteredIds.every((id) => selectedKeys.includes(id))
  const someSelected = filteredIds.some((id) => selectedKeys.includes(id))

  const toggleAll = (checked: boolean) => {
    if (checked) onSelectionChange([...new Set([...selectedKeys, ...filteredIds])])
    else onSelectionChange(selectedKeys.filter((id) => !filteredIds.includes(id)))
  }
  const toggleOne = (id: string, checked: boolean) => {
    onSelectionChange(checked ? [...selectedKeys, id] : selectedKeys.filter((k) => k !== id))
  }

  return (
    <DetailPanel
      open={open}
      title={template ? t('Apply template: {{name}}', { name: template.name }) : ''}
      onClose={close}
      footer={
        <span className="ml-auto flex gap-2">
          <Button onClick={close}>{t('Cancel')}</Button>
          <Button
            type="primary"
            disabled={selectedKeys.length === 0}
            loading={applying}
            onClick={onApply}
          >
            {t('Apply to {{count}} domains', { count: selectedKeys.length })}
          </Button>
        </span>
      }
    >
      <div className="flex flex-col gap-3">
        <div>
          <Lbl className="mb-[5px] block">{t('Existing records (same type + name): ')}</Lbl>
          <Radio.Group value={mode} onChange={(e) => onModeChange(e.target.value)}>
            <Radio.Button value="skip">{t('Skip')}</Radio.Button>
            <Radio.Button value="overwrite">{t('Overwrite')}</Radio.Button>
          </Radio.Group>
        </div>
        <div>
          <Input
            allowClear
            placeholder={t('Search domains...')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="mt-2 flex items-center border-b border-stroke pb-[6px]">
            <Checkbox
              indeterminate={someSelected && !allSelected}
              checked={allSelected}
              onChange={(e) => toggleAll(e.target.checked)}
            >
              <span className="text-[12.5px]">{t('Select all')}</span>
            </Checkbox>
            <span className="ml-auto font-mono text-[11px] text-fg-3">
              {selectedKeys.length}/{domains.length}
            </span>
          </div>
          <div className="max-h-[300px] overflow-auto">
            {filtered.map((d) => (
              <div key={d.id} className="flex items-center gap-2 border-b border-stroke py-[5px] last:border-b-0">
                <Checkbox
                  checked={selectedKeys.includes(d.id)}
                  onChange={(e) => toggleOne(d.id, e.target.checked)}
                  className="min-w-0 flex-1"
                >
                  <span className="truncate text-[12.5px]">{d.name}</span>
                </Checkbox>
                <Tag color={d.status === 'active' ? 'success' : 'warning'}>{d.status}</Tag>
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="py-3 text-center font-mono text-[11.5px] text-fg-3">{t('No matching domains')}</div>
            )}
          </div>
        </div>
      </div>
    </DetailPanel>
  )
}
