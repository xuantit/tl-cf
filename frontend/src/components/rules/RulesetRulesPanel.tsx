import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDownOutlined, ArrowUpOutlined, MoreOutlined, PlusOutlined } from '@ant-design/icons'
import {
  Button,
  Collapse,
  Dropdown,
  Form,
  Input,
  InputNumber,
  Select,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import { message, modal } from '../../lib/antdApp'
import type { ColumnsType } from 'antd/es/table'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { DetailPanel, EmptyState, SectionHeader, SkeletonLine } from '../ui'
import { api, apiErrorDetail } from '../../services/api'
import ExpressionInput from './ExpressionInput'
import {
  fieldsForKind,
  fieldsToParams,
  paramsToFields,
  summarizeActionParameters,
  type FieldDef,
  type RuleKind,
} from './ruleFields'
import { presetsForKind } from './rulePresets'

const { Text } = Typography

export interface RulesetRule {
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
  rules: RulesetRule[]
  quota: { used: number }
  warnings: string[]
}

const KIND_TITLE: Record<RuleKind, string> = {
  redirect: 'Redirect Rules',
  cache: 'Cache Rules',
  configuration: 'Configuration Rules',
}

const BOOL3_OPTIONS = [
  { value: '', label: 'Not set' },
  { value: 'true', label: 'On' },
  { value: 'false', label: 'Off' },
]

/**
 * Bảng + form CRUD cho một phase ruleset (Redirect / Cache / Configuration).
 *
 * Form dựng theo khai báo trong ruleFields.ts nên khớp đúng action parameters
 * Cloudflare đang hỗ trợ; các thiết lập nâng cao (vary, custom cache key,
 * status code TTL…) vẫn sửa được qua ô JSON.
 */
export default function RulesetRulesPanel({
  zoneId,
  kind,
  zoneName,
}: {
  zoneId: string
  kind: RuleKind
  zoneName?: string
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [form] = Form.useForm()
  const [searchParams, setSearchParams] = useSearchParams()
  // Giữ phần action parameters không có field riêng để không mất khi lưu.
  const [advancedJson, setAdvancedJson] = useState('')
  const fields = useMemo(() => fieldsForKind(kind), [kind])
  const presets = useMemo(() => presetsForKind(kind), [kind])

  const modalParam = searchParams.get('modal')
  const urlKind = searchParams.get('kind')
  // Tương thích link cũ: ?kind=<kind>&modal=add|edit vẫn mở đúng panel.
  const legacyMatch = urlKind === kind
  const activeModal =
    modalParam === `${kind}-add` || (legacyMatch && modalParam === 'add')
      ? 'add'
      : modalParam === `${kind}-edit` || (legacyMatch && modalParam === 'edit')
        ? 'edit'
        : null
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

  const closeModal = () => setViewParams({ modal: null, edit: null, kind: null })

  const { data, isLoading } = useQuery<RulesListResponse>({
    queryKey: ['ruleset-rules', zoneId, kind],
    queryFn: async () => (await api.get(`/rules/${zoneId}/${kind}`)).data,
    enabled: !!zoneId,
  })

  const rules = data?.rules ?? []
  const editingRule = activeModal === 'edit' ? (rules.find((rule) => rule.id === editId) ?? null) : null

  useEffect(() => {
    if (activeModal === 'add') {
      const { values } = paramsToFields(kind, undefined)
      form.setFieldsValue({
        enabled: true,
        expression: '',
        description: '',
        ...values,
        redirect_kind: kind === 'redirect' ? 'static' : undefined,
      })
      setAdvancedJson('')
    } else if (activeModal === 'edit' && editingRule) {
      const { values, advanced } = paramsToFields(kind, editingRule.actionParameters)
      form.setFieldsValue({
        enabled: editingRule.enabled,
        expression: editingRule.expression,
        description: editingRule.description,
        ...values,
      })
      setAdvancedJson(Object.keys(advanced).length > 0 ? JSON.stringify(advanced, null, 2) : '')
    }
  }, [activeModal, editingRule, form, kind])

  const invalidate = () => qc.invalidateQueries({ queryKey: ['ruleset-rules', zoneId, kind] })

  const buildPayload = (values: Record<string, unknown>) => {
    let advanced: Record<string, unknown> = {}
    if (advancedJson.trim()) advanced = JSON.parse(advancedJson) as Record<string, unknown>
    return {
      enabled: values.enabled,
      description: values.description,
      expression: values.expression,
      actionParameters: fieldsToParams(kind, values, advanced),
    }
  }

  const createRule = useMutation({
    mutationFn: async (values: Record<string, unknown>) =>
      (await api.post(`/rules/${zoneId}/${kind}`, buildPayload(values))).data,
    onSuccess: () => {
      invalidate()
      closeModal()
      message.success(t('Rule created'))
    },
    onError: (error) => message.error(apiErrorDetail(error) || t('Failed to create rule')),
  })

  const updateRule = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: Record<string, unknown> }) =>
      (await api.put(`/rules/${zoneId}/${kind}/${id}`, buildPayload(values))).data,
    onSuccess: () => {
      invalidate()
      closeModal()
      message.success(t('Rule updated'))
    },
    onError: (error) => message.error(apiErrorDetail(error) || t('Failed to update rule')),
  })

  const deleteRule = useMutation({
    mutationFn: async (ruleId: string) => api.delete(`/rules/${zoneId}/${kind}/${ruleId}`),
    onSuccess: () => {
      invalidate()
      message.success(t('Rule deleted'))
    },
    onError: (error) => message.error(apiErrorDetail(error) || t('Failed to delete rule')),
  })

  const reorderRules = useMutation({
    mutationFn: async (ordered: RulesetRule[]) =>
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
      invalidate()
      message.success(t('Rules reordered'))
    },
    onError: (error) => message.error(apiErrorDetail(error) || t('Failed to reorder rules')),
  })

  const moveRule = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= rules.length) return
    const ordered = [...rules]
    const [moved] = ordered.splice(index, 1)
    ordered.splice(target, 0, moved)
    reorderRules.mutate(ordered)
  }

  const confirmDelete = (rule: RulesetRule) => {
    modal.confirm({
      title: t('Delete this rule?'),
      content: rule.description || rule.expression,
      okText: t('Delete'),
      okButtonProps: { danger: true },
      cancelText: t('Cancel'),
      onOk: () => deleteRule.mutateAsync(rule.id),
    })
  }

  /** Áp dụng gợi ý: chỉ điền sẵn form, người dùng vẫn sửa tự do trước khi lưu. */
  const applyPreset = (presetKey: string) => {
    const preset = presets.find((p) => p.key === presetKey)
    if (!preset) return
    const result = preset.build(zoneName ?? '')
    const { values } = paramsToFields(kind, undefined)
    form.setFieldsValue({
      ...values,
      enabled: true,
      description: result.description,
      expression: result.expression,
      ...result.values,
    })
    setAdvancedJson(result.advanced ? JSON.stringify(result.advanced, null, 2) : '')
  }

  const handleSubmit = async () => {
    let values: Record<string, unknown>
    try {
      values = await form.validateFields()
    } catch {
      return
    }
    if (advancedJson.trim()) {
      try {
        const parsed = JSON.parse(advancedJson)
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
          throw new Error('not an object')
        }
      } catch {
        message.error(t('Action parameters must be valid JSON'))
        return
      }
    }
    if (editingRule) updateRule.mutate({ id: editingRule.id, values })
    else createRule.mutate(values)
  }

  const columns: ColumnsType<RulesetRule> = [
    {
      title: t('Order'),
      key: 'order',
      width: 108,
      render: (_v, _record, index) => (
        <span className="flex items-center gap-1">
          <span className="w-4 font-mono text-[12px] text-fg-3">{index + 1}</span>
          <Button
            size="small"
            type="text"
            icon={<ArrowUpOutlined />}
            disabled={index === 0 || reorderRules.isPending}
            onClick={() => moveRule(index, -1)}
          />
          <Button
            size="small"
            type="text"
            icon={<ArrowDownOutlined />}
            disabled={index === rules.length - 1 || reorderRules.isPending}
            onClick={() => moveRule(index, 1)}
          />
        </span>
      ),
    },
    {
      title: t('Name'),
      dataIndex: 'description',
      width: 200,
      ellipsis: { showTitle: false },
      render: (value: string, record) => (
        <Tooltip title={value || undefined}>
          <a onClick={() => setViewParams({ modal: `${kind}-edit`, edit: record.id })}>
            {value || t('Untitled rule')}
          </a>
        </Tooltip>
      ),
    },
    {
      title: t('Match against'),
      dataIndex: 'expression',
      render: (value: string) => (
        <span className="line-clamp-2 text-[12px] leading-[1.5] text-fg-3" title={value}>
          {value}
        </span>
      ),
    },
    {
      title: t('Action'),
      key: 'settings',
      width: 240,
      ellipsis: { showTitle: false },
      render: (_v, record) => {
        const labels = summarizeActionParameters(kind, record.actionParameters).map((label) => t(label))
        if (labels.length === 0) return <Text type="secondary">—</Text>
        const text = labels.join(', ')
        return (
          <Tooltip title={text}>
            <span className="text-[12.5px]">{text}</span>
          </Tooltip>
        )
      },
    },
    {
      title: t('Status'),
      dataIndex: 'enabled',
      key: 'status',
      width: 96,
      render: (enabled: boolean) => (
        <Tag color={enabled ? 'success' : 'default'} variant="filled">
          {enabled ? t('Active') : t('Disabled')}
        </Tag>
      ),
    },
    {
      title: '',
      key: 'operations',
      width: 48,
      render: (_v, record) => (
        <Dropdown
          trigger={['click']}
          menu={{
            items: [
              { key: 'edit', label: t('Edit') },
              { key: 'delete', label: t('Delete'), danger: true },
            ],
            onClick: ({ key }) => {
              if (key === 'edit') setViewParams({ modal: `${kind}-edit`, edit: record.id })
              else confirmDelete(record)
            },
          }}
        >
          <Button size="small" type="text" icon={<MoreOutlined />} />
        </Dropdown>
      ),
    },
  ]

  const renderField = (field: FieldDef) => (
    <Form.Item noStyle shouldUpdate key={field.name}>
      {({ getFieldsValue }) => {
        if (field.showIf && !field.showIf(getFieldsValue() as Record<string, unknown>)) return null
        const label = field.planNote ? `${t(field.label)} · ${field.planNote}` : t(field.label)
        return (
          <Form.Item
            name={field.name}
            label={label}
            tooltip={field.help}
            rules={
              field.required
                ? [{ required: true, message: t('This setting is required by Cloudflare') }]
                : undefined
            }
          >
            {field.type === 'bool3' ? (
              <Select
                options={BOOL3_OPTIONS.map((o) => ({ value: o.value, label: t(o.label) }))}
                allowClear={false}
              />
            ) : field.type === 'select' ? (
              <Select
                options={(field.options ?? []).map((o) => ({ value: o.value, label: t(o.label) }))}
                allowClear={false}
              />
            ) : field.type === 'number' ? (
              <InputNumber style={{ width: '100%' }} min={0} />
            ) : (
              <Input />
            )}
          </Form.Item>
        )
      }}
    </Form.Item>
  )

  return (
    <>
      <SectionHeader
        title={
          <span className="flex items-center gap-2">
            {t(KIND_TITLE[kind])}
            <Tag color="success" variant="filled">
              {t('{{count}} active', { count: rules.filter((r) => r.enabled).length })}
            </Tag>
          </span>
        }
        actions={
          /* Nút cấp section = outline; primary dành cho hành động chính ở fx-head */
          <Button
            size="small"
            icon={<PlusOutlined />}
            onClick={() => setViewParams({ modal: `${kind}-add`, edit: null })}
          >
            {t('Add Rule')}
          </Button>
        }
      />
      <div className="flex">
        <div className="min-w-0 flex-1 pt-3 pb-6">
          {data?.warnings?.length ? <Text type="warning">{data.warnings.join(', ')}</Text> : null}
          {isLoading ? (
            <div className="flex flex-col gap-[13px] px-1 py-3" data-testid={`${kind}-rules-skeleton`}>
              {Array.from({ length: 3 }).map((_, i) => (
                <SkeletonLine key={i} width={`${88 - i * 14}%`} />
              ))}
            </div>
          ) : rules.length === 0 ? (
            /* Bảng rỗng không render header — tránh cột bị bóp nát trên mobile */
            <EmptyState
              icon={kind === 'redirect' ? '⇄' : kind === 'cache' ? '⚡' : '⚙'}
              title={t('No {{kind}} created', { kind: t(KIND_TITLE[kind]) })}
              desc={t('Create the first rule with the button above')}
              className="!py-[24px]"
            />
          ) : (
          <Table
            loading={false}
            dataSource={rules}
            rowKey="id"
            columns={columns}
            pagination={false}
            size="small"
            tableLayout="fixed"
            scroll={{ x: 680 }}
            onRow={(record) => ({
              // Click cả dòng để sửa (đồng bộ với DNS/Page Rules); bỏ qua nút/menu.
              onClick: (event) => {
                const target = event.target as HTMLElement
                if (target.closest('button, .ant-dropdown, .ant-dropdown-trigger')) return
                setViewParams({ modal: `${kind}-edit`, edit: record.id })
              },
              style: { cursor: 'pointer' },
            })}
            rowClassName={(record) => (record.id === editId ? 'bg-bg-sel' : '')}
            locale={{ emptyText: t('No {{kind}} created', { kind: t(KIND_TITLE[kind]) }) }}
          />
          )}
        </div>

        {/* Panel cấu hình bên phải, thay cho modal */}
        <DetailPanel
          open={activeModal !== null}
          title={editingRule ? t('Edit Rule') : t('Add Rule')}
          onClose={closeModal}
          footer={
            <>
              {editingRule && (
                <Button danger onClick={() => confirmDelete(editingRule)}>
                  {t('Delete')}
                </Button>
              )}
              <span className="ml-auto flex gap-2">
                <Button onClick={closeModal}>{t('Cancel')}</Button>
                <Button
                  type="primary"
                  loading={createRule.isPending || updateRule.isPending}
                  onClick={handleSubmit}
                >
                  {t('Save')}
                </Button>
              </span>
            </>
          }
        >
          <Form form={form} layout="vertical">
          {presets.length > 0 && (
            <Form.Item
              label={t('Suggested configurations')}
              tooltip={t('Fills the form with a common setup — you can still edit everything before saving')}
            >
              <Select
                placeholder={t('Pick a common setup (optional)')}
                allowClear
                onChange={(value) => value && applyPreset(value)}
                options={presets.map((preset) => ({ value: preset.key, label: t(preset.label) }))}
                optionRender={(option) => {
                  const preset = presets.find((p) => p.key === option.value)
                  return (
                    <span className="flex flex-col py-0.5">
                      <span>{t(preset?.label ?? '')}</span>
                      <Text type="secondary" style={{ fontSize: 12, whiteSpace: 'normal' }}>
                        {preset?.hint}
                      </Text>
                    </span>
                  )
                }}
              />
            </Form.Item>
          )}
          <Form.Item name="description" label={t('Description')}>
            <Input placeholder={t('Optional description')} />
          </Form.Item>
          <Form.Item
            name="expression"
            label={t('If incoming requests match')}
            rules={[{ required: true, message: t('Expression is required') }]}
          >
            <ExpressionInput />
          </Form.Item>

          {fields.map(renderField)}

          <Collapse
            ghost
            items={[
              {
                key: 'advanced',
                label: t('Advanced action parameters (JSON)'),
                children: (
                  <>
                    <Input.TextArea
                      rows={6}
                      value={advancedJson}
                      onChange={(e) => setAdvancedJson(e.target.value)}
                      placeholder='{ "vary": { "default": { "action": "bypass" } } }'
                    />
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {t('Settings without a dedicated field are kept here and merged on save.')}
                    </Text>
                  </>
                ),
              },
            ]}
          />

          <Form.Item name="enabled" label={t('Enabled')} valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
        </DetailPanel>
      </div>
    </>
  )
}
