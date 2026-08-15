import { useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Table, Button, Form, Input, Segmented, Alert, Typography, Modal } from 'antd'
import type { FormInstance } from 'antd'
import { message, modal } from '../lib/antdApp'
import { useSearchParams } from 'react-router-dom'
import type { ColumnsType } from 'antd/es/table'
import { useTranslation } from 'react-i18next'
import { api } from '../services/api'
import { useAccountStore } from '../stores/useAccountStore'
import PageHeader from '../components/PageHeader'
import { Dot, EmptyState, KvRow, SectionHeader, SkeletonLine, Tag } from '../components/ui'

interface Account {
  id: string
  label?: string
  authType: 'globalApiKey' | 'apiToken'
  email?: string
  isActive: boolean
  createdAt: string
  updatedAt: string
  domainsCount: number
}

type FeatureState = 'available' | 'forbidden' | 'plan_limited' | 'unavailable' | 'unknown'

interface Capabilities {
  token: { valid: boolean; authType: string; accountId: string | null }
  zone: { id: string; plan: string | null } | null
  features: Record<string, { state: FeatureState; requiredPermission: string; reason: string | null }>
}

interface ZoneLite {
  id: string
  name: string
}

function FeatureTag({ state }: { state: FeatureState }) {
  const { t } = useTranslation()
  if (state === 'available') return <Tag variant="ok">{t('granted')}</Tag>
  if (state === 'forbidden') return <Tag variant="err">{t('missing')}</Tag>
  return <Tag>{t(state)}</Tag>
}

/** Token permissions of the active account, probed via GET /cf/capabilities (read-only). */
function CapabilitiesSection({ accountId }: { accountId: string }) {
  const { t } = useTranslation()

  // Reuse the ['domains'] cache — probes need a zoneId to run against.
  const { data: zones = [] } = useQuery<ZoneLite[]>({
    queryKey: ['domains'],
    queryFn: async () => (await api.get('/domains')).data,
    staleTime: 60_000,
  })
  const zoneId = zones[0]?.id

  const forceFresh = useRef(false)
  const { data: caps, isLoading, isError, refetch, isFetching } = useQuery<Capabilities>({
    queryKey: ['cf-capabilities', accountId, zoneId],
    queryFn: async () => {
      const refresh = forceFresh.current
      forceFresh.current = false
      return (
        await api.get('/cf/capabilities', {
          params: { accountId, ...(zoneId ? { zoneId } : {}), ...(refresh ? { refresh: 1 } : {}) },
        })
      ).data
    },
    staleTime: 5 * 60_000,
    retry: false,
  })

  const entries = caps ? Object.entries(caps.features) : []
  const half = Math.ceil(entries.length / 2)

  return (
    <>
      <SectionHeader
        title={
          zoneId
            ? t('Token permissions · probed on {{zone}}', { zone: zones[0].name })
            : t('Token permissions')
        }
        actions={
          <Button size="small" type="text" loading={isFetching} onClick={() => { forceFresh.current = true; refetch() }}>
            ↻ {t('Re-check')}
          </Button>
        }
        className="mt-4"
      />
      {isLoading ? (
        <div className="flex flex-col gap-3 p-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonLine key={i} width={`${70 - i * 12}%`} />
          ))}
        </div>
      ) : isError || !caps ? (
        <div className="px-4 py-3 font-mono text-[11px] text-fg-3">
          {t('Could not evaluate token permissions')}
        </div>
      ) : (
        <div className="grid grid-cols-1 border-b border-stroke md:grid-cols-2">
          {[entries.slice(0, half), entries.slice(half)].map((group, gi) => (
            <div key={gi} className={`p-[13px_16px] ${gi === 1 ? 'md:border-l md:border-l-stroke' : ''}`}>
              {group.map(([name, f]) => (
                <KvRow
                  key={name}
                  k={<span className="font-mono text-[12.5px]">#{f.requiredPermission}</span>}
                  v={
                    <span title={f.reason || undefined}>
                      <FeatureTag state={f.state} />
                    </span>
                  }
                />
              ))}
            </div>
          ))}
          {!zoneId && (
            <div className="col-span-full px-4 pb-3 font-mono text-[11.5px] text-fg-3">
              {t('Add a domain to this account to probe real permissions.')}
            </div>
          )}
        </div>
      )}
    </>
  )
}

export default function Accounts() {
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const authType = searchParams.get('mode') === 'globalApiKey' ? 'globalApiKey' : 'apiToken'
  const [form] = Form.useForm()
  const qc = useQueryClient()
  const activeAccountId = useAccountStore((s) => s.activeAccountId)
  const setActiveAccountId = useAccountStore((s) => s.setActiveAccountId)
  // Per-session connection test results (id → result + timestamp)
  const [lastTest, setLastTest] = useState<Record<string, { valid: boolean; at: number }>>({})
  // Account đang mở modal hành động — click cả dòng để mở (dễ bấm trên mobile)
  const [actionFor, setActionFor] = useState<Account | null>(null)

  // Modal state lives in the URL so F5 restores the view
  const addOpen = searchParams.get('modal') === 'add'
  const setAddOpen = (open: boolean) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (open) {
          next.set('modal', 'add')
          if (!next.has('mode')) next.set('mode', 'apiToken')
        } else {
          next.delete('modal')
          next.delete('mode')
        }
        return next
      },
      { replace: true },
    )
  }

  // Panel children stay mounted — reset the form here, not in an effect
  const closeAddPanel = () => {
    setAddOpen(false)
    form.resetFields()
  }

  const { data: list = [], isLoading } = useQuery<Account[]>({
    queryKey: ['cf-accounts'],
    queryFn: async () => (await api.get('/cf/accounts')).data,
  })

  const create = useMutation({
    mutationFn: async (values: Record<string, string>) => {
      const payload =
        authType === 'apiToken'
          ? { authType, label: values.label, apiToken: values.apiToken }
          : { authType, label: values.label, email: values.email, globalApiKey: values.globalApiKey }
      return (await api.post('/cf/accounts', payload)).data
    },
    onSuccess: (acc) => {
      qc.invalidateQueries({ queryKey: ['cf-accounts'] })
      setAddOpen(false)
      form.resetFields()
      if (acc?.id) setActiveAccountId(acc.id)
      message.success(t('Account added'))
    },
    onError: (e: { response?: { data?: { detail?: string } } }) =>
      message.error(e?.response?.data?.detail || t('Failed')),
  })

  const toggleActive = useMutation({
    mutationFn: async (acc: Account) =>
      (await api.put(`/cf/accounts/${acc.id}`, { isActive: !acc.isActive })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cf-accounts'] })
      message.success(t('Updated'))
    },
    onError: (e: { response?: { data?: { detail?: string } } }) =>
      message.error(e?.response?.data?.detail || t('Failed')),
  })

  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/cf/accounts/${id}`),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ['cf-accounts'] })
      if (activeAccountId === id) setActiveAccountId(null)
      message.success(t('Account deleted'))
    },
    onError: (e: { response?: { data?: { detail?: string } } }) =>
      message.error(e?.response?.data?.detail || t('Failed')),
  })

  const testConnection = useMutation({
    mutationFn: async (id: string) =>
      (await api.get('/cf/test', { params: { accountId: id } })).data as { valid: boolean },
    onSuccess: (data, id) => {
      setLastTest((prev) => ({ ...prev, [id]: { valid: data.valid, at: Date.now() } }))
      if (data.valid) message.success(t('Connection OK'))
      else message.error(t('Connection failed'))
    },
    onError: (e: { response?: { data?: { detail?: string } } }, id) => {
      setLastTest((prev) => ({ ...prev, [id]: { valid: false, at: Date.now() } }))
      message.error(e?.response?.data?.detail || t('Connection failed'))
    },
  })

  const confirmDelete = (acc: Account) => {
    modal.confirm({
      title: t('Delete this account?'),
      content: t('Locally saved settings of its domains are removed too.'),
      okText: t('Delete'),
      okButtonProps: { danger: true },
      cancelText: t('Cancel'),
      onOk: () => remove.mutate(acc.id),
    })
  }

  const columns: ColumnsType<Account> = [
    {
      title: t('Label'),
      dataIndex: 'label',
      render: (label: string, r) => (
        <span className="inline-flex items-center gap-[6px]">
          <Dot status={r.id === activeAccountId ? 'ok' : r.isActive ? 'off' : 'warn'} />
          <span className="font-mono text-[12px] font-medium text-fg">
            {label || r.email || r.id.slice(0, 8)}
          </span>
        </span>
      ),
    },
    {
      title: t('Type'),
      dataIndex: 'authType',
      width: 110,
      render: (v: string) =>
        v === 'apiToken' ? <Tag variant="info">api token</Tag> : <Tag variant="warn">global key</Tag>,
    },
    {
      title: 'Email / Token',
      dataIndex: 'email',
      width: 190,
      responsive: ['md'],
      render: (v: string | undefined, r) => (
        <span className="font-mono text-[12px] text-fg-2">
          {r.authType === 'apiToken' ? '••••••••••••' : v || '—'}
        </span>
      ),
    },
    {
      title: 'Zones',
      dataIndex: 'domainsCount',
      width: 80,
      render: (v: number) => (
        <span className={`font-mono text-[12.5px] ${v === 0 ? 'text-fg-3' : 'text-fg-2'}`}>{v}</span>
      ),
    },
    {
      title: t('Status'),
      key: 'status',
      width: 120,
      render: (_v, r) => {
        if (r.id === activeAccountId) return <Tag variant="ok">{t('in use')}</Tag>
        if (r.isActive) return <Tag>{t('ready')}</Tag>
        return <Tag variant="warn">{t('disabled')}</Tag>
      },
    },
    {
      title: t('Checked'),
      key: 'checked',
      width: 110,
      responsive: ['md'],
      render: (_v, r) => {
        const res = lastTest[r.id]
        if (!res) return <span className="text-fg-3">—</span>
        return (
          <span className="inline-flex items-center gap-[6px] font-mono text-[12px] text-fg-2">
            <Dot status={res.valid ? 'ok' : 'err'} />
            {new Date(res.at).toLocaleTimeString()}
          </span>
        )
      },
    },
    {
      title: '',
      key: 'actions',
      width: 44,
      align: 'right',
      render: (_v, r) => (
        <Button
          size="small"
          type="text"
          aria-label={t('Account actions')}
          onClick={(e) => {
            e.stopPropagation()
            setActionFor(r)
          }}
        >
          ⋯
        </Button>
      ),
    },
  ]

  return (
    <div className="fade-in p-[clamp(12px,3vw,24px)]">
      <PageHeader
        title={t('Cloudflare accounts')}
        crumb={t('{{count}} connections', { count: list.length })}
        actions={
          <Button type="primary" onClick={() => setAddOpen(true)}>
            + {t('Add account')}
          </Button>
        }
      />
      <Table
        loading={isLoading}
        dataSource={list}
        rowKey="id"
        columns={columns}
        rowClassName={(r) => `cursor-pointer ${r.id === activeAccountId ? 'bg-bg-sel' : ''}`}
        onRow={(r) => ({
          onClick: (event) => {
            const target = event.target as HTMLElement
            if (target.closest('button')) return
            setActionFor(r)
          },
        })}
        locale={{
          emptyText: (
            <EmptyState
              icon="⌂"
              title={t('No Cloudflare account yet')}
              desc={t('Connect an API Token to start managing domains')}
              actions={
                <Button type="primary" size="small" onClick={() => setAddOpen(true)}>
                  + {t('Add account')}
                </Button>
              }
            />
          ),
        }}
        pagination={false}
        scroll={{ x: 'max-content' }}
      />

      {activeAccountId && <CapabilitiesSection accountId={activeAccountId} />}

      {/* Modal hành động theo account — mở khi click cả dòng */}
      <Modal
        title={actionFor ? actionFor.label || actionFor.email || actionFor.id.slice(0, 8) : ''}
        open={actionFor !== null}
        onCancel={() => setActionFor(null)}
        footer={null}
        width={400}
      >
        {actionFor && (
          <div className="flex flex-col gap-3">
            <div className="rounded-[6px] border border-solid border-stroke-2 px-3">
              <KvRow k={t('Type')} v={actionFor.authType === 'apiToken' ? 'API Token' : 'Global Key'} />
              <KvRow k={t('Email / Token')} v={actionFor.email || '•••'} />
              <KvRow k={t('Zones')} v={String(actionFor.domainsCount ?? '—')} />
              <KvRow
                k={t('Status')}
                v={
                  actionFor.id === activeAccountId ? (
                    <Tag variant="ok">{t('in use')}</Tag>
                  ) : actionFor.isActive ? (
                    <Tag>{t('ready')}</Tag>
                  ) : (
                    <Tag variant="warn">{t('disabled')}</Tag>
                  )
                }
              />
            </div>
            <div className="flex flex-col gap-2">
              <Button
                type="primary"
                block
                disabled={actionFor.id === activeAccountId}
                onClick={() => {
                  setActiveAccountId(actionFor.id)
                  setActionFor(null)
                }}
              >
                {actionFor.id === activeAccountId ? t('in use') : t('Select')}
              </Button>
              <Button
                block
                loading={testConnection.isPending}
                onClick={() => testConnection.mutate(actionFor.id)}
              >
                {t('Test connection')}
              </Button>
              <Button
                block
                loading={toggleActive.isPending}
                onClick={() => {
                  toggleActive.mutate(actionFor)
                  setActionFor(null)
                }}
              >
                {actionFor.isActive ? t('Disable') : t('Enable')}
              </Button>
              <Button
                danger
                block
                onClick={() => {
                  setActionFor(null)
                  confirmDelete(actionFor)
                }}
              >
                {t('Delete')}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <AddAccountPanel
        open={addOpen}
        mode={authType}
        onModeChange={(value) => {
          const next = new URLSearchParams(searchParams)
          next.set('mode', value)
          setSearchParams(next, { replace: true })
        }}
        form={form}
        saving={create.isPending}
        onClose={closeAddPanel}
        onFinish={(v) => create.mutate(v)}
      />
    </div>
  )
}

function AddAccountPanel({
  open,
  mode,
  onModeChange,
  form,
  saving,
  onClose,
  onFinish,
}: {
  open: boolean
  mode: 'apiToken' | 'globalApiKey'
  onModeChange: (mode: string) => void
  form: FormInstance
  saving: boolean
  onClose: () => void
  onFinish: (values: Record<string, string>) => void
}) {
  const { t } = useTranslation()
  return (
    <Modal
      title={t('Add Cloudflare account')}
      open={open}
      onCancel={onClose}
      footer={null}
      destroyOnHidden
    >
      <Segmented
        block
        value={mode}
        onChange={(value) => onModeChange(value as string)}
        options={[
          { label: t('API Token (recommended)'), value: 'apiToken' },
          { label: 'Global API Key', value: 'globalApiKey' },
        ]}
        style={{ marginBottom: 16 }}
      />
      {mode === 'apiToken' ? (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message={t('How to get an API Token')}
          description={
            <ol style={{ paddingLeft: 18, margin: 0 }}>
              <li>
                {t('Open')}{' '}
                <Typography.Link href="https://dash.cloudflare.com/profile/api-tokens" target="_blank" rel="noreferrer">
                  dash.cloudflare.com/profile/api-tokens
                </Typography.Link>
              </li>
              <li>{t('Click "Create Token" → use the "Edit zone DNS" template (or Custom token)')}</li>
              <li>{t('Grant permissions: Zone → DNS → Edit, and Zone → Zone → Read')}</li>
              <li>{t('Under "Zone Resources" choose All zones (or specific zones)')}</li>
              <li>{t('Click "Continue to summary" → "Create Token", then copy the token')}</li>
              <li>{t('Paste the token below (it is shown only once by Cloudflare)')}</li>
            </ol>
          }
        />
      ) : (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message={t('How to get your Global API Key')}
          description={
            <ol style={{ paddingLeft: 18, margin: 0 }}>
              <li>
                {t('Open')}{' '}
                <Typography.Link href="https://dash.cloudflare.com/profile/api-tokens" target="_blank" rel="noreferrer">
                  dash.cloudflare.com/profile/api-tokens
                </Typography.Link>
              </li>
              <li>{t('In the "API Keys" section, next to "Global API Key" click "View"')}</li>
              <li>{t('Confirm your password to reveal the key, then copy it')}</li>
              <li>{t('Enter the email of your Cloudflare account together with the key below')}</li>
              <li>{t('Note: the Global API Key has full account access — prefer an API Token when possible')}</li>
            </ol>
          }
        />
      )}
      <Form form={form} layout="vertical" onFinish={onFinish}>
        <Form.Item name="label" label={t('Friendly name')}>
          <Input placeholder={t('e.g. Main account')} />
        </Form.Item>
        {mode === 'apiToken' ? (
          <Form.Item
            name="apiToken"
            label="API Token"
            rules={[{ required: true, message: t('Enter API Token') }]}
            help={t('The token will be encrypted and stored securely')}
          >
            <Input.Password placeholder="Cloudflare API Token" />
          </Form.Item>
        ) : (
          <>
            <Form.Item
              name="email"
              label={t('Cloudflare email')}
              rules={[{ required: true, type: 'email', message: t('Enter a valid email') }]}
            >
              <Input placeholder="your-email@example.com" />
            </Form.Item>
            <Form.Item
              name="globalApiKey"
              label="Global API Key"
              rules={[{ required: true, message: t('Enter Global API Key') }]}
              help={t('The key will be encrypted and stored securely')}
            >
              <Input.Password placeholder="Global API Key" />
            </Form.Item>
          </>
        )}
        <Form.Item>
          <Button type="primary" htmlType="submit" loading={saving} block>
            {t('Test & Save')}
          </Button>
        </Form.Item>
      </Form>
    </Modal>
  )
}
