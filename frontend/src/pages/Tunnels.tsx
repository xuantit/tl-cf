import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { Button, Checkbox, Input, Popconfirm, Switch, Table } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { message } from '../lib/antdApp'
import PageHeader from '../components/PageHeader'
import ConfirmDestructive from '../components/ConfirmDestructive'
import { Banner, DetailPanel, Dot, EmptyState, Lbl, SectionHeader, SkeletonLine, Tag } from '../components/ui'
import type { DotStatus, TagVariant } from '../components/ui'
import { api, apiErrorDetail } from '../services/api'
import { useDomains } from '../hooks/useDomains'
import type { Tunnel, TunnelConnectorClient, TunnelIngressRule, TunnelStatus } from '../types/edge'

const STATUS_TAG: Record<TunnelStatus, { variant: TagVariant; dot: DotStatus }> = {
  healthy: { variant: 'ok', dot: 'ok' },
  degraded: { variant: 'warn', dot: 'warn' },
  down: { variant: 'err', dot: 'err' },
  inactive: { variant: 'default', dot: 'off' },
}

function StatusTag({ status }: { status: TunnelStatus }) {
  const cfg = STATUS_TAG[status] ?? STATUS_TAG.inactive
  return (
    <Tag variant={cfg.variant}>
      <span className="inline-flex items-center gap-[5px]">
        <Dot status={cfg.dot} />
        {status}
      </span>
    </Tag>
  )
}

/** "2022.7.1 · 2 colo" from the tunnel's open connections, or — when idle. */
function connectorSummary(tunnel: Tunnel): string {
  const conns = tunnel.connections ?? []
  if (conns.length === 0) return '—'
  const version = conns.find((c) => c.version)?.version
  const colos = new Set(conns.map((c) => c.colo).filter(Boolean)).size || conns.length
  return `${version ?? '?'} · ${colos} colo`
}

type EditableIngressRule = TunnelIngressRule & { _key: number }

/** Editable "Public hostnames" ingress editor (remotely-managed tunnels only). */
function HostnamesSection({ tunnelId, open }: { tunnelId: string; open: boolean }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { data: zones } = useDomains()

  const { data, isLoading, isError, error } = useQuery<{ ingress: TunnelIngressRule[]; source?: string }>({
    queryKey: ['tunnel-config', tunnelId],
    queryFn: async () => (await api.get(`/tunnels/${tunnelId}/configurations`)).data,
    enabled: open,
    retry: false,
  })

  // Rows edited locally; re-synced whenever fresh config data arrives (panel stays mounted).
  const [rows, setRows] = useState<EditableIngressRule[]>([])
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [autoDns, setAutoDns] = useState(true)
  const [synced, setSynced] = useState<typeof data>(undefined)
  if (data !== synced) {
    setSynced(data)
    setRows((data?.ingress ?? []).filter((r) => r.hostname).map((r, i) => ({ ...r, _key: i })))
    setExpanded(new Set())
  }
  const catchAll = (data?.ingress ?? []).find((r) => !r.hostname)

  // Strip local editor keys and empty advanced values; keep unknown originRequest keys intact.
  const buildIngress = (): TunnelIngressRule[] =>
    rows.map((row) => {
      const rule: TunnelIngressRule = { hostname: row.hostname, service: row.service }
      if ((row.path ?? '').trim() !== '') rule.path = (row.path ?? '').trim()
      if (row.originRequest && Object.keys(row.originRequest).length > 0) rule.originRequest = row.originRequest
      return rule
    })

  const save = useMutation({
    mutationFn: async () => {
      await api.put(`/tunnels/${tunnelId}/configurations`, { ingress: buildIngress() })
      return rows.map((r) => (r.hostname ?? '').trim()).filter(Boolean)
    },
    onSuccess: async (hostnames) => {
      // Hostnames present in the originally loaded config don't need new DNS records.
      const known = new Set((synced?.ingress ?? []).map((r) => r.hostname).filter(Boolean))
      qc.invalidateQueries({ queryKey: ['tunnel-config', tunnelId] })
      message.success(t('Hostnames saved'))
      if (!autoDns) return
      for (const hostname of hostnames.filter((h) => !known.has(h))) {
        const zone = (zones ?? []).find((z) => hostname === z.name || hostname.endsWith(`.${z.name}`))
        if (!zone) {
          message.warning(
            t('No zone in this account matches {{hostname}} — create the DNS record manually', { hostname }),
          )
          continue
        }
        try {
          await api.post(`/domains/${zone.id}/dns`, {
            type: 'CNAME',
            name: hostname,
            content: `${tunnelId}.cfargotunnel.com`,
            ttl: 1,
            proxied: true,
          })
          qc.invalidateQueries({ queryKey: ['dns', zone.id] })
          message.success(t('DNS record created for {{hostname}}', { hostname }))
        } catch (err) {
          message.warning(apiErrorDetail(err) || t('Could not create the DNS record for {{hostname}}', { hostname }))
        }
      }
    },
    onError: (err) => message.error(apiErrorDetail(err) || t('Could not save hostnames')),
  })

  const setRow = (i: number, patch: Partial<TunnelIngressRule>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))

  // Merge into originRequest; empty string / false removes the key (never drop unknown keys).
  const setOrigin = (i: number, key: string, value: string | boolean) =>
    setRows((prev) =>
      prev.map((r, idx) => {
        if (idx !== i) return r
        const originRequest: Record<string, unknown> = { ...(r.originRequest ?? {}) }
        if (value === '' || value === false) delete originRequest[key]
        else originRequest[key] = value
        return { ...r, originRequest }
      }),
    )

  const valid = rows.every((r) => (r.hostname ?? '').trim() !== '' && r.service.trim() !== '')

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2 py-2" data-testid="tunnel-config-skeleton">
        <SkeletonLine width="80%" />
        <SkeletonLine width="60%" />
      </div>
    )
  }
  if (isError) {
    return <div className="py-2 text-[12px] text-danger">{apiErrorDetail(error) || t('Could not load tunnel configuration')}</div>
  }

  return (
    <div className="flex flex-col gap-2 py-2">
      {rows.map((row, i) => {
        const advanced = expanded.has(row._key)
        return (
          <div key={row._key} className="flex flex-col gap-[6px]">
            <div className="flex items-center gap-[6px]">
              <Input
                size="small"
                value={row.hostname}
                placeholder="app.example.com"
                aria-label={t('Hostname')}
                className="font-mono"
                onChange={(e) => setRow(i, { hostname: e.target.value })}
              />
              <span className="text-fg-3">→</span>
              <Input
                size="small"
                value={row.service}
                placeholder="http://localhost:8080"
                aria-label={t('Service')}
                className="font-mono"
                onChange={(e) => setRow(i, { service: e.target.value })}
              />
              <button
                type="button"
                aria-label={t('Advanced')}
                aria-expanded={advanced}
                className={`cursor-pointer border-0 bg-transparent p-0 font-mono text-[13px] ${
                  advanced ? 'text-accent' : 'text-fg-3 hover:text-accent'
                }`}
                onClick={() =>
                  setExpanded((prev) => {
                    const next = new Set(prev)
                    if (next.has(row._key)) next.delete(row._key)
                    else next.add(row._key)
                    return next
                  })
                }
              >
                ⚙
              </button>
              <button
                type="button"
                aria-label={t('Remove hostname {{value}}', { value: row.hostname || String(i + 1) })}
                className="cursor-pointer border-0 bg-transparent p-0 font-mono text-[13px] text-fg-3 hover:text-danger"
                onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))}
              >
                ✕
              </button>
            </div>
            {advanced && (
              <div className="flex flex-col gap-[6px] rounded-[6px] border border-stroke-2 bg-bg-side px-[10px] py-[8px]">
                <div className="flex items-center gap-[6px]">
                  <Lbl className="w-[120px] flex-none">{t('Path')}</Lbl>
                  <Input
                    size="small"
                    value={row.path ?? ''}
                    placeholder="/api"
                    aria-label={t('Path')}
                    className="font-mono"
                    onChange={(e) => setRow(i, { path: e.target.value })}
                  />
                </div>
                <div className="flex items-center gap-[6px]">
                  <Lbl className="w-[120px] flex-none">{t('HTTP Host header')}</Lbl>
                  <Input
                    size="small"
                    value={(row.originRequest?.httpHostHeader as string | undefined) ?? ''}
                    placeholder="internal.example.com"
                    aria-label={t('HTTP Host header')}
                    className="font-mono"
                    onChange={(e) => setOrigin(i, 'httpHostHeader', e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-[6px]">
                  <Lbl className="w-[120px] flex-none">{t('No TLS verify')}</Lbl>
                  <Switch
                    size="small"
                    checked={Boolean(row.originRequest?.noTLSVerify)}
                    aria-label={t('No TLS verify')}
                    onChange={(checked) => setOrigin(i, 'noTLSVerify', checked)}
                  />
                </div>
              </div>
            )}
          </div>
        )
      })}
      {/* Catch-all footer row — server manages it; never editable. */}
      <div className="flex items-center gap-[6px] font-mono text-[11.5px] text-fg-3">
        <span className="flex-1">{t('Everything else')}</span>
        <span>→</span>
        <span className="flex-1">{catchAll?.service ?? 'http_status:404'}</span>
      </div>
      <Checkbox checked={autoDns} onChange={(e) => setAutoDns(e.target.checked)} className="text-[12px]">
        {t('Create DNS records for new hostnames')}
      </Checkbox>
      <div className="flex gap-[6px]">
        <Button
          size="small"
          onClick={() =>
            setRows((prev) => [
              ...prev,
              {
                hostname: '',
                service: 'http://localhost:80',
                _key: prev.reduce((max, r) => Math.max(max, r._key), -1) + 1,
              },
            ])
          }
        >
          + {t('Add hostname')}
        </Button>
        <Button
          size="small"
          type="primary"
          className="ml-auto"
          disabled={!valid}
          loading={save.isPending}
          onClick={() => save.mutate()}
        >
          {t('Save')}
        </Button>
      </div>
    </div>
  )
}

function ConnectionsSection({ tunnelId, open }: { tunnelId: string; open: boolean }) {
  const { t } = useTranslation()
  const qc = useQueryClient()

  const { data, isLoading } = useQuery<{ connections: TunnelConnectorClient[] }>({
    queryKey: ['tunnel-connections', tunnelId],
    queryFn: async () => (await api.get(`/tunnels/${tunnelId}/connections`)).data,
    enabled: open,
    retry: false,
  })
  const clients = data?.connections ?? []

  const disconnect = useMutation({
    mutationFn: async () => api.delete(`/tunnels/${tunnelId}/connections`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tunnel-connections', tunnelId] })
      qc.invalidateQueries({ queryKey: ['tunnels'] })
      message.success(t('Connections dropped'))
    },
    onError: (err) => message.error(apiErrorDetail(err) || t('Could not drop connections')),
  })

  return (
    <div className="flex flex-col gap-2 py-2">
      {isLoading ? (
        <SkeletonLine width="70%" />
      ) : clients.length === 0 ? (
        <div className="font-mono text-[12px] text-fg-3">{t('No active connections')}</div>
      ) : (
        clients.map((client, i) => (
          <div key={client.id ?? i} className="rounded-[6px] border border-stroke-2 px-[10px] py-[7px]">
            <div className="font-mono text-[12px] font-medium">
              {client.version ?? '?'}
              {client.arch ? ` · ${client.arch}` : ''}
            </div>
            {client.runAt && (
              <div className="mt-[2px] font-mono text-[11px] text-fg-3">
                {new Date(client.runAt).toLocaleString()}
              </div>
            )}
            {(client.conns ?? []).map((conn, j) => (
              <div key={j} className="mt-[2px] font-mono text-[11.5px] text-fg-2">
                {conn.colo ?? '?'}
                {conn.originIp ? ` · ${conn.originIp}` : ''}
              </div>
            ))}
          </div>
        ))
      )}
      {clients.length > 0 && (
        <div>
          <Popconfirm
            title={t('Drop all connections for this tunnel?')}
            okText={t('Disconnect all')}
            okButtonProps={{ danger: true }}
            onConfirm={() => disconnect.mutate()}
          >
            <Button size="small" danger loading={disconnect.isPending}>
              {t('Disconnect all')}
            </Button>
          </Popconfirm>
        </div>
      )}
    </div>
  )
}

function RunConnectorSection({ tunnelId }: { tunnelId: string }) {
  const { t } = useTranslation()
  const [token, setToken] = useState<string | null>(null)

  const reveal = useMutation({
    mutationFn: async () => (await api.post(`/tunnels/${tunnelId}/token/reveal`)).data as { token: string },
    onSuccess: (data) => setToken(data.token),
    onError: (err) => message.error(apiErrorDetail(err) || t('Could not reveal the token')),
  })

  return (
    <div className="flex flex-col gap-2 py-2">
      <div className="text-[12px] text-fg-2">
        {t('Install cloudflared on the origin host and run this command')}
      </div>
      <code className="block overflow-x-auto rounded-[6px] border border-stroke-2 bg-bg-side px-[10px] py-[8px] font-mono text-[11.5px] break-all whitespace-pre-wrap">
        cloudflared service install {token ?? '••••••••'}
      </code>
      <div className="flex gap-[6px]">
        {token === null ? (
          <Button size="small" loading={reveal.isPending} onClick={() => reveal.mutate()}>
            {t('Reveal token')}
          </Button>
        ) : (
          <Button
            size="small"
            onClick={() => {
              void navigator.clipboard.writeText(token)
              message.success(t('Token copied'))
            }}
          >
            {t('Copy')}
          </Button>
        )}
      </div>
      <div className="font-mono text-[11px] text-warn">
        ⚠ {t('The token grants permission to run this tunnel — keep it secret')}
      </div>
    </div>
  )
}

function TunnelDetailPanel({
  tunnel,
  onClose,
}: {
  tunnel: Tunnel | null
  onClose: () => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const open = tunnel !== null

  const deleteTunnel = useMutation({
    mutationFn: async (id: string) => api.delete(`/tunnels/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tunnels'] })
      message.success(t('Tunnel deleted'))
      setConfirmDelete(false)
      onClose()
    },
    onError: (err) => message.error(apiErrorDetail(err) || t('Could not delete the tunnel')),
  })

  return (
    <DetailPanel
      open={open}
      title={
        <span className="inline-flex items-center gap-2">
          {tunnel?.name ?? ''}
          {tunnel && <StatusTag status={tunnel.status} />}
        </span>
      }
      padded={false}
      onClose={onClose}
      footer={
        <>
          <Button danger onClick={() => setConfirmDelete(true)}>
            {t('Delete tunnel')}
          </Button>
          <Button className="ml-auto" onClick={onClose}>
            {t('Close')}
          </Button>
        </>
      }
    >
      {/* key remounts sections when switching tunnels so local state resets */}
      <div key={tunnel?.id ?? 'none'}>
        <SectionHeader title={t('Public hostnames')} className="!border-t-0" />
        <div className="px-3.5">
          {tunnel &&
            (tunnel.remoteConfig ? (
              <HostnamesSection tunnelId={tunnel.id} open={open} />
            ) : (
              <div className="py-2 font-mono text-[12px] text-fg-3">
                {t("Locally-managed tunnel — config lives in the origin's YAML file")}
              </div>
            ))}
        </div>
        <SectionHeader title={t('Connections')} />
        <div className="px-3.5">{tunnel && <ConnectionsSection tunnelId={tunnel.id} open={open} />}</div>
        <SectionHeader title={t('Run connector')} />
        <div className="px-3.5">{tunnel && <RunConnectorSection tunnelId={tunnel.id} />}</div>
      </div>
      {tunnel && (
        <ConfirmDestructive
          open={confirmDelete}
          title={t('Delete tunnel?')}
          items={[{ key: tunnel.id, label: tunnel.name, meta: tunnel.id }]}
          explanation={t('Connected cloudflared instances will be disconnected and public hostnames will stop resolving.')}
          confirmText={tunnel.name}
          severity="high"
          loading={deleteTunnel.isPending}
          onConfirm={() => deleteTunnel.mutate(tunnel.id)}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </DetailPanel>
  )
}

function CreateTunnelPanel({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: (tunnel: Tunnel) => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [name, setName] = useState('')

  const create = useMutation({
    mutationFn: async () => (await api.post('/tunnels', { name: name.trim() })).data as Tunnel,
    onSuccess: (tunnel) => {
      qc.invalidateQueries({ queryKey: ['tunnels'] })
      message.success(t('Tunnel created'))
      setName('')
      onCreated(tunnel)
    },
    onError: (err) => message.error(apiErrorDetail(err) || t('Could not create the tunnel')),
  })

  const close = () => {
    setName('')
    onClose()
  }

  return (
    <DetailPanel
      open={open}
      title={t('New tunnel')}
      onClose={close}
      footer={
        <>
          <span className="ml-auto flex gap-2">
            <Button onClick={close}>{t('Cancel')}</Button>
            <Button
              type="primary"
              disabled={name.trim() === ''}
              loading={create.isPending}
              onClick={() => create.mutate()}
            >
              {t('Create')}
            </Button>
          </span>
        </>
      }
    >
      <div className="flex flex-col gap-3 py-1">
        <div>
          <Lbl className="mb-[5px] block">{t('Name')}</Lbl>
          <Input
            value={name}
            placeholder="my-tunnel"
            aria-label={t('Name')}
            className="font-mono"
            onChange={(e) => setName(e.target.value)}
            onPressEnter={() => name.trim() !== '' && create.mutate()}
          />
          <div className="mt-1 font-mono text-[11px] text-fg-3">
            {t('The tunnel is created remotely-managed — you can edit hostnames here after creating it')}
          </div>
        </div>
      </div>
    </DetailPanel>
  )
}

export default function Tunnels() {
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  // null = closed | 'new' = create panel | tunnel id = detail panel (synced to ?tunnel=)
  const panel = searchParams.get('tunnel')
  const setPanel = (value: string | null) =>
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev)
      if (value === null) params.delete('tunnel')
      else params.set('tunnel', value)
      return params
    })
  // Freshly created tunnel — shown in the detail panel until the list refetch includes it.
  const [lastCreated, setLastCreated] = useState<Tunnel | null>(null)

  const { data, isLoading, isError, error, refetch } = useQuery<{ tunnels: Tunnel[] }>({
    queryKey: ['tunnels'],
    queryFn: async () => (await api.get('/tunnels')).data,
    retry: false,
  })
  const tunnels = data?.tunnels ?? []
  const permissionError = isError && isAxiosError(error) && error.response?.status === 403
  const selected =
    panel !== null && panel !== 'new'
      ? tunnels.find((tn) => tn.id === panel) ?? (lastCreated?.id === panel ? lastCreated : null)
      : null

  const statusCounts = tunnels.reduce<Partial<Record<TunnelStatus, number>>>((acc, tn) => {
    acc[tn.status] = (acc[tn.status] ?? 0) + 1
    return acc
  }, {})

  const columns: ColumnsType<Tunnel> = [
    {
      title: t('Name'),
      dataIndex: 'name',
      render: (name: string) => <span className="text-[12.5px] font-medium text-accent">{name}</span>,
    },
    {
      title: t('Status'),
      dataIndex: 'status',
      width: 110,
      render: (status: TunnelStatus) => <StatusTag status={status} />,
    },
    {
      title: t('Connector'),
      key: 'connector',
      width: 150,
      render: (_, tunnel) => <span className="font-mono text-[11.5px] text-fg-2">{connectorSummary(tunnel)}</span>,
    },
    {
      title: t('Config'),
      dataIndex: 'remoteConfig',
      width: 100,
      render: (remote: boolean) => <Tag variant={remote ? 'acc' : 'default'}>{remote ? 'cloudflare' : 'local'}</Tag>,
    },
    {
      title: t('Created'),
      dataIndex: 'createdAt',
      width: 110,
      render: (createdAt?: string) => (
        <span className="font-mono text-[11.5px] text-fg-3">
          {createdAt ? new Date(createdAt).toLocaleDateString() : '—'}
        </span>
      ),
    },
  ]

  return (
    <div className="fade-in">
      <PageHeader
        title={t('Tunnels')}
        crumb={`${tunnels.length}`}
        description={t('Expose origin servers through Cloudflare Tunnel without opening inbound ports')}
        actions={
          <Button type="primary" onClick={() => setPanel('new')} disabled={permissionError}>
            + Tunnel
          </Button>
        }
      />
      {tunnels.length > 0 && (
        <div className="flex flex-wrap gap-[10px] border-b border-stroke px-4 py-[7px] font-mono text-[11.5px] text-fg-2">
          {(['healthy', 'degraded', 'down', 'inactive'] as TunnelStatus[])
            .filter((s) => statusCounts[s])
            .map((s) => (
              <span key={s} className="inline-flex items-center gap-[5px]">
                <Dot status={STATUS_TAG[s].dot} />
                {statusCounts[s]} {s}
              </span>
            ))}
        </div>
      )}
      {permissionError ? (
        <Banner tone="warn">
          {apiErrorDetail(error) || t('The API token is missing the Cloudflare Tunnel permission.')}
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
          {apiErrorDetail(error) || t('Could not load tunnels')}
        </Banner>
      ) : isLoading ? (
        <div className="flex flex-col gap-[12px] p-4" data-testid="tunnels-skeleton">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonLine key={i} width={`${86 - i * 10}%`} />
          ))}
        </div>
      ) : (
        <div className="flex">
          <div className="min-w-0 flex-1">
            {tunnels.length === 0 ? (
              <EmptyState
                icon="⇌"
                title={t('No tunnels yet')}
                desc={t('Create a tunnel, then run cloudflared on the origin host to connect it to Cloudflare')}
                actions={
                  <Button size="small" onClick={() => setPanel('new')}>
                    + Tunnel
                  </Button>
                }
              />
            ) : (
              <Table<Tunnel>
                dataSource={tunnels}
                columns={columns}
                rowKey="id"
                pagination={false}
                size="small"
                tableLayout="fixed"
                scroll={{ x: 640 }}
                onRow={(tunnel) => ({
                  onClick: (event) => {
                    const target = event.target as HTMLElement
                    if (target.closest('button, .ant-popover')) return
                    setPanel(tunnel.id)
                  },
                  style: { cursor: 'pointer' },
                })}
                rowClassName={(tunnel) => (panel === tunnel.id ? 'bg-bg-sel' : '')}
              />
            )}
          </div>
          <CreateTunnelPanel
            open={panel === 'new'}
            onClose={() => setPanel(null)}
            onCreated={(tunnel) => {
              setLastCreated(tunnel)
              setPanel(tunnel.id)
            }}
          />
          <TunnelDetailPanel tunnel={selected} onClose={() => setPanel(null)} />
        </div>
      )}
    </div>
  )
}
