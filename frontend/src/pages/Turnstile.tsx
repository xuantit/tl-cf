import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, Button, Checkbox, Form, Input, Select, Table, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api, apiErrorDetail } from '../services/api'
import { useAccountStore } from '../stores/useAccountStore'
import { getUserIdFromToken, useAuthStore } from '../stores/useAuthStore'
import { message } from '../lib/antdApp'
import PageHeader from '../components/PageHeader'
import ConfirmDestructive from '../components/ConfirmDestructive'
import { Banner, DetailPanel, EmptyState, SkeletonLine, Tag } from '../components/ui'
import type { TurnstileInput, TurnstileList, TurnstileWidget } from '../types/turnstile'

type Scope = { accountId: string; cfAccountId: string }
const modes = ['managed', 'non-interactive', 'invisible'] as const
const clearances = ['no_clearance', 'jschallenge', 'managed', 'interactive'] as const

function WidgetEditor({ scope, widget, onClose, onSaved }: {
  scope: Scope
  widget?: TurnstileWidget
  onClose: () => void
  onSaved: (widget: TurnstileWidget) => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [form] = Form.useForm<TurnstileInput>()
  const [error, setError] = useState('')
  const [confirm, setConfirm] = useState<'delete' | 'rotate' | null>(null)
  const [immediate, setImmediate] = useState(false)
  const [secret, setSecret] = useState<string | null>(null)
  const [secretBusy, setSecretBusy] = useState(false)
  const secretRequest = useRef<AbortController | null>(null)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; secretRequest.current?.abort() } }, [])
  const params = { ...scope }
  const endpoint = `/turnstile/widgets/${widget?.sitekey ?? ''}`
  const invalidate = () => qc.invalidateQueries({ queryKey: ['turnstile-widgets', scope.accountId, scope.cfAccountId] })
  const save = useMutation({
    mutationFn: async (input: TurnstileInput) => (widget
      ? await api.put<TurnstileWidget>(endpoint, input, { params })
      : await api.post<TurnstileWidget>('/turnstile/widgets', input, { params })).data,
    onSuccess: (result) => { void invalidate(); if (mounted.current) { message.success(t('Turnstile widget saved')); onSaved(result) } },
    onError: (err) => setError(apiErrorDetail(err) || t('Could not save Turnstile widget')),
  })
  const remove = useMutation({
    mutationFn: () => api.delete(endpoint, { params }),
    onSuccess: () => { void invalidate(); if (mounted.current) { message.success(t('Turnstile widget deleted')); onClose() } },
    onError: (err) => setError(apiErrorDetail(err) || t('Could not delete Turnstile widget')),
  })
  const secretAction = async (action: 'reveal' | 'rotate') => {
    if (secretRequest.current) return
    const controller = new AbortController()
    secretRequest.current = controller
    setSecretBusy(true)
    setSecret(null)
    setError('')
    try {
      // Deliberately not a react-query mutation: secret must not enter its cache.
      const { data } = await api.post<{ secret: string }>(`${endpoint}/secret/${action}`,
        action === 'rotate' ? { invalidateImmediately: immediate } : {},
        { params, signal: controller.signal })
      if (controller.signal.aborted) return
      setSecret(data.secret)
      setConfirm(null)
      if (action === 'rotate') message.success(t('Turnstile secret rotated. Update your server configuration.'))
    } catch (err) {
      if (!controller.signal.aborted) setError(apiErrorDetail(err) || t('Could not access Turnstile secret'))
    } finally {
      if (!controller.signal.aborted) setSecretBusy(false)
      secretRequest.current = null
    }
  }
  const busy = save.isPending || remove.isPending || secretBusy
  return (
    <DetailPanel open title={t(widget ? 'Edit Turnstile widget' : 'Create Turnstile widget')} onClose={onClose}
      footer={<>
        {widget && <Button danger disabled={busy} onClick={() => setConfirm('delete')}>{t('Delete widget')}</Button>}
        <Button className="ml-auto" onClick={onClose}>{t('Close')}</Button>
        <Button type="primary" loading={save.isPending} disabled={remove.isPending || secretBusy}
          onClick={() => form.submit()}>{t('Save')}</Button>
      </>}>
      {error && <Alert type="error" showIcon title={error} className="mb-4" />}
      {widget && <div className="mb-4 rounded-lg border border-stroke bg-bg-side p-3">
        <div className="mb-1 text-[11px] text-fg-3">{t('Site key')}</div>
        <Typography.Text copyable={{ text: widget.sitekey }} className="!font-mono !text-[12px]">{widget.sitekey}</Typography.Text>
        <div className="mt-2 text-[11px] text-fg-3">{t('Region')}: {widget.region}</div>
      </div>}
      <Form form={form} layout="vertical" requiredMark={false} disabled={busy}
        initialValues={widget ?? { name: '', domains: [], mode: 'managed', clearanceLevel: 'no_clearance' }}
        onFinish={(values) => { setError(''); save.mutate(values) }}>
        <Form.Item name="name" label={t('Widget name')} rules={[{ required: true, whitespace: true }, { max: 254 }]}>
          <Input placeholder={t('e.g. Website registration')} maxLength={254} />
        </Form.Item>
        <Form.Item name="domains" label={t('Hostnames')} rules={[{ required: true, type: 'array', min: 1, max: 10 }]}
          extra={t('Up to 10 hostnames or IPs. No https://, paths, ports or wildcards. Subdomains are included.')}>
          <Select mode="tags" tokenSeparators={[',', ' ', '\n']} open={false} aria-label={t('Hostnames')}
            placeholder="example.com, localhost" />
        </Form.Item>
        <Form.Item name="mode" label={t('Widget mode')} rules={[{ required: true }]}>
          <Select options={modes.map((value) => ({ value, label: value }))} />
        </Form.Item>
        <Form.Item name="clearanceLevel" label={t('Pre-clearance')} rules={[{ required: true }]}
          extra={t('Keep no_clearance unless you need WAF clearance cookies. Server-side Siteverify is still required.')}>
          <Select options={clearances.map((value) => ({ value, label: value }))} />
        </Form.Item>
      </Form>
      {widget && <section className="mt-4 border-t border-stroke pt-4">
        <div className="mb-2 text-[13px] font-semibold">{t('Secret key')}</div>
        <p className="text-[12px] leading-relaxed text-fg-3">{t('Use the secret only on your server. It is hidden when you close this panel or switch accounts.')}</p>
        {secret !== null && <Input.Password readOnly value={secret} autoComplete="off" aria-label={t('Secret key')} className="mb-2 font-mono" />}
        <div className="flex flex-wrap gap-2">
          {secret === null
            ? <Button size="small" loading={secretBusy} disabled={save.isPending || remove.isPending} onClick={() => void secretAction('reveal')}>{t('Reveal secret')}</Button>
            : <><Button size="small" onClick={async () => {
              try { await navigator.clipboard.writeText(secret); message.success(t('Copied')) }
              catch { message.error(t('Could not copy to clipboard')) }
            }}>{t('Copy secret')}</Button><Button size="small" onClick={() => setSecret(null)}>{t('Hide secret')}</Button></>}
          <Button size="small" danger disabled={busy} onClick={() => setConfirm('rotate')}>{t('Rotate secret')}</Button>
        </div>
        <Checkbox className="mt-3" checked={immediate} disabled={busy} onChange={(event) => setImmediate(event.target.checked)}>
          {t('Invalidate the old secret immediately')}
        </Checkbox>
        <p className="text-[11px] text-fg-3">{t('Otherwise the old secret stays valid for 2 hours. Cloudflare prevents another rotation during this grace period.')}</p>
        {(widget.offlabel || widget.ephemeralId || widget.botFightMode) && <Tag>{t('Existing Enterprise options are preserved')}</Tag>}
      </section>}
      {widget && <ConfirmDestructive open={confirm !== null}
        title={t(confirm === 'delete' ? 'Delete Turnstile widget?' : 'Rotate Turnstile secret?')}
        items={[{ key: widget.sitekey, label: widget.name, meta: widget.sitekey }]}
        explanation={t(confirm === 'delete'
          ? 'Websites using this widget will stop passing Turnstile verification. This cannot be undone.'
          : immediate ? 'The current secret will stop working immediately. Update every server using this widget.'
            : 'The current secret expires in 2 hours. Update every server using this widget before then.')}
        confirmText={widget.name} confirmLabel={t(confirm === 'delete' ? 'Delete widget' : 'Rotate secret')}
        loading={remove.isPending || secretBusy} onCancel={() => setConfirm(null)}
        onConfirm={() => confirm === 'delete' ? remove.mutate() : void secretAction('rotate')} />}
    </DetailPanel>
  )
}

function ExistingWidgetPanel({ scope, sitekey, onClose, onSaved }: {
  scope: Scope; sitekey: string; onClose: () => void; onSaved: (widget: TurnstileWidget) => void
}) {
  const { t } = useTranslation()
  const query = useQuery({
    queryKey: ['turnstile-widget', scope.accountId, scope.cfAccountId, sitekey],
    queryFn: async ({ signal }) => (await api.get<TurnstileWidget>(`/turnstile/widgets/${encodeURIComponent(sitekey)}`, { params: scope, signal })).data,
    retry: false, refetchOnWindowFocus: false,
  })
  if (!query.data || query.isError) return <DetailPanel open title={t('Turnstile widget')} onClose={onClose}>
    {query.isError ? <Alert type="error" title={apiErrorDetail(query.error) || t('Could not load Turnstile widgets')}
      action={<Button onClick={() => void query.refetch()}>{t('Retry')}</Button>} /> : <SkeletonLine width="80%" />}
  </DetailPanel>
  return <WidgetEditor key={`${sitekey}:${query.dataUpdatedAt}`} scope={scope} widget={query.data} onClose={onClose} onSaved={onSaved} />
}

function AccountTurnstile({ accountId }: { accountId: string }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedCfId, setSelectedCfId] = useState('')
  const [page, setPage] = useState(1)
  const [filter, setFilter] = useState('')
  const [manualId, setManualId] = useState('')
  const accounts = useQuery({
    queryKey: ['turnstile-accounts', accountId],
    queryFn: async ({ signal }) => (await api.get<{ accounts: { id: string; name: string }[] }>('/turnstile/accounts', { params: { accountId }, signal })).data.accounts,
    retry: false,
  })
  const cfAccountId = selectedCfId || (accounts.data?.length === 1 ? accounts.data[0].id : '')
  const scope = { accountId, cfAccountId }
  const list = useQuery({
    queryKey: ['turnstile-widgets', accountId, cfAccountId, page],
    queryFn: async ({ signal }) => (await api.get<TurnstileList>('/turnstile/widgets', { params: { ...scope, page, perPage: 20 }, signal })).data,
    enabled: !!cfAccountId, retry: false,
  })
  const chosen = searchParams.get('widget')
  const openWidget = (sitekey: string | null) => setSearchParams((prev) => {
    const next = new URLSearchParams(prev)
    if (sitekey) next.set('widget', sitekey)
    else next.delete('widget')
    return next
  }, { replace: true })
  const changeTarget = (value: string) => { setSelectedCfId(value); setPage(1); setFilter(''); openWidget(null) }
  const saved = (widget: TurnstileWidget) => {
    qc.setQueryData(['turnstile-widget', accountId, cfAccountId, widget.sitekey], widget)
    openWidget(widget.sitekey)
  }
  const columns: ColumnsType<TurnstileWidget> = [
    { title: t('Widget name'), dataIndex: 'name', render: (name: string, widget) => <Button type="link" className="!p-0" onClick={() => openWidget(widget.sitekey)}>{name}</Button> },
    { title: t('Site key'), dataIndex: 'sitekey', render: (key: string) => <Typography.Text className="!font-mono !text-[12px]" copyable={{ text: key }}>{key}</Typography.Text> },
    { title: t('Hostnames'), dataIndex: 'domains', render: (domains: string[]) => <span className="line-clamp-2 text-[12px] text-fg-3" title={domains.join(', ')}>{domains.join(', ') || t('Any hostname')}</span> },
    { title: t('Widget mode'), dataIndex: 'mode', render: (mode: string) => <Tag variant={mode === 'managed' ? 'ok' : 'default'}>{mode}</Tag> },
    { title: t('Pre-clearance'), dataIndex: 'clearanceLevel', responsive: ['lg'] },
  ]
  const rows = (list.data?.widgets ?? []).filter((widget) => `${widget.name} ${widget.sitekey} ${widget.domains.join(' ')}`.toLowerCase().includes(filter.toLowerCase()))
  return <div className="relative flex min-h-full">
    <div className="fade-in min-w-0 flex-1 p-[clamp(12px,3vw,24px)]">
      <PageHeader title="Turnstile" crumb={t('Manage anti-bot widgets for the selected Cloudflare account')}
        actions={<>
          {cfAccountId && <Button href={`https://dash.cloudflare.com/${cfAccountId}/turnstile`} target="_blank" rel="noopener noreferrer">{t('Cloudflare dashboard')} ↗</Button>}
          <Button loading={list.isFetching || accounts.isFetching} onClick={() => { void accounts.refetch(); if (cfAccountId) void list.refetch() }}>↻ {t('Reload')}</Button>
          <Button type="primary" disabled={!cfAccountId} onClick={() => openWidget('new')}>+ {t('Add widget')}</Button>
        </>} />
      <Banner tone="info" className="mb-4">{t('Managing widgets does not automatically enable CAPTCHA on your website. Embed the widget and validate tokens on your server.')}</Banner>
      <div className="mb-4 flex flex-wrap items-start gap-3 rounded-lg border border-stroke bg-bg-side p-3">
        <div className="min-w-[220px] flex-1">
          <label className="mb-1 block text-[11px] text-fg-3">{t('Cloudflare account')}</label>
          <Select className="w-full" aria-label={t('Cloudflare account')} value={cfAccountId || undefined} loading={accounts.isLoading}
            placeholder={t('Select account')} onChange={changeTarget}
            options={(accounts.data ?? []).map((account) => ({ value: account.id, label: `${account.name} · ${account.id}` }))} />
        </div>
        <div className="min-w-[220px] flex-1">
          <label className="mb-1 block text-[11px] text-fg-3">{t('Or enter Cloudflare Account ID')}</label>
          <Input.Search value={manualId} onChange={(event) => setManualId(event.target.value)} aria-label={t('Cloudflare Account ID')}
            placeholder={t('32-character account ID')} enterButton={t('Use ID')} onSearch={(value) => {
              if (!/^[a-f0-9]{32}$/i.test(value.trim())) { message.error(t('Enter a valid Cloudflare Account ID')); return }
              changeTarget(value.trim())
            }} />
        </div>
      </div>
      {accounts.isError && <Banner tone="warn" className="mb-3">{t('Account discovery failed. Enter the Account ID manually if your token is restricted to Turnstile.')}</Banner>}
      {list.isError ? <Alert type="error" showIcon title={apiErrorDetail(list.error) || t('Could not load Turnstile widgets')}
        description={t('Use an active credential with Account → Turnstile Sites Read to view widgets, and Write/Edit to change them. Select the matching Cloudflare Account ID.')} />
        : !cfAccountId ? <EmptyState icon="◈" title={t('Select a Cloudflare account')} desc={t('Choose the account that owns your Turnstile widgets.')} />
          : list.isLoading ? <div data-testid="turnstile-loading" className="space-y-3"><SkeletonLine width="90%" /><SkeletonLine width="70%" /></div>
            : <>
              <Input className="mb-3 max-w-[360px]" value={filter} allowClear onChange={(event) => setFilter(event.target.value)} placeholder={t('Filter this page by name, site key or hostname')} />
              {!list.data?.total ? <EmptyState icon="◈" title={t('No Turnstile widgets')} desc={t('Create a widget to get a site key and configure allowed hostnames.')} />
                : <Table rowKey="sitekey" columns={columns} dataSource={rows} scroll={{ x: 780 }}
                  rowClassName={(row) => row.sitekey === chosen ? 'bg-bg-sel cursor-pointer' : 'cursor-pointer'}
                  onRow={(widget) => ({ onClick: (event) => {
                    if (!(event.target as HTMLElement).closest('button,a,.ant-typography-copy')) openWidget(widget.sitekey)
                  } })}
                  pagination={{ current: page, total: list.data?.total, pageSize: 20, showSizeChanger: false, onChange: setPage, hideOnSinglePage: true }} />}
            </>}
    </div>
    {cfAccountId && chosen && (chosen === 'new'
      ? <WidgetEditor key={`${accountId}:${cfAccountId}:new`} scope={scope} onClose={() => openWidget(null)} onSaved={saved} />
      : <ExistingWidgetPanel key={`${accountId}:${cfAccountId}:${chosen}`} scope={scope} sitekey={chosen} onClose={() => openWidget(null)} onSaved={saved} />)}
  </div>
}

export default function Turnstile() {
  const { t } = useTranslation()
  const accountId = useAccountStore((state) => state.activeAccountId)
  const token = useAuthStore((state) => state.token)
  if (!accountId) return <div className="p-6"><PageHeader title="Turnstile" />
    <EmptyState icon="◈" title={t('No CF account')} desc={t('Add and select a Cloudflare credential to manage Turnstile widgets.')}
      actions={<Link to="/accounts"><Button type="primary">{t('Accounts')}</Button></Link>} /></div>
  return <AccountTurnstile key={`${getUserIdFromToken(token)}:${accountId}`} accountId={accountId} />
}