import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDownOutlined, ArrowUpOutlined, PlusOutlined } from '@ant-design/icons'
import {
  Button,
  Form,
  Input,
  Modal,
  Popconfirm,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd'
import { message } from '../../lib/antdApp'
import type { ColumnsType } from 'antd/es/table'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { api } from '../../services/api'

const { Text } = Typography

type RuleKind = 'redirect' | 'cache' | 'configuration'
const RULE_KINDS: RuleKind[] = ['redirect', 'cache', 'configuration']

interface ModernRule {
  id: string
  version?: string
  enabled: boolean
  description: string
  expression: string
  action: string
  actionParameters?: Record<string, unknown>
  position?: number
}

interface RulesListResponse {
  rules: ModernRule[]
  quota: { used: number }
  warnings: string[]
}

interface RuleFormValues {
  description?: string
  expression: string
  action?: string
  enabled: boolean
  actionParametersJson?: string
}

function parseKind(value: string | null): RuleKind {
  return value && (RULE_KINDS as string[]).includes(value) ? (value as RuleKind) : 'redirect'
}

export default function ModernRulesPanel({ zoneId }: { zoneId: string }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [form] = Form.useForm<RuleFormValues>()
  const [searchParams, setSearchParams] = useSearchParams()

  const kind = parseKind(searchParams.get('kind'))
  const activeModal = searchParams.get('modal')
  const editId = searchParams.get('edit')

  const setViewParams = (updates: Record<string, string | null>) => {
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous)
        for (const [key, value] of Object.entries(updates)) {
          if (value === null) next.delete(key)
          else next.set(key, value)
        }
        return next
      },
      { replace: true },
    )
  }

  const { data, isLoading } = useQuery<RulesListResponse>({
    queryKey: ['modern-rules', zoneId, kind],
    queryFn: async () => (await api.get(`/rules/${zoneId}/${kind}`)).data,
    enabled: !!zoneId,
  })

  const rules = data?.rules ?? []

  const editingRule = activeModal === 'edit' ? rules.find((rule) => rule.id === editId) ?? null : null

  useEffect(() => {
    if (activeModal === 'add') {
      form.setFieldsValue({ enabled: true, expression: '', description: '', action: '', actionParametersJson: '' })
    } else if (activeModal === 'edit' && editingRule) {
      form.setFieldsValue({
        enabled: editingRule.enabled,
        expression: editingRule.expression,
        description: editingRule.description,
        action: editingRule.action,
        actionParametersJson: editingRule.actionParameters
          ? JSON.stringify(editingRule.actionParameters, null, 2)
          : '',
      })
    }
  }, [activeModal, editingRule, form])

  const buildPayload = (values: RuleFormValues) => {
    let actionParameters: Record<string, unknown> | undefined
    if (values.actionParametersJson && values.actionParametersJson.trim()) {
      actionParameters = JSON.parse(values.actionParametersJson)
    }
    return {
      enabled: values.enabled,
      description: values.description,
      expression: values.expression,
      action: values.action || undefined,
      actionParameters,
    }
  }

  const createRule = useMutation({
    mutationFn: async (values: RuleFormValues) =>
      (await api.post(`/rules/${zoneId}/${kind}`, buildPayload(values))).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['modern-rules', zoneId, kind] })
      setViewParams({ modal: null, edit: null })
      message.success(t('Rule created'))
    },
    onError: (e: { response?: { data?: { detail?: string } } }) =>
      message.error(e?.response?.data?.detail || t('Failed to create rule')),
  })

  const updateRule = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: RuleFormValues }) =>
      (await api.put(`/rules/${zoneId}/${kind}/${id}`, buildPayload(values))).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['modern-rules', zoneId, kind] })
      setViewParams({ modal: null, edit: null })
      message.success(t('Rule updated'))
    },
    onError: (e: { response?: { data?: { detail?: string } } }) =>
      message.error(e?.response?.data?.detail || t('Failed to update rule')),
  })

  const deleteRule = useMutation({
    mutationFn: async (ruleId: string) => api.delete(`/rules/${zoneId}/${kind}/${ruleId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['modern-rules', zoneId, kind] })
      message.success(t('Rule deleted'))
    },
    onError: (e: { response?: { data?: { detail?: string } } }) =>
      message.error(e?.response?.data?.detail || t('Failed to delete rule')),
  })

  const reorderRules = useMutation({
    mutationFn: async (ordered: ModernRule[]) =>
      (
        await api.post(`/rules/${zoneId}/${kind}/reorder`, {
          rules: ordered.map((rule) => ({
            enabled: rule.enabled,
            description: rule.description,
            expression: rule.expression,
            action: rule.action || undefined,
            actionParameters: rule.actionParameters,
          })),
        })
      ).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['modern-rules', zoneId, kind] })
      message.success(t('Rules reordered'))
    },
    onError: (e: { response?: { data?: { detail?: string } } }) =>
      message.error(e?.response?.data?.detail || t('Failed to reorder rules')),
  })

  const moveRule = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= rules.length) return
    const ordered = [...rules]
    const [moved] = ordered.splice(index, 1)
    ordered.splice(target, 0, moved)
    reorderRules.mutate(ordered)
  }

  const handleSubmit = async () => {
    let values: RuleFormValues
    try {
      values = await form.validateFields()
    } catch {
      return
    }
    if (values.actionParametersJson && values.actionParametersJson.trim()) {
      try {
        JSON.parse(values.actionParametersJson)
      } catch {
        message.error(t('Action parameters must be valid JSON'))
        return
      }
    }
    if (editingRule) {
      updateRule.mutate({ id: editingRule.id, values })
    } else {
      createRule.mutate(values)
    }
  }

  const columns: ColumnsType<ModernRule> = [
    { title: '#', dataIndex: 'position', width: 60 },
    {
      title: t('Order'),
      key: 'order',
      width: 90,
      render: (_v, _record, index) => (
        <Space size={4}>
          <Button
            size='small'
            icon={<ArrowUpOutlined />}
            disabled={index === 0 || reorderRules.isPending}
            onClick={() => moveRule(index, -1)}
          />
          <Button
            size='small'
            icon={<ArrowDownOutlined />}
            disabled={index === rules.length - 1 || reorderRules.isPending}
            onClick={() => moveRule(index, 1)}
          />
        </Space>
      ),
    },
    {
      title: t('Description'),
      dataIndex: 'description',
      render: (value: string) => value || <Text type='secondary'>—</Text>,
    },
    {
      title: t('Expression'),
      dataIndex: 'expression',
      render: (value: string) => <code style={{ fontSize: 12 }}>{value}</code>,
    },
    { title: t('Action'), dataIndex: 'action', width: 160 },
    {
      title: t('Status'),
      dataIndex: 'enabled',
      width: 110,
      render: (enabled: boolean) => (
        <Tag color={enabled ? 'success' : 'default'} variant="filled">
          {enabled ? t('Enabled') : t('Disabled')}
        </Tag>
      ),
    },
    {
      title: t('Actions'),
      key: 'operations',
      width: 190,
      render: (_v, record) => (
        <Space>
          <Button size='small' onClick={() => setViewParams({ modal: 'edit', edit: record.id })}>
            {t('Edit')}
          </Button>
          <Popconfirm
            title={t('Delete this rule?')}
            okText={t('Delete')}
            cancelText={t('Cancel')}
            onConfirm={() => deleteRule.mutate(record.id)}
          >
            <Button size='small' danger loading={deleteRule.isPending}>
              {t('Delete')}
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <Space orientation='vertical' size='middle' style={{ width: '100%' }}>
      <Tabs
        activeKey={kind}
        onChange={(value) => setViewParams({ kind: value, modal: null, edit: null })}
        items={[
          { key: 'redirect', label: t('Redirect Rules') },
          { key: 'cache', label: t('Cache Rules') },
          { key: 'configuration', label: t('Configuration Rules') },
        ]}
      />
      <Button type='primary' icon={<PlusOutlined />} onClick={() => setViewParams({ modal: 'add', edit: null })}>
        {t('Add Rule')}
      </Button>
      {data?.warnings?.length ? <Text type='warning'>{data.warnings.join(', ')}</Text> : null}
      <Table loading={isLoading} dataSource={rules} rowKey='id' columns={columns} pagination={false} scroll={{ x: 'max-content' }} />

      <Modal
        open={activeModal === 'add' || activeModal === 'edit'}
        title={editingRule ? t('Edit Rule') : t('Add Rule')}
        onCancel={() => setViewParams({ modal: null, edit: null })}
        onOk={handleSubmit}
        confirmLoading={createRule.isPending || updateRule.isPending}
        okText={t('Save')}
        cancelText={t('Cancel')}
        destroyOnHidden
      >
        <Form form={form} layout='vertical'>
          <Form.Item name='description' label={t('Description')}>
            <Input placeholder={t('Optional description')} />
          </Form.Item>
          <Form.Item
            name='expression'
            label={t('Expression')}
            rules={[{ required: true, message: t('Expression is required') }]}
          >
            <Input.TextArea rows={2} placeholder='e.g. (http.request.uri.path eq "/old")' />
          </Form.Item>
          <Form.Item name='action' label={t('Action')} tooltip={t('Leave empty to use the default action for this rule kind')}>
            <Input placeholder={t('Default for kind')} />
          </Form.Item>
          <Form.Item name='actionParametersJson' label={t('Action parameters (JSON)')}>
            <Input.TextArea rows={5} placeholder='{ }' />
          </Form.Item>
          <Form.Item name='enabled' label={t('Enabled')} valuePropName='checked'>
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  )
}
