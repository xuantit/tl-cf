import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { Button, Checkbox, Input, Popconfirm, Select, Switch, Table } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { message } from '../lib/antdApp'
import PageHeader from '../components/PageHeader'
import ConfirmDestructive from '../components/ConfirmDestructive'
import { Banner, DetailPanel, EmptyState, KvRow, Lbl, SectionHeader, SkeletonLine, Tag } from '../components/ui'
import type { TagVariant } from '../components/ui'
import { api, apiErrorDetail } from '../services/api'
import { useDomains } from '../hooks/useDomains'
import type {
  PagesDeployment,
  PagesDomain,
  PagesProject,
  PagesProjectDetail,
  WorkerRoute,
  WorkerScript,
} from '../types/edge'

type TabKey = 'workers' | 'pages'

const TABS: Array<{ key: TabKey; icon: string; label: string }> = [
  { key: 'workers', icon: 'ƒ', label: 'Workers' },
  { key: 'pages', icon: '◫', label: 'Pages' },
]

function deployStatusVariant(status?: string): TagVariant {
  if (status === 'success') return 'ok'
  if (status === 'failure') return 'err'
  return 'default'
}

/* ---------------------------------- Workers ---------------------------------- */

/** Routes for the script + per-zone route management (add/delete). */
function WorkerRoutesSection({ script }: { script: WorkerScript }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [zoneId, setZoneId] = useState<string | undefined>(undefined)
  const [pattern, setPattern] = useState('')

  const { data: zones } = useDomains()

  const zoneRoutes = useQuery<{ routes: WorkerRoute[] }>({
    queryKey: ['worker-routes', zoneId],
    queryFn: async () => (await api.get(`/workers/zones/${zoneId}/routes`)).data,
    enabled: zoneId !== undefined,
    retry: false,
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['worker-routes', zoneId] })
    qc.invalidateQueries({ queryKey: ['workers'] })
  }

  const addRoute = useMutation({
    mutationFn: async () =>
      (await api.post(`/workers/zones/${zoneId}/routes`, { pattern: pattern.trim(), script: script.id })).data,
    onSuccess: () => {
      setPattern('')
      invalidate()
      message.success(t('Route added'))
    },
    onError: (err) => message.error(apiErrorDetail(err) || t('Could not add the route')),
  })

  const deleteRoute = useMutation({
    mutationFn: async (routeId: string) => api.delete(`/workers/zones/${zoneId}/routes/${routeId}`),
    onSuccess: () => {
      invalidate()
      message.success(t('Route deleted'))
    },
    onError: (err) => message.error(apiErrorDetail(err) || t('Could not delete the route')),
  })

  return (
    <div className="flex flex-col gap-2 py-2">
      {script.routes.length === 0 ? (
        <div className="font-mono text-[12px] text-fg-3">{t('No routes yet')}</div>
      ) : (
        script.routes.map((route) => (
          <div key={route.id} className="font-mono text-[12px]">
            {route.pattern}
          </div>
        ))
      )}

      <Lbl className="mt-1">{t('Manage routes per zone')}</Lbl>
      <Select
        size="small"
        showSearch
        optionFilterProp="label"
        placeholder={t('Select zone')}
        aria-label={t('Zone')}
        value={zoneId}
        options={(zones ?? []).map((z) => ({ label: z.name, value: z.id }))}
        onChange={(value) => setZoneId(value)}
      />
      {zoneId !== undefined && (
        <>
          {zoneRoutes.isLoading ? (
            <SkeletonLine width="70%" />
          ) : (zoneRoutes.data?.routes ?? []).length === 0 ? (
            <div className="font-mono text-[12px] text-fg-3">{t('No routes in this zone')}</div>
          ) : (
            (zoneRoutes.data?.routes ?? []).map((route) => (
              <div key={route.id} className="flex items-center gap-[6px] font-mono text-[12px]">
                <span className="min-w-0 flex-1 truncate">{route.pattern}</span>
                <span className={route.script === script.id ? 'text-accent' : 'text-fg-3'}>
                  {route.script ?? '—'}
                </span>
                <button
                  type="button"
                  aria-label={t('Delete route {{value}}', { value: route.pattern })}
                  className="cursor-pointer border-0 bg-transparent p-0 font-mono text-[13px] text-fg-3 hover:text-danger"
                  onClick={() => deleteRoute.mutate(route.id)}
                >
                  ✕
                </button>
              </div>
            ))
          )}
          <div className="flex items-center gap-[6px]">
            <Input
              size="small"
              value={pattern}
              placeholder="example.com/*"
              aria-label={t('Pattern')}
              className="font-mono"
              onChange={(e) => setPattern(e.target.value)}
              onPressEnter={() => pattern.trim() !== '' && addRoute.mutate()}
            />
            <Button
              size="small"
              type="primary"
              disabled={pattern.trim() === ''}
              loading={addRoute.isPending}
              onClick={() => addRoute.mutate()}
            >
              {t('Add')}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

/** workers.dev toggle for the script + the public URL when enabled. */
function WorkerSubdomainRow({ scriptName, subdomain }: { scriptName: string; subdomain: string | null }) {
  const { t } = useTranslation()
  const qc = useQueryClient()

  const { data, isLoading } = useQuery<{ enabled: boolean; previewsEnabled?: boolean }>({
    queryKey: ['worker-subdomain', scriptName],
    queryFn: async () => (await api.get(`/workers/scripts/${scriptName}/subdomain`)).data,
    retry: false,
  })
  const enabled = data?.enabled ?? false

  const toggle = useMutation({
    mutationFn: async (next: boolean) =>
      (await api.post(`/workers/scripts/${scriptName}/subdomain`, { enabled: next })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['worker-subdomain', scriptName] })
      message.success(t('workers.dev setting saved'))
    },
    onError: (err) => message.error(apiErrorDetail(err) || t('Could not update the workers.dev setting')),
  })

  const url = subdomain ? `${scriptName}.${subdomain}.workers.dev` : null

  return (
    <KvRow
      k="workers.dev"
      v={
        <span className="inline-flex items-center gap-2">
          <Switch
            size="small"
            checked={enabled}
            loading={isLoading || toggle.isPending}
            aria-label={t('Toggle workers.dev')}
            onChange={(checked) => toggle.mutate(checked)}
          />
          {enabled && url && (
            <a href={`https://${url}`} target="_blank" rel="noreferrer" className="text-accent">
              {url} ↗
            </a>
          )}
        </span>
      }
    />
  )
}

const isValidCron = (value: string) => value.trim().split(/\s+/).length === 5

/** Cron trigger editor — rows synced from the server, saved as a whole via PUT. */
function WorkerCronSection({ scriptName }: { scriptName: string }) {
  const { t } = useTranslation()
  const qc = useQueryClient()

  const { data, isLoading } = useQuery<{ schedules: string[] }>({
    queryKey: ['worker-schedules', scriptName],
    queryFn: async () => (await api.get(`/workers/scripts/${scriptName}/schedules`)).data,
    retry: false,
  })

  // Rows edited locally; re-synced whenever fresh data arrives (panel stays mounted).
  const [rows, setRows] = useState<string[]>([])
  const [synced, setSynced] = useState<typeof data>(undefined)
  if (data !== synced) {
    setSynced(data)
    setRows(data?.schedules ?? [])
  }

  const save = useMutation({
    mutationFn: async () => {
      // Empty rows are dropped on save.
      const schedules = rows.map((r) => r.trim()).filter((r) => r !== '')
      return (await api.put(`/workers/scripts/${scriptName}/schedules`, { schedules })).data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['worker-schedules', scriptName] })
      message.success(t('Cron triggers saved'))
    },
    onError: (err) => message.error(apiErrorDetail(err) || t('Could not save cron triggers')),
  })

  const valid = rows.every((r) => r.trim() === '' || isValidCron(r))

  if (isLoading) {
    return (
      <div className="py-2">
        <SkeletonLine width="70%" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2 py-2">
      {rows.length === 0 ? (
        <div className="font-mono text-[12px] text-fg-3">{t('No cron triggers')}</div>
      ) : (
        rows.map((row, i) => (
          <div key={i} className="flex items-center gap-[6px]">
            <Input
              size="small"
              value={row}
              placeholder="*/5 * * * *"
              aria-label={t('Cron expression')}
              className="font-mono"
              status={row.trim() !== '' && !isValidCron(row) ? 'error' : undefined}
              onChange={(e) => setRows((prev) => prev.map((r, idx) => (idx === i ? e.target.value : r)))}
            />
            <button
              type="button"
              aria-label={t('Remove cron {{value}}', { value: row || String(i + 1) })}
              className="cursor-pointer border-0 bg-transparent p-0 font-mono text-[13px] text-fg-3 hover:text-danger"
              onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))}
            >
              ✕
            </button>
          </div>
        ))
      )}
      {!valid && (
        <div className="font-mono text-[11px] text-danger">
          {t('Invalid cron expression (5 fields required)')}
        </div>
      )}
      <div className="flex gap-[6px]">
        <Button size="small" onClick={() => setRows((prev) => [...prev, ''])}>
          + {t('Add cron')}
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

const SECRET_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/

/** Secret list + write-only add form. Existing names are overwritten by PUT. */
function WorkerSecretsSection({ scriptName }: { scriptName: string }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [value, setValue] = useState('')

  const { data, isLoading } = useQuery<{ secrets: Array<{ name: string; type?: string }> }>({
    queryKey: ['worker-secrets', scriptName],
    queryFn: async () => (await api.get(`/workers/scripts/${scriptName}/secrets`)).data,
    retry: false,
  })
  const secrets = data?.secrets ?? []

  const setSecret = useMutation({
    mutationFn: async () =>
      api.put(`/workers/scripts/${scriptName}/secrets`, { name: name.trim(), secretValue: value }),
    onSuccess: () => {
      setName('')
      setValue('')
      qc.invalidateQueries({ queryKey: ['worker-secrets', scriptName] })
      message.success(t('Secret saved'))
    },
    onError: (err) => message.error(apiErrorDetail(err) || t('Could not save the secret')),
  })

  const deleteSecret = useMutation({
    mutationFn: async (secretName: string) => api.delete(`/workers/scripts/${scriptName}/secrets/${secretName}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['worker-secrets', scriptName] })
      message.success(t('Secret deleted'))
    },
    onError: (err) => message.error(apiErrorDetail(err) || t('Could not delete the secret')),
  })

  const nameValid = SECRET_NAME_RE.test(name.trim())
  const canSubmit = nameValid && value !== ''

  return (
    <div className="flex flex-col gap-2 py-2">
      {isLoading ? (
        <SkeletonLine width="70%" />
      ) : secrets.length === 0 ? (
        <div className="font-mono text-[12px] text-fg-3">{t('No secrets yet')}</div>
      ) : (
        secrets.map((secret) => (
          <div key={secret.name} className="flex items-center gap-[6px] font-mono text-[12px]">
            <span className="min-w-0 flex-1 truncate">{secret.name}</span>
            <Popconfirm
              title={t('Delete this secret?')}
              okButtonProps={{ danger: true }}
              onConfirm={() => deleteSecret.mutate(secret.name)}
            >
              <button
                type="button"
                aria-label={t('Delete secret {{value}}', { value: secret.name })}
                className="cursor-pointer border-0 bg-transparent p-0 font-mono text-[13px] text-fg-3 hover:text-danger"
              >
                ✕
              </button>
            </Popconfirm>
          </div>
        ))
      )}
      <div className="flex items-center gap-[6px]">
        <Input
          size="small"
          value={name}
          placeholder="API_KEY"
          aria-label={t('Secret name')}
          className="max-w-[150px] font-mono"
          status={name !== '' && !nameValid ? 'error' : undefined}
          onChange={(e) => setName(e.target.value)}
        />
        <Input.Password
          size="small"
          value={value}
          placeholder={t('Value')}
          aria-label={t('Secret value')}
          className="font-mono"
          onChange={(e) => setValue(e.target.value)}
        />
        <Button
          size="small"
          type="primary"
          disabled={!canSubmit}
          loading={setSecret.isPending}
          onClick={() => setSecret.mutate()}
        >
          {t('Set secret')}
        </Button>
      </div>
      <div className="font-mono text-[11px] text-fg-3">
        {t('Values are write-only — they can never be read back')}
      </div>
    </div>
  )
}

/** Read-only script source, fetched lazily on demand. */
function WorkerCodeSection({ scriptName }: { scriptName: string }) {
  const { t } = useTranslation()
  const [show, setShow] = useState(false)

  const { data, isLoading, isError, error } = useQuery<string>({
    queryKey: ['worker-content', scriptName],
    queryFn: async () =>
      (
        await api.get(`/workers/scripts/${scriptName}/content`, {
          responseType: 'text',
          transformResponse: [(d: string) => d],
        })
      ).data,
    enabled: show,
    staleTime: Infinity,
    retry: false,
  })

  return (
    <div className="flex flex-col gap-2 py-2">
      {!show ? (
        <div>
          <Button size="small" onClick={() => setShow(true)}>
            {t('View code')}
          </Button>
        </div>
      ) : isLoading ? (
        <SkeletonLine width="80%" />
      ) : isError ? (
        <div className="text-[12px] text-danger">{apiErrorDetail(error) || t('Could not load the code')}</div>
      ) : (
        <pre className="max-h-[300px] overflow-auto rounded-[6px] border border-stroke-2 bg-bg-side p-[10px] font-mono text-[11px] leading-[1.6] whitespace-pre-wrap break-all">
          {data}
        </pre>
      )}
      <div className="font-mono text-[11px] text-fg-3">{t('Read-only — deploy changes with wrangler')}</div>
    </div>
  )
}

function WorkerDetailPanel({
  script,
  subdomain,
  onClose,
}: {
  script: WorkerScript | null
  subdomain: string | null
  onClose: () => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [confirmDelete, setConfirmDelete] = useState(false)

  const deleteWorker = useMutation({
    mutationFn: async (name: string) => api.delete(`/workers/scripts/${name}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workers'] })
      message.success(t('Worker deleted'))
      setConfirmDelete(false)
      onClose()
    },
    onError: (err) => message.error(apiErrorDetail(err) || t('Could not delete the Worker')),
  })

  return (
    <DetailPanel
      open={script !== null}
      title={script?.id ?? ''}
      padded={false}
      onClose={onClose}
      footer={
        <>
          <Button danger onClick={() => setConfirmDelete(true)}>
            {t('Delete Worker')}
          </Button>
          <Button className="ml-auto" onClick={onClose}>
            {t('Close')}
          </Button>
        </>
      }
    >
      {/* key remounts sections when switching scripts so local state resets */}
      <div key={script?.id ?? 'none'}>
        <SectionHeader title={t('Overview')} className="!border-t-0" />
        <div className="px-3.5 py-1">
          <KvRow k={t('Compatibility date')} v={script?.compatibilityDate ?? '—'} />
          <KvRow k={t('Deployed from')} v={script?.lastDeployedFrom ?? '—'} />
          <KvRow k={t('Handlers')} v={(script?.handlers ?? []).join(', ') || '—'} />
          {script && <WorkerSubdomainRow scriptName={script.id} subdomain={subdomain} />}
        </div>
        <SectionHeader title={t('Routes')} />
        <div className="px-3.5">{script && <WorkerRoutesSection script={script} />}</div>
        <SectionHeader title={t('Cron triggers')} />
        <div className="px-3.5">{script && <WorkerCronSection scriptName={script.id} />}</div>
        <SectionHeader title={t('Secrets')} />
        <div className="px-3.5">{script && <WorkerSecretsSection scriptName={script.id} />}</div>
        <SectionHeader title={t('Code')} />
        <div className="px-3.5">{script && <WorkerCodeSection scriptName={script.id} />}</div>
        <div className="px-3.5 py-2 font-mono text-[11px] text-fg-3">
          {t('Deploy code with wrangler — this console manages routes only')}
        </div>
      </div>
      {script && (
        <ConfirmDestructive
          open={confirmDelete}
          title={t('Delete Worker?')}
          items={[{ key: script.id, label: script.id }]}
          explanation={t('The Worker script and its code will be permanently deleted from Cloudflare.')}
          confirmText={script.id}
          severity="high"
          loading={deleteWorker.isPending}
          onConfirm={() => deleteWorker.mutate(script.id)}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </DetailPanel>
  )
}

function WorkersView() {
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const selected = searchParams.get('script')
  const setSelected = (id: string | null) =>
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev)
      if (id === null) params.delete('script')
      else params.set('script', id)
      return params
    })

  const { data, isLoading, isError, error, refetch } = useQuery<{
    scripts: WorkerScript[]
    subdomain: string | null
  }>({
    queryKey: ['workers'],
    queryFn: async () => (await api.get('/workers/scripts')).data,
    retry: false,
  })
  const scripts = data?.scripts ?? []
  const permissionError = isError && isAxiosError(error) && error.response?.status === 403
  const script = selected !== null ? scripts.find((s) => s.id === selected) ?? null : null

  const columns: ColumnsType<WorkerScript> = [
    {
      title: t('Name'),
      dataIndex: 'id',
      render: (id: string) => <span className="text-[12.5px] font-medium text-accent">{id}</span>,
    },
    {
      title: t('Routes'),
      key: 'routes',
      width: 220,
      render: (_, s) =>
        s.routes.length === 0 ? (
          <span className="font-mono text-[11.5px] text-fg-3">—</span>
        ) : (
          <span className="font-mono text-[11.5px] text-fg-2">
            {s.routes.length} · <span className="inline-block max-w-[150px] truncate align-bottom">{s.routes[0].pattern}</span>
          </span>
        ),
    },
    {
      title: t('Handlers'),
      dataIndex: 'handlers',
      width: 150,
      render: (handlers: string[]) => (
        <span className="font-mono text-[11.5px] text-fg-2">{handlers.join(', ') || '—'}</span>
      ),
    },
    {
      title: t('Modified'),
      dataIndex: 'modifiedOn',
      width: 110,
      render: (modifiedOn?: string) => (
        <span className="font-mono text-[11.5px] text-fg-3">
          {modifiedOn ? new Date(modifiedOn).toLocaleDateString() : '—'}
        </span>
      ),
    },
  ]

  if (permissionError) {
    return (
      <Banner tone="warn">
        {apiErrorDetail(error) || t('The API token is missing the Workers Scripts permission.')}
      </Banner>
    )
  }
  if (isError) {
    return (
      <Banner
        tone="err"
        actions={
          <Button size="small" onClick={() => refetch()}>
            ↻ {t('Retry')}
          </Button>
        }
      >
        {apiErrorDetail(error) || t('Could not load Workers')}
      </Banner>
    )
  }
  if (isLoading) {
    return (
      <div className="flex flex-col gap-[12px] p-4" data-testid="workers-skeleton">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonLine key={i} width={`${86 - i * 10}%`} />
        ))}
      </div>
    )
  }

  return (
    <div className="flex">
      <div className="min-w-0 flex-1">
        {scripts.length === 0 ? (
          <EmptyState
            icon="ƒ"
            title={t('No Workers yet')}
            desc={t('Deploy a script with wrangler deploy — it will show up here')}
          />
        ) : (
          <Table<WorkerScript>
            dataSource={scripts}
            columns={columns}
            rowKey="id"
            pagination={false}
            size="small"
            tableLayout="fixed"
            scroll={{ x: 640 }}
            onRow={(s) => ({
              onClick: (event) => {
                const target = event.target as HTMLElement
                if (target.closest('button, .ant-popover')) return
                setSelected(s.id)
              },
              style: { cursor: 'pointer' },
            })}
            rowClassName={(s) => (selected === s.id ? 'bg-bg-sel' : '')}
          />
        )}
      </div>
      <WorkerDetailPanel script={script} subdomain={data?.subdomain ?? null} onClose={() => setSelected(null)} />
    </div>
  )
}

/* ----------------------------------- Pages ----------------------------------- */

function PagesDomainsSection({ project }: { project: PagesProject }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [hostname, setHostname] = useState('')

  const { data, isLoading } = useQuery<{ domains: PagesDomain[] }>({
    queryKey: ['pages-domains', project.name],
    queryFn: async () => (await api.get(`/pages/projects/${project.name}/domains`)).data,
    retry: false,
  })
  const domains = data?.domains ?? []

  const addDomain = useMutation({
    mutationFn: async () =>
      (await api.post(`/pages/projects/${project.name}/domains`, { name: hostname.trim() })).data,
    onSuccess: () => {
      setHostname('')
      qc.invalidateQueries({ queryKey: ['pages-domains', project.name] })
      message.success(t('Domain added'))
    },
    onError: (err) => message.error(apiErrorDetail(err) || t('Could not add the domain')),
  })

  const removeDomain = useMutation({
    mutationFn: async (name: string) => api.delete(`/pages/projects/${project.name}/domains/${name}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pages-domains', project.name] })
      message.success(t('Domain removed'))
    },
    onError: (err) => message.error(apiErrorDetail(err) || t('Could not remove the domain')),
  })

  return (
    <div className="flex flex-col gap-2 py-2">
      {isLoading ? (
        <SkeletonLine width="70%" />
      ) : domains.length === 0 ? (
        <div className="font-mono text-[12px] text-fg-3">{t('No custom domains')}</div>
      ) : (
        domains.map((domain, i) => (
          <div key={domain.id ?? domain.name ?? i} className="flex items-center gap-[6px] font-mono text-[12px]">
            <span className="min-w-0 flex-1 truncate">{domain.name}</span>
            {domain.status && (
              <Tag variant={domain.status === 'active' ? 'ok' : 'default'}>{domain.status}</Tag>
            )}
            <Popconfirm
              title={t('Remove this domain?')}
              okButtonProps={{ danger: true }}
              onConfirm={() => removeDomain.mutate(domain.name)}
            >
              <button
                type="button"
                aria-label={t('Remove domain {{value}}', { value: domain.name })}
                className="cursor-pointer border-0 bg-transparent p-0 font-mono text-[13px] text-fg-3 hover:text-danger"
              >
                ✕
              </button>
            </Popconfirm>
          </div>
        ))
      )}
      <div className="flex items-center gap-[6px]">
        <Input
          size="small"
          value={hostname}
          placeholder="www.example.com"
          aria-label={t('Hostname')}
          className="font-mono"
          onChange={(e) => setHostname(e.target.value)}
          onPressEnter={() => hostname.trim() !== '' && addDomain.mutate()}
        />
        <Button
          size="small"
          type="primary"
          disabled={hostname.trim() === ''}
          loading={addDomain.isPending}
          onClick={() => addDomain.mutate()}
        >
          {t('Add')}
        </Button>
      </div>
    </div>
  )
}

function PagesDeploymentsSection({ project }: { project: PagesProject }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [checked, setChecked] = useState<Set<string>>(new Set())

  const { data, isLoading, isFetching } = useQuery<{
    deployments: PagesDeployment[]
    page: number
    totalPages: number
    totalCount: number
  }>({
    queryKey: ['pages-deployments', project.name, page],
    queryFn: async () => (await api.get(`/pages/projects/${project.name}/deployments`, { params: { page } })).data,
    placeholderData: (prev) => prev,
    retry: false,
  })
  const deployments = data?.deployments ?? []
  const totalPages = data?.totalPages ?? 1
  // The live production deployment is the newest one — it only appears on page 1.
  const liveProductionId = page === 1 ? deployments.find((d) => d.environment === 'production')?.id : undefined
  const deletableIds = deployments.filter((d) => d.id !== liveProductionId).map((d) => d.id)
  const selectedIds = deletableIds.filter((id) => checked.has(id))

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['pages-deployments', project.name] })
    qc.invalidateQueries({ queryKey: ['pages-projects'] })
  }

  const rollback = useMutation({
    mutationFn: async (id: string) =>
      (await api.post(`/pages/projects/${project.name}/deployments/${id}/rollback`)).data,
    onSuccess: () => {
      invalidate()
      message.success(t('Deployment rolled back'))
    },
    onError: (err) => message.error(apiErrorDetail(err) || t('Could not roll back the deployment')),
  })

  const retry = useMutation({
    mutationFn: async (id: string) =>
      (await api.post(`/pages/projects/${project.name}/deployments/${id}/retry`)).data,
    onSuccess: () => {
      invalidate()
      message.success(t('Deployment retried'))
    },
    onError: (err) => message.error(apiErrorDetail(err) || t('Could not retry the deployment')),
  })

  const removeDeployment = useMutation({
    mutationFn: async (id: string) => api.delete(`/pages/projects/${project.name}/deployments/${id}`),
    onSuccess: () => {
      invalidate()
      message.success(t('Deployment deleted'))
    },
    onError: (err) => message.error(apiErrorDetail(err) || t('Could not delete the deployment')),
  })

  const bulkDelete = useMutation({
    mutationFn: async (ids: string[]) => {
      const failed: string[] = []
      for (const id of ids) {
        try {
          await api.delete(`/pages/projects/${project.name}/deployments/${id}`)
        } catch {
          failed.push(id)
        }
      }
      return { deleted: ids.length - failed.length, failed }
    },
    onSuccess: ({ deleted, failed }) => {
      setChecked(new Set())
      invalidate()
      if (failed.length === 0) {
        message.success(t('{{count}} deployments deleted', { count: deleted }))
      } else {
        message.warning(
          t('{{deleted}} deployments deleted, {{failed}} failed', { deleted, failed: failed.length }),
        )
      }
    },
  })

  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false)
  const deleteAll = useMutation({
    mutationFn: async () =>
      (await api.delete(`/pages/projects/${project.name}/deployments`)).data as {
        deleted: number
        failed: number
      },
    onMutate: () => {
      message.open({
        key: 'pages-delete-all',
        type: 'loading',
        content: t('Deleting all deployments… this can take a few minutes, please wait'),
        duration: 0,
      })
    },
    onSuccess: ({ deleted, failed }) => {
      setConfirmDeleteAll(false)
      setChecked(new Set())
      setPage(1)
      invalidate()
      if (failed === 0) {
        message.open({
          key: 'pages-delete-all',
          type: 'success',
          content: t('{{count}} deployments deleted', { count: deleted }),
        })
      } else {
        message.open({
          key: 'pages-delete-all',
          type: 'warning',
          duration: 8,
          content: t(
            '{{deleted}} deployments deleted, {{failed}} could not be deleted (usually the live production one). You can still delete the project even while it remains.',
            { deleted, failed },
          ),
        })
      }
    },
    onError: (err) => {
      message.open({
        key: 'pages-delete-all',
        type: 'error',
        content: apiErrorDetail(err) || t('Could not delete the deployment'),
      })
    },
  })

  const toggle = (id: string, on: boolean) =>
    setChecked((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })

  const changePage = (next: number) => {
    setPage(next)
    setChecked(new Set())
  }

  return (
    <div className="flex flex-col gap-2 py-2">
      {isLoading ? (
        <SkeletonLine width="70%" />
      ) : deployments.length === 0 ? (
        <div className="font-mono text-[12px] text-fg-3">{t('No deployments yet')}</div>
      ) : (
        <>
          {deletableIds.length > 0 && (
            <div className="flex items-center gap-2">
              <Checkbox
                checked={selectedIds.length > 0 && selectedIds.length === deletableIds.length}
                indeterminate={selectedIds.length > 0 && selectedIds.length < deletableIds.length}
                onChange={(e) =>
                  setChecked(e.target.checked ? new Set(deletableIds) : new Set())
                }
              >
                <span className="font-mono text-[11.5px] text-fg-2">{t('Select all')}</span>
              </Checkbox>
              {selectedIds.length > 0 && (
                <Popconfirm
                  title={t('Delete {{count}} deployments?', { count: selectedIds.length })}
                  okButtonProps={{ danger: true }}
                  onConfirm={() => bulkDelete.mutate(selectedIds)}
                >
                  <Button size="small" danger loading={bulkDelete.isPending}>
                    {t('Delete selected ({{count}})', { count: selectedIds.length })}
                  </Button>
                </Popconfirm>
              )}
              <Button
                size="small"
                danger
                className="ml-auto"
                loading={deleteAll.isPending}
                onClick={() => setConfirmDeleteAll(true)}
              >
                {t('Delete all')}
              </Button>
              <ConfirmDestructive
                open={confirmDeleteAll}
                title={t('Delete all deployments?')}
                explanation={
                  <>
                    {t(
                      'Every deployment of {{name}} will be deleted. Cloudflare usually refuses to delete the live production deployment, so it may remain — use Delete project to remove everything for good.',
                      { name: project.name },
                    )}
                    <br />
                    {t('Deployments are deleted one by one — with many deployments this can take several minutes. Keep this page open and wait.')}
                  </>
                }
                confirmText={project.name}
                loading={deleteAll.isPending}
                onConfirm={() => deleteAll.mutate()}
                onCancel={() => setConfirmDeleteAll(false)}
              />
            </div>
          )}
          {deployments.map((d) => (
            <div key={d.id} className="rounded-[6px] border border-stroke-2 px-[10px] py-[7px]">
              <div className="flex items-center gap-[6px]">
                {d.id !== liveProductionId && (
                  <Checkbox
                    aria-label={t('Select deployment {{value}}', { value: d.id.slice(0, 8) })}
                    checked={checked.has(d.id)}
                    onChange={(e) => toggle(d.id, e.target.checked)}
                  />
                )}
                <span className="font-mono text-[12px] font-medium">{d.id.slice(0, 8)}</span>
                <Tag variant={d.environment === 'production' ? 'ok' : 'default'}>{d.environment ?? 'preview'}</Tag>
                {d.status && <Tag variant={deployStatusVariant(d.status)}>{d.status}</Tag>}
                <span className="ml-auto inline-flex items-center gap-[6px]">
                  {/* CF only allows rollback to successful production builds */}
                  {d.environment === 'production' && d.status === 'success' && d.id !== liveProductionId && (
                    <Popconfirm
                      title={t('Roll back to this deployment?')}
                      okButtonProps={{ danger: true }}
                      onConfirm={() => rollback.mutate(d.id)}
                    >
                      <Button size="small" loading={rollback.isPending && rollback.variables === d.id}>
                        {t('Rollback')}
                      </Button>
                    </Popconfirm>
                  )}
                  {d.status === 'failure' && (
                    <Button
                      size="small"
                      loading={retry.isPending && retry.variables === d.id}
                      onClick={() => retry.mutate(d.id)}
                    >
                      {t('Retry')}
                    </Button>
                  )}
                  {d.id !== liveProductionId && (
                    <Popconfirm
                      title={t('Delete this deployment?')}
                      okButtonProps={{ danger: true }}
                      onConfirm={() => removeDeployment.mutate(d.id)}
                    >
                      <button
                        type="button"
                        aria-label={t('Delete deployment {{value}}', { value: d.id.slice(0, 8) })}
                        className="cursor-pointer border-0 bg-transparent p-0 font-mono text-[13px] text-fg-3 hover:text-danger"
                      >
                        ✕
                      </button>
                    </Popconfirm>
                  )}
                </span>
              </div>
              {(d.branch || d.commitHash) && (
                <div className="mt-[2px] font-mono text-[11.5px] text-fg-2">
                  {d.branch ?? '—'}
                  {d.commitHash ? ` · ${d.commitHash.slice(0, 7)}` : ''}
                </div>
              )}
              <div className="mt-[2px] font-mono text-[11px] text-fg-3">
                {d.createdOn ? new Date(d.createdOn).toLocaleString() : '—'}
                {d.url && (
                  <>
                    {' · '}
                    <a href={d.url} target="_blank" rel="noreferrer" className="text-accent">
                      {d.url.replace(/^https?:\/\//, '')} ↗
                    </a>
                  </>
                )}
              </div>
            </div>
          ))}
          {totalPages > 1 && (
            <div className="flex items-center justify-end gap-2">
              <Button size="small" disabled={page <= 1 || isFetching} onClick={() => changePage(page - 1)}>
                ‹ {t('Prev')}
              </Button>
              <span className="font-mono text-[11.5px] text-fg-2">
                {t('Page {{page}} of {{total}}', { page, total: totalPages })}
              </span>
              <Button size="small" disabled={page >= totalPages || isFetching} onClick={() => changePage(page + 1)}>
                {t('Next')} ›
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

interface EnvRow {
  key: string
  value: string
  secret: boolean
}

/** Production env vars editor. Secret values never round-trip — empty secret rows are left untouched. */
function PagesEnvSection({ project }: { project: PagesProject }) {
  const { t } = useTranslation()
  const qc = useQueryClient()

  const { data, isLoading, isError, error } = useQuery<PagesProjectDetail>({
    queryKey: ['pages-project', project.name],
    queryFn: async () => (await api.get(`/pages/projects/${project.name}`)).data,
    retry: false,
  })

  // Rows edited locally; re-synced whenever fresh detail data arrives (panel stays mounted).
  const [rows, setRows] = useState<EnvRow[]>([])
  const [synced, setSynced] = useState<typeof data>(undefined)
  if (data !== synced) {
    setSynced(data)
    setRows((data?.envVars ?? []).map((v) => ({ key: v.key, value: v.value ?? '', secret: v.secret })))
  }

  const save = useMutation({
    mutationFn: async () => {
      const envVars = rows
        // Secret rows left empty are unchanged — never send them back.
        .filter((r) => r.key.trim() !== '' && !(r.secret && r.value === ''))
        .map((r) =>
          r.secret
            ? { key: r.key.trim(), secretValue: r.value, secret: true }
            : { key: r.key.trim(), value: r.value, secret: false },
        )
      const currentKeys = new Set(rows.map((r) => r.key.trim()))
      const removedKeys = (synced?.envVars ?? []).map((v) => v.key).filter((k) => !currentKeys.has(k))
      return (await api.patch(`/pages/projects/${project.name}/env`, { envVars, removedKeys })).data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pages-project', project.name] })
      message.success(t('Environment variables saved'))
    },
    onError: (err) => message.error(apiErrorDetail(err) || t('Could not save environment variables')),
  })

  const setRow = (i: number, patch: Partial<EnvRow>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))

  const valid = rows.every((r) => r.key.trim() !== '')

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2 py-2" data-testid="pages-env-skeleton">
        <SkeletonLine width="80%" />
        <SkeletonLine width="60%" />
      </div>
    )
  }
  if (isError) {
    return (
      <div className="py-2 text-[12px] text-danger">
        {apiErrorDetail(error) || t('Could not load environment variables')}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2 py-2">
      {rows.length === 0 ? (
        <div className="font-mono text-[12px] text-fg-3">{t('No environment variables')}</div>
      ) : (
        rows.map((row, i) => (
          <div key={i} className="flex items-center gap-[6px]">
            <Input
              size="small"
              value={row.key}
              placeholder="KEY"
              aria-label={t('Key')}
              className="max-w-[150px] font-mono"
              onChange={(e) => setRow(i, { key: e.target.value })}
            />
            <Input
              size="small"
              value={row.value}
              placeholder={row.secret ? t('(hidden)') : t('Value')}
              aria-label={t('Value')}
              className="font-mono"
              onChange={(e) => setRow(i, { value: e.target.value })}
            />
            <Switch
              size="small"
              checked={row.secret}
              aria-label={t('Secret')}
              onChange={(checked) => setRow(i, { secret: checked })}
            />
            <button
              type="button"
              aria-label={t('Remove variable {{value}}', { value: row.key || String(i + 1) })}
              className="cursor-pointer border-0 bg-transparent p-0 font-mono text-[13px] text-fg-3 hover:text-danger"
              onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))}
            >
              ✕
            </button>
          </div>
        ))
      )}
      <div className="flex gap-[6px]">
        <Button size="small" onClick={() => setRows((prev) => [...prev, { key: '', value: '', secret: false }])}>
          + {t('Add variable')}
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
      <div className="font-mono text-[11px] text-fg-3">{t('Production environment only')}</div>
    </div>
  )
}

function PagesProjectPanel({ project, onClose }: { project: PagesProject | null; onClose: () => void }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [confirmDelete, setConfirmDelete] = useState(false)

  const removeProject = useMutation({
    mutationFn: async (name: string) => api.delete(`/pages/projects/${name}`),
    onSuccess: () => {
      setConfirmDelete(false)
      qc.invalidateQueries({ queryKey: ['pages-projects'] })
      message.success(t('Project deleted'))
      onClose()
    },
    onError: (err) => {
      const detail = apiErrorDetail(err) ?? ''
      if (/too many deployments/i.test(detail)) {
        setConfirmDelete(false)
        message.error(
          t('This project has too many deployments — use Delete all in the Deployments section first, then delete the project.'),
        )
      } else {
        message.error(detail || t('Could not delete the project'))
      }
    },
  })

  return (
    <DetailPanel
      open={project !== null}
      title={project?.name ?? ''}
      padded={false}
      onClose={onClose}
      footer={
        <>
          <Button danger onClick={() => setConfirmDelete(true)}>
            {t('Delete project')}
          </Button>
          <Button className="ml-auto" onClick={onClose}>
            {t('Close')}
          </Button>
        </>
      }
    >
      <div key={project?.name ?? 'none'}>
        <SectionHeader title={t('Custom domains')} className="!border-t-0" />
        <div className="px-3.5">{project && <PagesDomainsSection project={project} />}</div>
        <SectionHeader title={t('Environment variables')} />
        <div className="px-3.5">{project && <PagesEnvSection project={project} />}</div>
        <SectionHeader title={t('Deployments')} />
        <div className="px-3.5">{project && <PagesDeploymentsSection project={project} />}</div>
      </div>
      {project && (
        <ConfirmDestructive
          open={confirmDelete}
          title={t('Delete Pages project?')}
          explanation={
            <>
              {t('The project {{name}} and all its deployments, domains and settings will be permanently deleted.', {
                name: project.name,
              })}
              <br />
              {t('Cloudflare may refuse to delete a project with too many deployments — in that case use Delete all in the Deployments section first.')}
              <br />
              {t('The live production deployment does not need to be deleted — the project can be deleted even while it remains.')}
            </>
          }
          confirmText={project.name}
          loading={removeProject.isPending}
          onConfirm={() => removeProject.mutate(project.name)}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </DetailPanel>
  )
}

function PagesView() {
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const selected = searchParams.get('project')
  const setSelected = (name: string | null) =>
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev)
      if (name === null) params.delete('project')
      else params.set('project', name)
      return params
    })

  const { data, isLoading, isError, error, refetch } = useQuery<{ projects: PagesProject[] }>({
    queryKey: ['pages-projects'],
    queryFn: async () => (await api.get('/pages/projects')).data,
    retry: false,
  })
  const projects = data?.projects ?? []
  const permissionError = isError && isAxiosError(error) && error.response?.status === 403
  const project = selected !== null ? projects.find((p) => p.name === selected) ?? null : null

  const columns: ColumnsType<PagesProject> = [
    {
      title: t('Project'),
      dataIndex: 'name',
      render: (name: string) => <span className="text-[12.5px] font-medium text-accent">{name}</span>,
    },
    {
      title: t('Domains'),
      dataIndex: 'domains',
      width: 200,
      render: (domains: string[]) =>
        domains.length === 0 ? (
          <span className="font-mono text-[11.5px] text-fg-3">—</span>
        ) : (
          <span className="font-mono text-[11.5px] text-fg-2">
            <span className="inline-block max-w-[150px] truncate align-bottom">{domains[0]}</span>
            {domains.length > 1 ? ` +${domains.length - 1}` : ''}
          </span>
        ),
    },
    {
      title: t('Production branch'),
      dataIndex: 'productionBranch',
      width: 140,
      render: (branch?: string) => <span className="font-mono text-[11.5px] text-fg-2">{branch ?? '—'}</span>,
    },
    {
      title: t('Latest deployment'),
      key: 'latest',
      width: 190,
      render: (_, p) =>
        p.latestDeployment ? (
          <span className="inline-flex items-center gap-[6px]">
            <Tag variant={deployStatusVariant(p.latestDeployment.status)}>
              {p.latestDeployment.status ?? '?'}
            </Tag>
            <span className="font-mono text-[11.5px] text-fg-3">
              {p.latestDeployment.modifiedOn || p.latestDeployment.createdOn
                ? new Date(p.latestDeployment.modifiedOn ?? p.latestDeployment.createdOn!).toLocaleDateString()
                : '—'}
            </span>
          </span>
        ) : (
          <span className="font-mono text-[11.5px] text-fg-3">—</span>
        ),
    },
  ]

  if (permissionError) {
    return (
      <Banner tone="warn">
        {apiErrorDetail(error) || t('The API token is missing the Cloudflare Pages permission.')}
      </Banner>
    )
  }
  if (isError) {
    return (
      <Banner
        tone="err"
        actions={
          <Button size="small" onClick={() => refetch()}>
            ↻ {t('Retry')}
          </Button>
        }
      >
        {apiErrorDetail(error) || t('Could not load Pages projects')}
      </Banner>
    )
  }
  if (isLoading) {
    return (
      <div className="flex flex-col gap-[12px] p-4" data-testid="pages-skeleton">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonLine key={i} width={`${86 - i * 10}%`} />
        ))}
      </div>
    )
  }

  return (
    <div className="flex">
      <div className="min-w-0 flex-1">
        {projects.length === 0 ? (
          <EmptyState
            icon="◫"
            title={t('No Pages projects yet')}
            desc={t('Create a Pages project from the Cloudflare dashboard or wrangler — it will show up here')}
          />
        ) : (
          <Table<PagesProject>
            dataSource={projects}
            columns={columns}
            rowKey="name"
            pagination={false}
            size="small"
            tableLayout="fixed"
            scroll={{ x: 640 }}
            onRow={(p) => ({
              onClick: (event) => {
                const target = event.target as HTMLElement
                if (target.closest('button, .ant-popover')) return
                setSelected(p.name)
              },
              style: { cursor: 'pointer' },
            })}
            rowClassName={(p) => (selected === p.name ? 'bg-bg-sel' : '')}
          />
        )}
      </div>
      <PagesProjectPanel project={project} onClose={() => setSelected(null)} />
    </div>
  )
}

/* ----------------------------------- Page ------------------------------------ */

export default function WorkersPages() {
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const tab: TabKey = searchParams.get('tab') === 'pages' ? 'pages' : 'workers'

  const setTab = (next: TabKey) => {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev)
        if (next === 'workers') params.delete('tab')
        else params.set('tab', next)
        // Đổi tab thì đóng panel của tab cũ
        params.delete('script')
        params.delete('project')
        return params
      },
      { replace: true },
    )
  }

  return (
    <div className="fade-in p-[clamp(12px,3vw,24px)]">
      <PageHeader
        title={t('Workers & Pages')}
        description={t('Manage Workers scripts, routes and Pages deployments')}
      />
      <div className="flex gap-1.5 border-b border-stroke px-4 py-2">
        {TABS.map((entry) => {
          const on = entry.key === tab
          return (
            <button
              key={entry.key}
              type="button"
              onClick={() => setTab(entry.key)}
              className={`flex flex-none cursor-pointer items-center gap-1.5 rounded-full border border-solid px-3 py-[5px] text-[12.5px] whitespace-nowrap transition-colors ${
                on
                  ? 'border-transparent bg-accent-soft font-medium text-accent'
                  : 'border-stroke bg-bg text-fg-2'
              }`}
            >
              <span className="text-[12px] opacity-85">{entry.icon}</span>
              {t(entry.label)}
            </button>
          )
        })}
      </div>
      {tab === 'workers' ? <WorkersView /> : <PagesView />}
    </div>
  )
}
