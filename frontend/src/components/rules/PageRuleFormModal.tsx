import { useMemo, useState } from 'react'
import { Alert, Button, Divider, Form, Input, InputNumber, Select, Space, Typography } from 'antd'
import { message } from '../../lib/antdApp'
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { PAGE_RULE_PRESETS, type PageRuleInput } from './pageRulePresets'

const { Text } = Typography

type RuleStatus = 'active' | 'disabled'

type ActionValue = string | number | boolean | Record<string, unknown>

type FormValues = {
  targetValue: string
  status: RuleStatus
  actions: Array<{ id?: string; value?: ActionValue }>
}

interface Props {
  zoneName?: string
  loading?: boolean
  initialValue?: PageRuleInput
  onSubmit: (values: PageRuleInput) => void
  onCancel: () => void
  /** Hiện nút Xoá khi đang sửa rule (design panel). */
  onDelete?: () => void
}

/**
 * Form tạo/sửa Page Rule (legacy) — render bên trong DetailPanel (panel trượt
 * phải). Caller phải gắn `key` theo rule đang sửa để remount và nhận
 * initialValues mới (panel giữ children luôn mounted).
 */

const NO_VALUE_ACTIONS = new Set(['always_use_https', 'disable_performance', 'disable_security', 'disable_apps'])
const ON_OFF_ACTIONS = new Set(['automatic_https_rewrites', 'rocket_loader', 'ip_geolocation'])
const NUMBER_ACTIONS = new Set(['browser_cache_ttl', 'edge_cache_ttl'])
const SELECT_ACTIONS: Record<string, Array<{ value: string; label: string }>> = {
  cache_level: [
    { value: 'bypass', label: 'Bypass' },
    { value: 'basic', label: 'No Query String' },
    { value: 'simplified', label: 'Ignore Query String' },
    { value: 'aggressive', label: 'Standard' },
    { value: 'cache_everything', label: 'Cache Everything' },
  ],
  ssl: [
    { value: 'off', label: 'Off' },
    { value: 'flexible', label: 'Flexible' },
    { value: 'full', label: 'Full' },
    { value: 'strict', label: 'Full (strict)' },
    { value: 'origin_pull', label: 'Authenticated Origin Pull' },
  ],
  security_level: [
    { value: 'off', label: 'Off' },
    { value: 'essentially_off', label: 'Essentially Off' },
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' },
    { value: 'under_attack', label: "I'm Under Attack!" },
  ],
}

// Human-friendly setting names to mirror the Cloudflare dashboard "Pick a Setting" list.
const ACTION_OPTIONS = [
  { value: 'forwarding_url', label: 'Forwarding URL' },
  { value: 'always_use_https', label: 'Always Use HTTPS' },
  { value: 'automatic_https_rewrites', label: 'Automatic HTTPS Rewrites' },
  { value: 'ssl', label: 'SSL' },
  { value: 'cache_level', label: 'Cache Level' },
  { value: 'browser_cache_ttl', label: 'Browser Cache TTL' },
  { value: 'edge_cache_ttl', label: 'Edge Cache TTL' },
  { value: 'security_level', label: 'Security Level' },
  { value: 'rocket_loader', label: 'Rocket Loader' },
  { value: 'ip_geolocation', label: 'IP Geolocation Header' },
  { value: 'disable_performance', label: 'Disable Performance' },
  { value: 'disable_security', label: 'Disable Security' },
]

function toFormValues(initialValue?: PageRuleInput, zoneName?: string): FormValues {
  return {
    targetValue: initialValue?.targets?.[0]?.constraint?.value ?? (zoneName ? `www.${zoneName}/*` : ''),
    status: (initialValue?.status as RuleStatus) ?? 'active',
    actions: initialValue?.actions?.length ? (initialValue.actions as FormValues['actions']) : [],
  }
}

function defaultValueForAction(actionId: string): unknown {
  if (NO_VALUE_ACTIONS.has(actionId)) return undefined
  if (actionId === 'forwarding_url') return { status_code: 301, url: '' }
  if (ON_OFF_ACTIONS.has(actionId)) return 'on'
  if (actionId === 'browser_cache_ttl' || actionId === 'edge_cache_ttl') return 86400
  if (actionId === 'cache_level') return 'cache_everything'
  if (actionId === 'ssl') return 'full'
  if (actionId === 'security_level') return 'medium'
  return ''
}

function ActionValueEditor({ fieldName, actionId }: { fieldName: number; actionId?: string }) {
  if (!actionId || NO_VALUE_ACTIONS.has(actionId)) return null

  if (actionId === 'forwarding_url') {
    return (
      <Space.Compact style={{ width: '100%' }}>
        <Form.Item
          style={{ marginBottom: 0, width: 160 }}
          name={[fieldName, 'value', 'status_code']}
          rules={[{ required: true, message: 'Required' }]}
        >
          <Select
            options={[
              { value: 301, label: '301 (Permanent)' },
              { value: 302, label: '302 (Temporary)' },
            ]}
          />
        </Form.Item>
        <Form.Item
          style={{ marginBottom: 0, flex: 1 }}
          name={[fieldName, 'value', 'url']}
          rules={[{ required: true, message: 'Required' }]}
        >
          <Input placeholder='https://www.example.com/$1' />
        </Form.Item>
      </Space.Compact>
    )
  }

  if (ON_OFF_ACTIONS.has(actionId)) {
    return (
      <Form.Item style={{ marginBottom: 0 }} name={[fieldName, 'value']} rules={[{ required: true }]}>
        <Select
          style={{ width: '100%' }}
          options={[
            { value: 'on', label: 'On' },
            { value: 'off', label: 'Off' },
          ]}
        />
      </Form.Item>
    )
  }

  if (NUMBER_ACTIONS.has(actionId)) {
    return (
      <Form.Item style={{ marginBottom: 0 }} name={[fieldName, 'value']} rules={[{ required: true }]}>
        <InputNumber style={{ width: '100%' }} min={0} addonAfter='s' />
      </Form.Item>
    )
  }

  if (SELECT_ACTIONS[actionId]) {
    return (
      <Form.Item style={{ marginBottom: 0 }} name={[fieldName, 'value']} rules={[{ required: true }]}>
        <Select style={{ width: '100%' }} options={SELECT_ACTIONS[actionId]} />
      </Form.Item>
    )
  }

  return (
    <Form.Item style={{ marginBottom: 0 }} name={[fieldName, 'value']} rules={[{ required: true }]}>
      <Input placeholder='value' />
    </Form.Item>
  )
}

export default function PageRuleFormModal({
  zoneName,
  loading,
  initialValue,
  onSubmit,
  onCancel,
  onDelete,
}: Props) {
  const { t } = useTranslation()
  const [form] = Form.useForm<FormValues>()
  const [selectedPreset, setSelectedPreset] = useState<string>('custom')

  const isEdit = !!initialValue

  const presetOptions = useMemo(
    () => [
      { value: 'custom', label: t('Custom') },
      ...PAGE_RULE_PRESETS.map((preset) => ({ value: preset.key, label: t(preset.nameKey) })),
    ],
    [t],
  )

  const applyPreset = (presetKey: string) => {
    setSelectedPreset(presetKey)
    if (presetKey === 'custom') {
      form.resetFields()
      form.setFieldsValue(toFormValues(undefined, zoneName))
      return
    }
    const preset = PAGE_RULE_PRESETS.find((item) => item.key === presetKey)
    if (!preset) return

    const zone = zoneName || 'example.com'
    const values = preset.build(zone)
    // Reset first so stale nested action values don't linger, then apply the preset.
    form.resetFields()
    form.setFieldsValue({
      targetValue: values.targets[0]?.constraint.value ?? '',
      status: values.status ?? 'active',
      actions: values.actions.map((action) => ({ id: action.id, value: action.value as ActionValue })),
    })
  }

  const handleFinish = (values: FormValues) => {
    const actions = (values.actions ?? []).filter((action) => !!action.id)
    if (actions.length === 0) {
      message.error(t('At least one action is required'))
      return
    }

    const forwardingCount = actions.filter((action) => action.id === 'forwarding_url').length
    if (forwardingCount > 0 && actions.length > 1) {
      message.error(t('forwarding_url cannot be combined with other actions'))
      return
    }

    const normalizedActions = actions.map((action) =>
      NO_VALUE_ACTIONS.has(action.id as string) ? { id: action.id as string } : { id: action.id as string, value: action.value },
    )

    onSubmit({
      status: values.status,
      targets: [
        {
          target: 'url',
          constraint: {
            operator: 'matches',
            value: values.targetValue,
          },
        },
      ],
      actions: normalizedActions,
    })
  }

  return (
    <Form form={form} layout='vertical' onFinish={handleFinish} initialValues={toFormValues(initialValue, zoneName)}>
        {!isEdit && (
          <Form.Item label={t('Load a template')}>
            <Select value={selectedPreset} onChange={applyPreset} options={presetOptions} />
          </Form.Item>
        )}

        {!isEdit && selectedPreset !== 'custom' && (
          <Alert
            type='info'
            style={{ marginBottom: 16 }}
            message={t(PAGE_RULE_PRESETS.find((item) => item.key === selectedPreset)?.descriptionKey || '')}
          />
        )}

        {/* If the URL matches */}
        <Text strong>{t('If the URL matches:')}</Text>
        <Form.Item
          label='URL'
          required
          name='targetValue'
          style={{ marginTop: 8 }}
          rules={[{ required: true, message: t('URL pattern is required') }]}
          extra={t('Example: www.{{zone}}/*', { zone: zoneName || 'example.com' })}
        >
          <Input placeholder={`www.${zoneName || 'example.com'}/*`} />
        </Form.Item>

        <Divider style={{ margin: '12px 0' }} />

        {/* Then the settings are */}
        <Text strong>{t('Then the settings are:')}</Text>
        <Form.List name='actions'>
          {(fields, { add, remove }) => (
            <Space orientation='vertical' style={{ width: '100%', marginTop: 8 }} size='small'>
              {fields.map((field) => (
                <div key={field.key} className="flex flex-wrap items-start gap-2">
                  <Form.Item
                    name={[field.name, 'id']}
                    style={{ marginBottom: 0, flex: '1 1 170px', minWidth: 170 }}
                    rules={[{ required: true, message: t('Pick a Setting') }]}
                  >
                    <Select
                      placeholder={t('Pick a Setting')}
                      options={ACTION_OPTIONS}
                      onChange={(nextActionId) => {
                        const current = form.getFieldValue('actions') || []
                        current[field.name] = { id: nextActionId, value: defaultValueForAction(nextActionId) }
                        form.setFieldsValue({ actions: current })
                      }}
                    />
                  </Form.Item>

                  <div style={{ flex: '1 1 180px', minWidth: 180 }}>
                    {/* shouldUpdate ensures the value editor re-renders when the setting changes or a template is loaded */}
                    <Form.Item
                      noStyle
                      shouldUpdate={(prev, curr) =>
                        prev.actions?.[field.name]?.id !== curr.actions?.[field.name]?.id
                      }
                    >
                      {() => (
                        <ActionValueEditor
                          fieldName={field.name}
                          actionId={form.getFieldValue(['actions', field.name, 'id'])}
                        />
                      )}
                    </Form.Item>
                  </div>

                  <Button icon={<DeleteOutlined />} onClick={() => remove(field.name)} />
                </div>
              ))}

              <Button type='dashed' icon={<PlusOutlined />} onClick={() => add({ id: undefined, value: undefined })}>
                {t('Add a Setting')}
              </Button>
            </Space>
          )}
        </Form.List>

        <Divider style={{ margin: '12px 0' }} />

        <Form.Item label={t('Status')} name='status' style={{ width: 200 }}>
          <Select
            options={[
              { value: 'active', label: t('Active') },
              { value: 'disabled', label: t('Disabled') },
            ]}
          />
        </Form.Item>

        <Form.Item style={{ marginTop: 8, marginBottom: 0 }}>
          <div className="flex w-full items-center gap-2">
            {isEdit && onDelete && (
              <Button danger onClick={onDelete}>
                {t('Delete')}
              </Button>
            )}
            <span className="ml-auto flex gap-2">
              <Button onClick={onCancel}>{t('Cancel')}</Button>
              <Button type='primary' htmlType='submit' loading={loading}>
                {isEdit ? t('Update') : t('Save and Deploy')}
              </Button>
            </span>
          </div>
        </Form.Item>
      </Form>
  )
}
