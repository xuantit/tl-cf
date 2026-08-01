import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AutoComplete, Button, Dropdown, Form, Input, Modal, Select, Switch, Table } from 'antd'
import { message } from '../lib/antdApp'
import type { ColumnsType } from 'antd/es/table'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api, apiErrorDetail } from '../services/api'
import { useAccountStore } from '../stores/useAccountStore'
import type { Zone } from '../types/domain'
import PageHeader from '../components/PageHeader'
import ConfirmDestructive from '../components/ConfirmDestructive'
import { Banner, Dot, EmptyState, SectionHeader, SkeletonLine, Tag } from '../components/ui'

interface TagRow {
  name: string
  domainCount: number
  description?: string | null
  templateId?: string | null
  createdAt?: string
}

type RuleField = 'name' | 'plan'
type RuleOp = 'endsWith' | 'startsWith' | 'contains' | 'equals'

interface TagRule {
  id: string
  field: RuleField
  op: RuleOp
  value: string
  tag: string
  enabled: boolean
  createdAt?: string
}

interface TemplateOption {
  id: string
  name: string
}

interface TagFormValues {
  name: string
  description?: string
  templateId?: string | null
}

interface RuleFormValues {
  field: RuleField
  op: RuleOp
  value: string
  tag: string
  enabled: boolean
}

/** Client-side rule matching mirroring the backend's matchTagRules (case-insensitive). */
function matchZones(zones: Zone[], rule: { field: RuleField; op: RuleOp; value: string }): Zone[] {
  const value = rule.value.trim().toLowerCase()
  if (!value) return []
  return zones.filter((zone) => {
    const target = (rule.field === 'name' ? zone.name : zone.plan || '').toLowerCase()
    switch (rule.op) {
      case 'endsWith':
        return target.endsWith(value)
      case 'startsWith':
        return target.startsWith(value)
      case 'contains':
        return target.includes(value)
      case 'equals':
        return target === value
    }
  })
}

function formatDate(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Tags manager (route /tags) — 2.html "tags" view. */
export default function Tags() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const activeAccountId = useAccountStore((s) => s.activeAccountId)
  const [tagForm] = Form.useForm<TagFormValues>()
  const [ruleForm] = Form.useForm<RuleFormValues>()

  const [tagModal, setTagModal] = useState<{ mode: 'create' } | { mode: 'edit'; tag: TagRow } | null>(null)
  const [deleteTag, setDeleteTag] = useState<TagRow | null>(null)
  const [ruleModal, setRuleModal] = useState<{ mode: 'create' } | { mode: 'edit'; rule: TagRule } | null>(null)
  // Per-rule server preview results (POST /tags/rules/:id/preview)
  const [rulePreviews, setRulePreviews] = useState<Record<string, { matchedCount: number; sample: string[] }>>({})
  // Client-side preview inside the rule modal (works before the rule exists)
  const [modalPreview, setModalPreview] = useState<{ matchedCount: number; sample: string[] } | null>(null)

  const { data: tags = [], isLoading, isError, error, refetch } = useQuery<TagRow[]>({
    queryKey: ['tags', activeAccountId],
    queryFn: async () => (await api.get('/tags')).data,
  })

  const { data: rules = [] } = useQuery<TagRule[]>({
    queryKey: ['tag-rules'],
    queryFn: async () => (await api.get('/tags/rules')).data,
  })

  const { data: templates = [] } = useQuery<TemplateOption[]>({
    queryKey: ['templates'],
    queryFn: async () => (await api.get('/templates')).data,
    staleTime: 60_000,
  })

  // Shares the ['domains'] cache with the Domains page — used for the modal rule preview.
  const { data: zones = [] } = useQuery<Zone[]>({
    queryKey: ['domains'],
    queryFn: async () => (await api.get('/domains')).data,
    staleTime: 60_000,
  })

  const templateName = useMemo(() => {
    const map = new Map(templates.map((tpl) => [tpl.id, tpl.name]))
    return (id?: string | null) => (id ? map.get(id) : undefined)
  }, [templates])

  const invalidateTags = () => {
    queryClient.invalidateQueries({ queryKey: ['tags'] })
    // Tags are merged into the zone list server-side
    queryClient.invalidateQueries({ queryKey: ['domains'] })
  }

  const saveTagMutation = useMutation({
    mutationFn: async (values: TagFormValues) => {
      if (tagModal?.mode === 'edit') {
        const res = await api.put(`/tags/${encodeURIComponent(tagModal.tag.name)}`, {
          newName: values.name !== tagModal.tag.name ? values.name : undefined,
          description: values.description ?? null,
          templateId: values.templateId ?? null,
        })
        return res.data as { name: string; affectedDomains: number }
      }
      const res = await api.post('/tags', {
        name: values.name,
        description: values.description || undefined,
        templateId: values.templateId || undefined,
      })
      return res.data as { name: string; affectedDomains?: number }
    },
    onSuccess: (data) => {
      if (tagModal?.mode === 'edit' && (data.affectedDomains ?? 0) > 0) {
        message.success(t('Tag renamed — {{count}} domains updated', { count: data.affectedDomains }))
      } else {
        message.success(t('Tag saved'))
      }
      setTagModal(null)
      tagForm.resetFields()
      invalidateTags()
    },
    onError: (error) => {
      message.error(apiErrorDetail(error) || t('Could not save the tag'))
    },
  })

  const deleteTagMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await api.delete(`/tags/${encodeURIComponent(name)}`)
      return res.data as { affectedDomains: number }
    },
    onSuccess: (data) => {
      message.success(t('Tag deleted — removed from {{count}} domains', { count: data.affectedDomains }))
      setDeleteTag(null)
      invalidateTags()
    },
    onError: (error) => {
      message.error(apiErrorDetail(error) || t('Could not delete the tag'))
    },
  })

  const saveRuleMutation = useMutation({
    mutationFn: async (values: RuleFormValues) => {
      if (ruleModal?.mode === 'edit') {
        return (await api.put(`/tags/rules/${ruleModal.rule.id}`, values)).data
      }
      return (await api.post('/tags/rules', values)).data
    },
    onSuccess: () => {
      message.success(t('Rule saved'))
      setRuleModal(null)
      ruleForm.resetFields()
      setModalPreview(null)
      queryClient.invalidateQueries({ queryKey: ['tag-rules'] })
      queryClient.invalidateQueries({ queryKey: ['domains'] })
    },
    onError: (error) => {
      message.error(apiErrorDetail(error) || t('Could not save the rule'))
    },
  })

  const toggleRuleMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) =>
      (await api.put(`/tags/rules/${id}`, { enabled })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tag-rules'] })
      queryClient.invalidateQueries({ queryKey: ['domains'] })
    },
    onError: (error) => {
      message.error(apiErrorDetail(error) || t('Could not update the rule'))
    },
  })

  const deleteRuleMutation = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/tags/rules/${id}`)).data,
    onSuccess: () => {
      message.success(t('Rule deleted'))
      queryClient.invalidateQueries({ queryKey: ['tag-rules'] })
      queryClient.invalidateQueries({ queryKey: ['domains'] })
    },
    onError: (error) => {
      message.error(apiErrorDetail(error) || t('Could not delete the rule'))
    },
  })

  const previewRuleMutation = useMutation({
    mutationFn: async (id: string) =>
      (await api.post(`/tags/rules/${id}/preview`)).data as { matchedCount: number; sample: string[] },
    onSuccess: (data, id) => {
      setRulePreviews((prev) => ({ ...prev, [id]: data }))
    },
    onError: (error) => {
      message.error(apiErrorDetail(error) || t('Could not preview the rule'))
    },
  })

  const openTagModal = (target: TagRow | null) => {
    if (target) {
      setTagModal({ mode: 'edit', tag: target })
      tagForm.setFieldsValue({
        name: target.name,
        description: target.description ?? undefined,
        templateId: target.templateId ?? undefined,
      })
    } else {
      setTagModal({ mode: 'create' })
      tagForm.resetFields()
    }
  }

  const openRuleModal = (target: TagRule | null) => {
    setModalPreview(null)
    if (target) {
      setRuleModal({ mode: 'edit', rule: target })
      ruleForm.setFieldsValue({
        field: target.field,
        op: target.op,
        value: target.value,
        tag: target.tag,
        enabled: target.enabled,
      })
    } else {
      setRuleModal({ mode: 'create' })
      ruleForm.resetFields()
      ruleForm.setFieldsValue({ field: 'name', op: 'endsWith', enabled: true })
    }
  }

  const runModalPreview = () => {
    const values = ruleForm.getFieldsValue()
    if (!values.value?.trim()) {
      message.warning(t('Enter a value to preview'))
      return
    }
    const matched = matchZones(zones, { field: values.field, op: values.op, value: values.value })
    setModalPreview({ matchedCount: matched.length, sample: matched.slice(0, 5).map((z) => z.name) })
  }

  const columns: ColumnsType<TagRow> = [
    {
      title: 'Tag',
      dataIndex: 'name',
      key: 'name',
      render: (name: string) => <Tag variant="acc">{name}</Tag>,
    },
    {
      title: 'Domains',
      dataIndex: 'domainCount',
      key: 'domainCount',
      width: 100,
      render: (count: number) => (
        <span className={`font-mono text-[11.5px] ${count === 0 ? 'text-fg-3' : 'text-fg-2'}`}>{count}</span>
      ),
    },
    {
      title: t('Description'),
      dataIndex: 'description',
      key: 'description',
      responsive: ['md'],
      render: (desc?: string | null) =>
        desc ? <span className="text-[12px] text-fg-2">{desc}</span> : <span className="text-fg-3">—</span>,
    },
    {
      title: t('Attached template'),
      dataIndex: 'templateId',
      key: 'templateId',
      responsive: ['lg'],
      render: (id?: string | null) => {
        const name = templateName(id)
        return name ? <Tag>{name}</Tag> : <span className="text-fg-3">—</span>
      },
    },
    {
      title: t('Created'),
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 120,
      responsive: ['lg'],
      render: (iso?: string) => <span className="font-mono text-[11px] text-fg-3">{formatDate(iso)}</span>,
    },
    {
      title: '',
      key: 'actions',
      width: 44,
      align: 'right',
      render: (_: unknown, row: TagRow) => (
        <Dropdown
          trigger={['click']}
          menu={{
            items: [
              { key: 'edit', label: t('Edit / rename') },
              { key: 'delete', label: t('Delete'), danger: true },
            ],
            onClick: ({ key, domEvent }) => {
              domEvent.stopPropagation()
              if (key === 'edit') openTagModal(row)
              if (key === 'delete') setDeleteTag(row)
            },
          }}
        >
          <Button size="small" type="text" onClick={(e) => e.stopPropagation()} aria-label={t('Tag actions')}>
            ⋯
          </Button>
        </Dropdown>
      ),
    },
  ]

  return (
    <div className="fade-in p-[clamp(12px,3vw,24px)]">
      <PageHeader
        title="Tags"
        crumb={t('{{count}} labels · group domains for bulk operations', { count: tags.length })}
        actions={
          <Button type="primary" onClick={() => openTagModal(null)}>
            + {t('Create tag')}
          </Button>
        }
      />

      {isError && (
        <Banner
          tone="err"
          className="mb-3"
          actions={
            <Button size="small" onClick={() => refetch()}>
              ↻ {t('Retry')}
            </Button>
          }
        >
          {apiErrorDetail(error) || t('Could not load tags')}
        </Banner>
      )}

      {isLoading ? (
        <div className="flex flex-col gap-[14px] p-4" data-testid="tags-skeleton">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonLine key={i} width={`${88 - (i % 3) * 14}%`} />
          ))}
        </div>
      ) : (
        <Table
          dataSource={tags}
          rowKey="name"
          columns={columns}
          pagination={false}
          rowClassName="hover-row"
          onRow={(row) => ({
            onClick: () => navigate(`/?tab=tag&tag=${encodeURIComponent(row.name)}`),
          })}
          locale={{
            emptyText: (
              <EmptyState
                icon="⊘"
                title={t('No tags yet')}
                desc={t('Create a tag or assign tags from the domain list')}
                actions={
                  <Button type="primary" size="small" onClick={() => openTagModal(null)}>
                    + {t('Create tag')}
                  </Button>
                }
              />
            ),
          }}
          scroll={{ x: 'max-content' }}
        />
      )}

      <SectionHeader
        title={t('Auto-tagging · {{count}} rules', { count: rules.length })}
        actions={
          <Button size="small" onClick={() => openRuleModal(null)}>
            + {t('Rule')}
          </Button>
        }
        className="mt-4"
      />
      {rules.length === 0 ? (
        <EmptyState
          icon="⚙"
          title={t('No auto-tagging rules')}
          desc={t('Rules tag zones automatically by name or plan')}
        />
      ) : (
        <table className="w-full border-collapse">
          <tbody>
            {rules.map((rule) => (
              <tr
                key={rule.id}
                className={`border-0 border-b border-solid border-stroke-2 ${rule.enabled ? '' : 'opacity-55'}`}
              >
                <td className="h-[29px] pl-4 font-mono text-[12px] font-medium whitespace-nowrap text-fg">
                  {rule.field} {rule.op} <Tag>{rule.value}</Tag>
                </td>
                <td className="h-[29px] px-[10px]">
                  <Tag variant="acc">{rule.tag}</Tag>
                </td>
                <td className="h-[29px] px-[10px] font-mono text-[11.5px] whitespace-nowrap text-fg-2">
                  {rulePreviews[rule.id] ? (
                    t('{{count}} zones', { count: rulePreviews[rule.id].matchedCount })
                  ) : (
                    <Button
                      size="small"
                      type="text"
                      className="!font-mono !text-[11px] !text-info"
                      loading={previewRuleMutation.isPending && previewRuleMutation.variables === rule.id}
                      onClick={() => previewRuleMutation.mutate(rule.id)}
                    >
                      {t('count matches')}
                    </Button>
                  )}
                </td>
                <td className="h-[29px] px-[10px] whitespace-nowrap">
                  <span className="inline-flex items-center gap-[7px]">
                    <Dot status={rule.enabled ? 'ok' : 'off'} />
                    <Switch
                      size="small"
                      checked={rule.enabled}
                      onChange={(enabled) => toggleRuleMutation.mutate({ id: rule.id, enabled })}
                      aria-label={t('Toggle rule')}
                    />
                  </span>
                </td>
                <td className="h-[29px] pr-4 text-right">
                  <Dropdown
                    trigger={['click']}
                    menu={{
                      items: [
                        { key: 'edit', label: t('Edit') },
                        { key: 'delete', label: t('Delete'), danger: true },
                      ],
                      onClick: ({ key }) => {
                        if (key === 'edit') openRuleModal(rule)
                        if (key === 'delete') deleteRuleMutation.mutate(rule.id)
                      },
                    }}
                  >
                    <Button size="small" type="text" aria-label={t('Rule actions')}>
                      ⋯
                    </Button>
                  </Dropdown>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Create / edit tag */}
      <Modal
        title={tagModal?.mode === 'edit' ? t('Edit tag') : t('Create tag')}
        open={tagModal !== null}
        onCancel={() => setTagModal(null)}
        onOk={() => tagForm.submit()}
        okText={t('Save')}
        cancelText={t('Cancel')}
        confirmLoading={saveTagMutation.isPending}
        destroyOnHidden={false}
      >
        <Form form={tagForm} layout="vertical" onFinish={(values) => saveTagMutation.mutate(values)}>
          <Form.Item
            label={t('Tag name')}
            name="name"
            rules={[
              { required: true, message: t('Please enter a tag name') },
              { max: 40, message: t('Maximum 40 characters') },
            ]}
          >
            <Input placeholder="prod" autoFocus />
          </Form.Item>
          <Form.Item label={t('Description')} name="description">
            <Input placeholder={t('e.g. Production environment')} maxLength={200} />
          </Form.Item>
          <Form.Item label={t('Attached template')} name="templateId" help={t('Optional — suggested when applying templates to this tag')}>
            <Select
              allowClear
              placeholder={t('No template')}
              options={templates.map((tpl) => ({ value: tpl.id, label: tpl.name }))}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* Delete tag */}
      <ConfirmDestructive
        open={deleteTag !== null}
        title={t('Delete tag {{name}}?', { name: deleteTag?.name ?? '' })}
        explanation={t('The tag will be removed from all {{count}} domains that use it. Domains themselves are not affected.', {
          count: deleteTag?.domainCount ?? 0,
        })}
        confirmText={deleteTag?.name ?? ''}
        confirmLabel={t('Delete tag')}
        loading={deleteTagMutation.isPending}
        onConfirm={() => deleteTag && deleteTagMutation.mutate(deleteTag.name)}
        onCancel={() => setDeleteTag(null)}
      />

      {/* Create / edit rule */}
      <Modal
        title={ruleModal?.mode === 'edit' ? t('Edit rule') : t('New auto-tagging rule')}
        open={ruleModal !== null}
        onCancel={() => setRuleModal(null)}
        footer={
          <div className="flex items-center gap-[7px]">
            <Button onClick={runModalPreview}>{t('Preview matches')}</Button>
            {modalPreview && (
              <span className="font-mono text-[11px] text-fg-2">
                {t('{{count}} zones', { count: modalPreview.matchedCount })}
                {modalPreview.sample.length > 0 && (
                  <span className="text-fg-3"> · {modalPreview.sample.join(', ')}</span>
                )}
              </span>
            )}
            <span className="flex-1" />
            <Button onClick={() => setRuleModal(null)}>{t('Cancel')}</Button>
            <Button type="primary" loading={saveRuleMutation.isPending} onClick={() => ruleForm.submit()}>
              {t('Save')}
            </Button>
          </div>
        }
      >
        <Form form={ruleForm} layout="vertical" onFinish={(values) => saveRuleMutation.mutate(values)}>
          <div className="flex gap-[9px]">
            <Form.Item label={t('Field')} name="field" className="flex-1" rules={[{ required: true }]}>
              <Select
                options={[
                  { value: 'name', label: 'name' },
                  { value: 'plan', label: 'plan' },
                ]}
              />
            </Form.Item>
            <Form.Item label={t('Condition')} name="op" className="flex-1" rules={[{ required: true }]}>
              <Select
                options={[
                  { value: 'endsWith', label: 'endsWith' },
                  { value: 'startsWith', label: 'startsWith' },
                  { value: 'contains', label: 'contains' },
                  { value: 'equals', label: 'equals' },
                ]}
              />
            </Form.Item>
          </div>
          <Form.Item label={t('Value')} name="value" rules={[{ required: true, message: t('Please enter a value') }]}>
            <Input placeholder=".shop" className="font-mono" />
          </Form.Item>
          <Form.Item label={t('Assign tag')} name="tag" rules={[{ required: true, message: t('Please enter a tag name') }]}>
            <AutoComplete
              options={tags.map((tag) => ({ value: tag.name }))}
              placeholder="shop"
              filterOption={(input, option) =>
                (option?.value ?? '').toLowerCase().includes(input.toLowerCase())
              }
            />
          </Form.Item>
          <Form.Item label={t('Enabled')} name="enabled" valuePropName="checked">
            <Switch size="small" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
