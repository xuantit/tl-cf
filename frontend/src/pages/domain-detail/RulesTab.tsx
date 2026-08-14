import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Popconfirm, Select, Table } from 'antd'
import { message } from '../../lib/antdApp'
import type { ColumnsType } from 'antd/es/table'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import RulesetRulesPanel from '../../components/rules/RulesetRulesPanel'
import PageRuleFormModal from '../../components/rules/PageRuleFormModal'
import type { PageRuleInput } from '../../components/rules/pageRulePresets'
import { DetailPanel, EmptyState, SectionHeader, SkeletonLine, Tag } from '../../components/ui'
import { api, apiErrorDetail } from '../../services/api'
import type { PageRule } from '../../types/domain'

/**
 * Rules tab — Page Rules (Legacy) + Redirect Rules + Configuration Rules.
 *
 * Cache Rules thuộc tab Cache (cùng chỗ với các thiết lập cache khác), nên link
 * cũ dạng ?tab=rules&kind=cache được chuyển hướng sang tab Cache.
 */
export default function RulesTab({ zoneId, zoneName }: { zoneId: string; zoneName?: string }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()

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

  // Tương thích ngược: Cache Rules đã chuyển sang tab Cache.
  const kindParam = searchParams.get('kind')
  useEffect(() => {
    if (kindParam === 'cache') setParams({ tab: 'cache' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kindParam])

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

  const legacyPanelOpen = activeModal === 'rule-add' || !!editingRule

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
        title={`${t('Page rules')} · ${rules.length} / 20`}
        actions={
          /* Nút cấp section = outline để phân tầng với hành động chính ở fx-head */
          <Button size="small" onClick={() => setParams({ modal: 'rule-add', edit: null })}>
            + {t('Add Page Rule')}
          </Button>
        }
      />
      <div className="flex">
        <div className="min-w-0 flex-1 pt-3 pb-6">
          {isLoading ? (
            <div className="flex flex-col gap-[13px] px-1 py-3" data-testid="page-rules-skeleton">
              {Array.from({ length: 3 }).map((_, i) => (
                <SkeletonLine key={i} width={`${88 - i * 14}%`} />
              ))}
            </div>
          ) : rules.length === 0 ? (
            <EmptyState
              icon="⊞"
              title={t('No page rules')}
              desc={t('Create the first rule with the button above')}
              className="!py-[24px]"
            />
          ) : (
          <Table
            dataSource={rules}
            rowKey="id"
            columns={legacyColumns}
            pagination={false}
            size="small"
            scroll={{ x: 560 }}
            onRow={(record) => ({
              onClick: (event) => {
                // Bỏ qua click vào Select trạng thái / nút Edit-Delete / popconfirm
                const target = event.target as HTMLElement
                if (target.closest('button, .ant-select, .ant-popover')) return
                setParams({ modal: 'rule-edit', edit: record.id })
              },
              style: { cursor: 'pointer' },
            })}
            rowClassName={(record) => (record.id === editId ? 'bg-bg-sel' : '')}
          />
          )}
        </div>

        {/* Panel trượt bên phải thay cho modal — đẩy bảng co lại như design */}
        <DetailPanel
          open={legacyPanelOpen}
          title={editingRule ? t('Edit Page Rule') : t('Add Page Rule')}
          onClose={() => setParams({ modal: null, edit: null })}
        >
          {legacyPanelOpen && (
            <PageRuleFormModal
              key={editingRule?.id ?? 'new'}
              zoneName={zoneName}
              initialValue={editingRuleInput}
              loading={createRule.isPending || updateRule.isPending}
              onCancel={() => setParams({ modal: null, edit: null })}
              onDelete={
                editingRule
                  ? () => {
                      deleteRule.mutate(editingRule.id)
                      setParams({ modal: null, edit: null })
                    }
                  : undefined
              }
              onSubmit={(payload) => {
                if (editingRule) updateRule.mutate({ ruleId: editingRule.id, data: payload })
                else createRule.mutate(payload)
              }}
            />
          )}
        </DetailPanel>
      </div>

      {zoneId && <RulesetRulesPanel zoneId={zoneId} kind="redirect" zoneName={zoneName} />}
      {zoneId && <RulesetRulesPanel zoneId={zoneId} kind="configuration" zoneName={zoneName} />}
    </>
  )
}
