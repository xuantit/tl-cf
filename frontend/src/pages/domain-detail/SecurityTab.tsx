import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { Button, Input, Popconfirm, Select, Switch, Table } from 'antd'
import { message } from '../../lib/antdApp'
import type { ColumnsType } from 'antd/es/table'
import { useTranslation } from 'react-i18next'
import { Banner, DetailPanel, EmptyState, KvRow, Lbl, SectionHeader, SkeletonLine, Tag } from '../../components/ui'
import RulesetRulesPanel from '../../components/rules/RulesetRulesPanel'
import { api, apiErrorDetail } from '../../services/api'
import type { SecuritySettings, SslSettings } from '../../types/domain'

type SecurityPatch = Partial<Omit<SecuritySettings, 'development_mode_time_remaining'>>

type AccessRuleMode = 'block' | 'challenge' | 'whitelist' | 'js_challenge' | 'managed_challenge'
type AccessRuleTarget = 'ip' | 'ip_range' | 'country' | 'asn'

interface AccessRule {
  id: string
  mode: AccessRuleMode
  configuration: { target: AccessRuleTarget; value: string }
  notes?: string
  created_on?: string
}

const IPV4_RE = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/
// Light IPv6 check mirroring the backend (hex groups with optional "::" compression).
const IPV6_RE =
  /^(([0-9a-f]{1,4}:){7}[0-9a-f]{1,4}|([0-9a-f]{1,4}:){1,7}:|([0-9a-f]{1,4}:){1,6}:[0-9a-f]{1,4}|([0-9a-f]{1,4}:){1,5}(:[0-9a-f]{1,4}){1,2}|([0-9a-f]{1,4}:){1,4}(:[0-9a-f]{1,4}){1,3}|([0-9a-f]{1,4}:){1,3}(:[0-9a-f]{1,4}){1,4}|([0-9a-f]{1,4}:){1,2}(:[0-9a-f]{1,4}){1,5}|[0-9a-f]{1,4}:((:[0-9a-f]{1,4}){1,6})|:((:[0-9a-f]{1,4}){1,7}|:))$/i

/** Client-side mirror of the backend's normalizeAccessRuleValue check. */
function isAccessRuleValueValid(target: AccessRuleTarget, value: string): boolean {
  const v = value.trim()
  if (v === '') return false
  switch (target) {
    case 'ip':
      return IPV4_RE.test(v) || IPV6_RE.test(v)
    case 'country':
      return /^[a-z]{2}$/i.test(v)
    case 'asn':
      return /^AS\d+$/i.test(v)
    case 'ip_range':
      return true
  }
}

const TARGET_PLACEHOLDER: Record<AccessRuleTarget, string> = {
  ip: '203.0.113.10',
  ip_range: '203.0.113.0/24',
  country: 'VN',
  asn: 'AS13335',
}

const TARGET_LABEL: Record<AccessRuleTarget, string> = {
  ip: 'ip',
  ip_range: 'cidr',
  country: 'country',
  asn: 'asn',
}

const MODE_TAG: Record<AccessRuleMode, { variant: 'ok' | 'warn' | 'err'; label: string }> = {
  block: { variant: 'err', label: 'block' },
  challenge: { variant: 'warn', label: 'challenge' },
  js_challenge: { variant: 'warn', label: 'js_challenge' },
  managed_challenge: { variant: 'warn', label: 'managed_challenge' },
  whitelist: { variant: 'ok', label: 'allow' },
}

function AccessRulePanel({
  open,
  zoneId,
  editing,
  onClose,
  onDelete,
}: {
  open: boolean
  zoneId: string
  /** Rule đang sửa — null = tạo mới. CF chỉ cho sửa mode/notes, value bị khoá. */
  editing?: AccessRule | null
  onClose: () => void
  onDelete?: (rule: AccessRule) => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [mode, setMode] = useState<AccessRuleMode>('block')
  const [target, setTarget] = useState<AccessRuleTarget>('ip')
  const [value, setValue] = useState('')
  const [notes, setNotes] = useState('')
  // Đồng bộ form khi đổi rule đang sửa (panel luôn mounted)
  const [syncedId, setSyncedId] = useState<string | null>(null)
  const editingId = editing?.id ?? null
  if (syncedId !== editingId) {
    setSyncedId(editingId)
    setMode(editing?.mode ?? 'block')
    setTarget(editing?.configuration.target ?? 'ip')
    setValue(editing?.configuration.value ?? '')
    setNotes(editing?.notes ?? '')
  }

  const valid = isAccessRuleValueValid(target, value)
  const showInvalid = value.trim() !== '' && !valid

  const reset = () => {
    setSyncedId(null)
    setMode('block')
    setTarget('ip')
    setValue('')
    setNotes('')
  }

  const close = () => {
    reset()
    onClose()
  }

  const saveRule = useMutation({
    mutationFn: async () =>
      editing
        ? (
            await api.patch(`/domains/${zoneId}/access-rules/${editing.id}`, {
              mode,
              notes: notes.trim(),
            })
          ).data
        : (
            await api.post(`/domains/${zoneId}/access-rules`, {
              mode,
              target,
              value: value.trim(),
              ...(notes.trim() ? { notes: notes.trim() } : {}),
            })
          ).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['access-rules', zoneId] })
      message.success(editing ? t('Access rule updated') : t('Access rule created'))
      close()
    },
    onError: (error) => {
      message.error(apiErrorDetail(error) || t('Could not save the access rule'))
    },
  })

  return (
    <DetailPanel
      open={open}
      title={editing ? t('Edit access rule') : t('Add access rule')}
      onClose={close}
      footer={
        <>
          {editing && onDelete && (
            <Button
              danger
              onClick={() => {
                const rule = editing
                close()
                onDelete(rule)
              }}
            >
              {t('Delete')}
            </Button>
          )}
          <span className="ml-auto flex gap-2">
            <Button onClick={close}>{t('Cancel')}</Button>
            <Button
              type="primary"
              disabled={!editing && !valid}
              loading={saveRule.isPending}
              onClick={() => saveRule.mutate()}
            >
              {editing ? t('Save') : t('Add rule')}
            </Button>
          </span>
        </>
      }
    >
      <div className="flex flex-col gap-3 py-1">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Lbl className="mb-[5px] block">{t('Action')}</Lbl>
            <Select<AccessRuleMode>
              className="w-full"
              value={mode}
              onChange={setMode}
              aria-label={t('Action')}
              options={[
                { value: 'block', label: 'Block' },
                { value: 'challenge', label: 'Challenge' },
                { value: 'js_challenge', label: 'JS Challenge' },
                { value: 'managed_challenge', label: 'Managed Challenge' },
                { value: 'whitelist', label: 'Allow (whitelist)' },
              ]}
            />
          </div>
          <div>
            <Lbl className="mb-[5px] block">{t('Type')}</Lbl>
            <Select<AccessRuleTarget>
              className="w-full"
              value={target}
              disabled={!!editing}
              onChange={(next) => {
                setTarget(next)
                setValue('')
              }}
              aria-label={t('Type')}
              options={[
                { value: 'ip', label: 'IP' },
                { value: 'ip_range', label: 'CIDR (IP range)' },
                { value: 'country', label: t('Country') },
                { value: 'asn', label: 'ASN' },
              ]}
            />
          </div>
        </div>
        <div>
          <Lbl className="mb-[5px] block">{t('Value')}</Lbl>
          <Input
            value={value}
            placeholder={TARGET_PLACEHOLDER[target]}
            status={showInvalid ? 'error' : undefined}
            className="font-mono"
            aria-label={t('Value')}
            disabled={!!editing}
            onChange={(e) => setValue(e.target.value)}
          />
          {editing ? (
            <div className="mt-1 font-mono text-[11px] text-fg-3">
              {t('Cloudflare only allows changing the action and notes')}
            </div>
          ) : (
            showInvalid && (
              <div className="mt-1 font-mono text-[11px] text-danger">
                ✕ {t('Invalid value for this type')}
              </div>
            )
          )}
        </div>
        <div>
          <Lbl className="mb-[5px] block">{t('Notes')}</Lbl>
          <Input
            value={notes}
            maxLength={200}
            placeholder={t('Optional')}
            aria-label={t('Notes')}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </div>
    </DetailPanel>
  )
}

function AccessRulesSection({ zoneId }: { zoneId: string }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  // 'add' | rule đang sửa | null (đóng)
  const [panelState, setPanelState] = useState<'add' | AccessRule | null>(null)

  const { data, isLoading, isError, error, refetch } = useQuery<{ rules: AccessRule[] }>({
    queryKey: ['access-rules', zoneId],
    queryFn: async () => (await api.get(`/domains/${zoneId}/access-rules`)).data,
    enabled: !!zoneId,
    retry: false,
  })
  const rules = data?.rules ?? []
  const permissionError = isError && isAxiosError(error) && error.response?.status === 403

  const deleteRule = useMutation({
    mutationFn: async (ruleId: string) => api.delete(`/domains/${zoneId}/access-rules/${ruleId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['access-rules', zoneId] })
      message.success(t('Access rule deleted'))
    },
    onError: (err) => {
      message.error(apiErrorDetail(err) || t('Could not delete the access rule'))
    },
  })

  const columns: ColumnsType<AccessRule> = [
    {
      title: t('Value'),
      dataIndex: ['configuration', 'value'],
      render: (value: string) => <span className="font-mono text-[12px] font-medium">{value}</span>,
    },
    {
      title: t('Type'),
      dataIndex: ['configuration', 'target'],
      render: (target: AccessRuleTarget) => <Tag>{TARGET_LABEL[target] ?? target}</Tag>,
    },
    {
      title: t('Action'),
      dataIndex: 'mode',
      render: (mode: AccessRuleMode) => {
        const cfg = MODE_TAG[mode] ?? { variant: 'warn' as const, label: mode }
        return <Tag variant={cfg.variant}>{cfg.label}</Tag>
      },
    },
    {
      title: t('Notes'),
      dataIndex: 'notes',
      render: (notes?: string) => <span className="text-fg-3">{notes || '—'}</span>,
    },
    {
      title: '',
      key: 'actions',
      width: 40,
      render: (_, rule) => (
        <Popconfirm
          title={t('Delete this rule?')}
          okText={t('Delete')}
          okButtonProps={{ danger: true }}
          onConfirm={() => deleteRule.mutate(rule.id)}
        >
          <button
            type="button"
            aria-label={t('Delete rule {{value}}', { value: rule.configuration.value })}
            className="cursor-pointer border-0 bg-transparent p-0 font-mono text-[13px] text-fg-3 hover:text-danger"
          >
            ⋯
          </button>
        </Popconfirm>
      ),
    },
  ]

  return (
    <div>
      <SectionHeader
        title={`IP Access Rules · ${rules.length}`}
        actions={
          <Button size="small" onClick={() => setPanelState('add')} disabled={permissionError}>
            + {t('Add rule')}
          </Button>
        }
      />
      {permissionError ? (
        <Banner tone="warn">
          {apiErrorDetail(error) || t('The API token is missing the permission to read IP access rules.')}
        </Banner>
      ) : isError ? (
        <Banner
          tone="err"
          actions={
            <Button size="small" onClick={() => refetch()}>
              ↻ {t('Retry')}
            </Button>
          }
        >
          {apiErrorDetail(error) || t('Could not load access rules')}
        </Banner>
      ) : isLoading ? (
        <div className="flex flex-col gap-[12px] p-4" data-testid="access-rules-skeleton">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonLine key={i} width={`${82 - i * 12}%`} />
          ))}
        </div>
      ) : (
        <div className="flex">
          <div className="min-w-0 flex-1">
            {rules.length === 0 ? (
              <EmptyState
                icon="⛨"
                title={t('No access rules')}
                desc={t('Block, challenge or allow visitors by IP, CIDR, country or ASN')}
                className="!py-[28px]"
              />
            ) : (
              <Table<AccessRule>
                dataSource={rules}
                columns={columns}
                rowKey="id"
                pagination={false}
                size="small"
                onRow={(rule) => ({
                  // Click cả dòng để sửa (đồng bộ với các bảng khác); bỏ qua nút/menu.
                  onClick: (event) => {
                    const target = event.target as HTMLElement
                    if (target.closest('button, .ant-popover')) return
                    setPanelState(rule)
                  },
                  style: { cursor: 'pointer' },
                })}
                rowClassName={(rule) =>
                  panelState !== null && panelState !== 'add' && panelState.id === rule.id
                    ? 'bg-bg-sel'
                    : ''
                }
                scroll={{ x: 'max-content' }}
              />
            )}
          </div>
          {/* Panel trượt bên phải thay cho modal */}
          <AccessRulePanel
            open={panelState !== null}
            zoneId={zoneId}
            editing={panelState !== null && panelState !== 'add' ? panelState : null}
            onClose={() => setPanelState(null)}
            onDelete={(rule) => deleteRule.mutate(rule.id)}
          />
        </div>
      )}
    </div>
  )
}

/**
 * Security tab — grid-2 KvRow groups (2.html security view). Settings save
 * immediately per control, matching the previous DomainDetail behaviour
 * (no local dirty-state; only the settings the backend supports are shown).
 */
export default function SecurityTab({ zoneId, zoneName }: { zoneId: string; zoneName?: string }) {
  const { t } = useTranslation()
  const qc = useQueryClient()

  const { data: ssl } = useQuery<SslSettings>({
    queryKey: ['ssl', zoneId],
    queryFn: async () => (await api.get(`/domains/${zoneId}/ssl`)).data,
    enabled: !!zoneId,
  })

  const { data: security, isLoading } = useQuery<SecuritySettings>({
    queryKey: ['security', zoneId],
    queryFn: async () => (await api.get(`/domains/${zoneId}/security`)).data,
    enabled: !!zoneId,
  })

  const updateSsl = useMutation({
    mutationFn: async (data: { mode: string }) => (await api.patch(`/domains/${zoneId}/ssl`, data)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ssl', zoneId] })
      qc.invalidateQueries({ queryKey: ['domain', zoneId] })
      message.success(t('SSL settings updated'))
    },
    onError: (error) => {
      message.error(apiErrorDetail(error) || t('Failed to update SSL settings'))
    },
  })

  const updateSecurity = useMutation({
    mutationFn: async (data: SecurityPatch) => (await api.patch(`/domains/${zoneId}/security`, data)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['security', zoneId] })
      message.success(t('Settings updated'))
    },
    onError: (error) => {
      message.error(apiErrorDetail(error) || t('Failed to update settings'))
    },
  })

  if (isLoading) {
    return (
      <div className="flex flex-col gap-[14px] py-3" data-testid="security-skeleton">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonLine key={i} width={`${88 - (i % 3) * 10}%`} />
        ))}
      </div>
    )
  }

  return (
    <div className="border-x border-b border-stroke bg-bg">
      <div className="grid grid-cols-1 lg:grid-cols-2">
        {/* SSL / TLS */}
        <div className="px-4 py-[13px]">
          <Lbl className="mb-[9px] block">SSL / TLS</Lbl>
          <KvRow
            k={t('Encryption mode')}
            v={
              <Select
                size="small"
                className="w-[150px]"
                value={ssl?.mode}
                loading={updateSsl.isPending}
                onChange={(value) => updateSsl.mutate({ mode: value })}
                aria-label={t('Encryption mode')}
                options={[
                  { value: 'off', label: t('Off') },
                  { value: 'flexible', label: 'Flexible' },
                  { value: 'full', label: 'Full' },
                  { value: 'strict', label: 'Strict' },
                ]}
              />
            }
            className="!h-[34px]"
          />
          <KvRow
            k={t('Always Use HTTPS')}
            v={
              <Switch
                size="small"
                checked={security?.always_use_https === 'on'}
                loading={updateSecurity.isPending}
                onChange={(checked) => updateSecurity.mutate({ always_use_https: checked ? 'on' : 'off' })}
                aria-label={t('Always Use HTTPS')}
              />
            }
            className="!h-[34px]"
          />
          <KvRow
            k={t('Automatic HTTPS Rewrites')}
            v={
              <Switch
                size="small"
                checked={security?.automatic_https_rewrites === 'on'}
                loading={updateSecurity.isPending}
                onChange={(checked) =>
                  updateSecurity.mutate({ automatic_https_rewrites: checked ? 'on' : 'off' })
                }
                aria-label={t('Automatic HTTPS Rewrites')}
              />
            }
            className="!h-[34px]"
          />
          <p className="mt-2 mb-0 font-mono text-[11.5px] text-fg-3">
            {t('Determine how Cloudflare connects to your origin server.')}
          </p>
        </div>

        {/* Firewall & cache bypass */}
        <div className="border-t border-stroke px-4 py-[13px] lg:border-t-0 lg:border-l">
          <Lbl className="mb-[9px] block">{t('Firewall & mode')}</Lbl>
          <KvRow
            k={t('Security level')}
            v={
              <Select
                size="small"
                className="w-[150px]"
                value={security?.security_level}
                loading={updateSecurity.isPending}
                onChange={(value) => updateSecurity.mutate({ security_level: value })}
                aria-label={t('Security level')}
                options={[
                  { value: 'off', label: t('Off') },
                  { value: 'essentially_off', label: t('Essentially Off') },
                  { value: 'low', label: t('Low') },
                  { value: 'medium', label: t('Medium') },
                  { value: 'high', label: t('High') },
                  { value: 'under_attack', label: t("I'm Under Attack!") },
                ]}
              />
            }
            className="!h-[34px]"
          />
          <KvRow
            k={t('Development mode')}
            v={
              <Switch
                size="small"
                checked={security?.development_mode === 'on'}
                loading={updateSecurity.isPending}
                onChange={(checked) => updateSecurity.mutate({ development_mode: checked ? 'on' : 'off' })}
                aria-label={t('Development mode')}
              />
            }
            className="!h-[34px]"
          />
          <p className="mt-2 mb-0 font-mono text-[11.5px] text-fg-3">
            {t('Temporarily bypass cache for 3 hours to test changes.')}
            {security?.development_mode === 'on' && security?.development_mode_time_remaining
              ? ' ' +
                t('~{{count}} minutes remaining.', {
                  count: Math.round(security.development_mode_time_remaining / 60),
                })
              : ''}
          </p>
        </div>
      </div>

      {/* WAF Custom Rules sống cùng chỗ với các thiết lập bảo mật khác của zone. */}
      <RulesetRulesPanel zoneId={zoneId} kind="security" zoneName={zoneName} />

      <AccessRulesSection zoneId={zoneId} />
    </div>
  )
}
