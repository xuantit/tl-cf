import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Popconfirm, Select, Table, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import ModernRulesPanel from '../../components/rules/ModernRulesPanel'
import PageRuleFormModal from '../../components/rules/PageRuleFormModal'
import type { PageRuleInput } from '../../components/rules/pageRulePresets'
import { SectionHeader, Tag } from '../../components/ui'
import { api, apiErrorDetail } from '../../services/api'
import type { PageRule } from '../../types/domain'

/**
 * Rules tab — thin wrapper around ModernRulesPanel (its logic and tests stay
 * untouched) plus the legacy Page Rules sub-view kept behind ?sub=legacy so
 * the /rules?zone= redirect contract still lands somewhere meaningful.
 */
export default function RulesTab({ zoneId, zoneName }: { zoneId: string; zoneName?: string }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()

  const sub = searchParams.get('sub') === 'legacy' ? 'legacy' : 'modern'
  const activeModal = searchParams.get('modal')
  const editId = searchParams.get('edit')

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

  const { data: rules = [], isLoading } = useQuery<PageRule[]>({
    queryKey: ['rules', zoneId],
    queryFn: async () => (await api.get(`/domains/${zoneId}/rules`)).data,
    enabled: !!zoneId,
  })

  const createRule = useMutation({
    mutationFn: async (data: PageRuleInput) => (await api.post(`/domains/${zoneId}/rules`, data)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rules', zoneId] })
      setParams({ modal: null, edit: null })
      message.success(t('Rule created'))
    },
    onError: (error) => {
      message.error(apiErrorDetail(error) || t('Failed to create rule'))
    },
  })

  const updateRule = useMutation({
    mutationFn: async ({ ruleId, data }: { ruleId: string; data: Partial<PageRule> | PageRuleInput }) =>
      (await api.put(`/domains/${zoneId}/rules/${ruleId}`, data)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rules', zoneId] })
      setParams({ modal: null, edit: null })
      message.success(t('Rule updated'))
    },
    onError: (error) => {
      message.error(apiErrorDetail(error) || t('Failed to update rule'))
    },
  })

  const deleteRule = useMutation({
    mutationFn: async (ruleId: string) => api.delete(`/domains/${zoneId}/rules/${ruleId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rules', zoneId] })
      message.success(t('Rule deleted'))
    },
    onError: (error) => {
      message.error(apiErrorDetail(error) || t('Failed to delete rule'))
    },
  })

  const editingRule = activeModal === 'rule-edit' ? (rules.find((r) => r.id === editId) ?? null) : null
  const editingRuleInput: PageRuleInput | undefined = editingRule
    ? {
        priority: editingRule.priority,
        status: editingRule.status,
        targets: editingRule.targets.map((target) => ({
          target: 'url',
          constraint: {
            operator:
              (target.constraint.operator as 'matches' | 'contains' | 'equals' | 'not_equal' | 'not_contain') ||
              'matches',
            value: target.constraint.value,
          },
        })),
        actions: editingRule.actions,
      }
    : undefined

  const legacyColumns: ColumnsType<PageRule> = [
    {
      title: '#',
      dataIndex: 'priority',
      key: 'priority',
      width: 50,
      render: (priority: number) => <span className="font-mono text-[12.5px] text-fg-3">{priority}</span>,
    },
    {
      title: 'Pattern',
      key: 'target',
      render: (_: unknown, record: PageRule) => (
        <span className="font-mono text-[12px] font-medium text-fg">
          {record.targets.map((tg) => tg.constraint.value).join(', ')}
        </span>
      ),
    },
    {
      title: t('Actions'),
      key: 'ruleActions',
      render: (_: unknown, record: PageRule) => (
        <span className="flex flex-wrap gap-1">
          {record.actions.map((a) => (
            <Tag key={a.id}>
              {a.id}
              {a.value !== undefined ? `=${JSON.stringify(a.value)}` : ''}
            </Tag>
          ))}
        </span>
      ),
    },
    {
      title: t('Status'),
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (status: PageRule['status'], record: PageRule) => (
        <Select
          size="small"
          value={status}
          style={{ width: 110 }}
          onChange={(next: PageRule['status']) => updateRule.mutate({ ruleId: record.id, data: { status: next } })}
          options={[
            { value: 'active', label: t('Active') },
            { value: 'disabled', label: t('Disabled') },
          ]}
        />
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 130,
      render: (_: unknown, record: PageRule) => (
        <span className="flex gap-1">
          <Button size="small" onClick={() => setParams({ modal: 'rule-edit', edit: record.id })}>
            {t('Edit')}
          </Button>
          <Popconfirm
            title={t('Delete this rule?')}
            okText={t('Delete')}
            cancelText={t('Cancel')}
            onConfirm={() => deleteRule.mutate(record.id)}
          >
            <Button size="small" danger>
              {t('Delete')}
            </Button>
          </Popconfirm>
        </span>
      ),
    },
  ]

  return (
    <>
      <SectionHeader
        title={sub === 'legacy' ? `${t('Page rules')} · ${rules.length} / 20` : t('Rules')}
        actions={
          <div className="flex gap-[6px]">
            <button
              type="button"
              onClick={() => setParams({ sub: null, modal: null, edit: null, kind: null })}
              className={`cursor-pointer rounded-[4px] border border-solid px-2 py-1 font-mono text-[11.5px] leading-none transition-colors ${
                sub === 'modern'
                  ? 'border-fg bg-fg text-bg'
                  : 'border-stroke bg-transparent text-fg-2 hover:text-fg'
              }`}
            >
              {t('Modern')}
            </button>
            <button
              type="button"
              onClick={() => setParams({ sub: 'legacy', modal: null, edit: null, kind: null })}
              className={`cursor-pointer rounded-[4px] border border-solid px-2 py-1 font-mono text-[11.5px] leading-none transition-colors ${
                sub === 'legacy'
                  ? 'border-fg bg-fg text-bg'
                  : 'border-stroke bg-transparent text-fg-2 hover:text-fg'
              }`}
            >
              {t('Page Rules (Legacy)')}
            </button>
          </div>
        }
      />

      {sub === 'modern' ? (
        <div className="pt-3">{zoneId && <ModernRulesPanel zoneId={zoneId} />}</div>
      ) : (
        <div className="pt-3">
          <Button
            type="primary"
            className="mb-3"
            onClick={() => setParams({ modal: 'rule-add', edit: null })}
          >
            + {t('Add Page Rule')}
          </Button>
          <Table
            loading={isLoading}
            dataSource={rules}
            rowKey="id"
            columns={legacyColumns}
            pagination={false}
            scroll={{ x: 'max-content' }}
          />
        </div>
      )}

      <PageRuleFormModal
        open={activeModal === 'rule-add'}
        title={t('Add Page Rule')}
        zoneName={zoneName}
        loading={createRule.isPending}
        onCancel={() => setParams({ modal: null, edit: null })}
        onSubmit={(payload) => createRule.mutate(payload)}
      />

      <PageRuleFormModal
        open={!!editingRule}
        title={t('Edit Page Rule')}
        zoneName={zoneName}
        initialValue={editingRuleInput}
        loading={updateRule.isPending}
        onCancel={() => setParams({ modal: null, edit: null })}
        onSubmit={(payload) => {
          if (!editingRule) return
          updateRule.mutate({ ruleId: editingRule.id, data: payload })
        }}
      />
    </>
  )
}
