import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, Button, Input, Modal, Select, Space, Table, Typography, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useTranslation } from 'react-i18next'
import { api, apiErrorDetail } from '../../services/api'
import { useAccountStore } from '../../stores/useAccountStore'
import type { CfAccount } from '../AccountSwitcher'
import type { Zone } from '../../types/domain'
import type { BulkJob } from '../../hooks/useJobPolling'
import { Tag } from '../ui'

const { Text } = Typography

const DOMAIN_REGEX = /^([a-z0-9-]+\.)+[a-z]{2,}$/

interface CreatedZoneResult {
  name: string
  zoneId: string
  nameServers: string[]
  status: string
}

interface BulkAddDomainsModalProps {
  open: boolean
  onClose: () => void
  onJobCreated: (jobId: string) => void
}

type LineStatus = 'valid' | 'invalid' | 'exists' | 'duplicate'

interface ParsedLine {
  raw: string
  name: string
  status: LineStatus
}

function parseLines(raw: string, existingNames: Set<string>): ParsedLine[] {
  const seen = new Set<string>()
  return raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const name = line.toLowerCase()
      let status: LineStatus
      if (!DOMAIN_REGEX.test(name)) status = 'invalid'
      else if (existingNames.has(name)) status = 'exists'
      else if (seen.has(name)) status = 'duplicate'
      else status = 'valid'
      seen.add(name)
      return { raw: line, name, status }
    })
}

function exportCsv(job: BulkJob) {
  const rows = [['name', 'zone_id', 'ns1', 'ns2', 'status']]
  for (const item of job.items) {
    if (item.status === 'success' && item.result) {
      const r = item.result as CreatedZoneResult
      rows.push([r.name, r.zoneId, r.nameServers[0] || '', r.nameServers[1] || '', r.status])
    } else {
      rows.push([item.key, '', '', '', `error: ${item.error || 'unknown'}`])
    }
  }
  const csv = rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `domains-nameservers-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

/** Result panel for "create-zones" jobs — nameservers table + CSV export */
export function CreateZonesDone({ job }: { job: BulkJob }) {
  const { t } = useTranslation()
  const nsColumns: ColumnsType<CreatedZoneResult> = [
    { title: 'Domain', dataIndex: 'name', key: 'name' },
    {
      title: t('Nameservers to point to'),
      dataIndex: 'nameServers',
      key: 'nameServers',
      render: (ns: string[]) => (
        <Space orientation="vertical" size={0}>
          {ns.map((n) => (
            <Text key={n} copyable>
              {n}
            </Text>
          ))}
        </Space>
      ),
    },
    { title: t('Status'), dataIndex: 'status', key: 'status', width: 100 },
  ]
  const results = job.items
    .filter((i) => i.status === 'success' && i.result)
    .map((i) => i.result as CreatedZoneResult)
  return (
    <Space orientation="vertical" style={{ width: '100%' }} size="middle">
      {results.length > 0 && (
        <>
          <Alert
            type="info"
            showIcon
            message={t('Point the nameservers at your domain registrar to activate the domains on Cloudflare.')}
          />
          <Table
            dataSource={results}
            rowKey="zoneId"
            columns={nsColumns}
            size="small"
            pagination={{ pageSize: 10, hideOnSinglePage: true }}
            scroll={{ x: 'max-content' }}
          />
        </>
      )}
      <Button onClick={() => exportCsv(job)}>{t('Export CSV')}</Button>
    </Space>
  )
}

const LINE_TAG: Record<Exclude<LineStatus, 'valid'>, { variant: 'err' | 'warn'; label: string }> = {
  invalid: { variant: 'err', label: 'invalid' },
  exists: { variant: 'err', label: 'already exists' },
  duplicate: { variant: 'warn', label: 'duplicate' },
}

const MAX_RENDERED_LINES = 200

/** Bulk zone creation styled after the 2.html bulkadd overlay. */
export default function BulkAddDomainsModal({ open, onClose, onJobCreated }: BulkAddDomainsModalProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [raw, setRaw] = useState('')

  const activeAccountId = useAccountStore((s) => s.activeAccountId)
  const setActiveAccountId = useAccountStore((s) => s.setActiveAccountId)
  const { data: accounts = [] } = useQuery<CfAccount[]>({
    queryKey: ['cf-accounts'],
    queryFn: async () => (await api.get('/cf/accounts')).data,
    staleTime: 60_000,
    enabled: open,
  })

  // Existing zone names (shared ['domains'] cache) power the "already exists" per-line check.
  const { data: zones = [] } = useQuery<Zone[]>({
    queryKey: ['domains'],
    queryFn: async () => (await api.get('/domains')).data,
    staleTime: 60_000,
    enabled: open,
  })
  const existingNames = useMemo(() => new Set(zones.map((z) => z.name.toLowerCase())), [zones])

  const lines = useMemo(() => parseLines(raw, existingNames), [raw, existingNames])
  const validNames = useMemo(
    () => [...new Set(lines.filter((l) => l.status === 'valid').map((l) => l.name))],
    [lines],
  )
  const errorCount = lines.filter((l) => l.status === 'invalid' || l.status === 'exists').length

  const createMutation = useMutation({
    mutationFn: async (names: string[]) =>
      (await api.post('/domains/bulk-create', { names })).data as { jobId: string },
    onSuccess: (data) => {
      setRaw('')
      onJobCreated(data.jobId)
    },
    onError: (error) => message.error(apiErrorDetail(error) || t('Could not create domains in bulk')),
  })

  const handleClose = () => {
    setRaw('')
    onClose()
  }

  const changeAccount = (id: string) => {
    setActiveAccountId(id)
    // Everything scoped to the active account must refetch (same as AccountSwitcher).
    queryClient.invalidateQueries()
  }

  return (
    <Modal
      title={
        <span>
          <span className="block text-[14px] font-semibold">{t('Bulk add domains')}</span>
          <span className="mt-[3px] block font-mono text-[11.5px] font-normal text-fg-3">
            {t('One domain per line · max 500')}
          </span>
        </span>
      }
      open={open}
      onCancel={handleClose}
      footer={
        <div className="flex items-center gap-[7px]">
            <span className="font-mono text-[11.5px] text-fg-3">
            {t('will create {{count}} zones', { count: validNames.length })}
          </span>
          <span className="flex-1" />
          <Button onClick={handleClose}>{t('Cancel')}</Button>
          <Button
            type="primary"
            disabled={validNames.length === 0}
            loading={createMutation.isPending}
            onClick={() => createMutation.mutate(validNames)}
          >
            {t('Create {{count}} domains', { count: validNames.length })}
          </Button>
        </div>
      }
      width={560}
      destroyOnHidden
    >
      <div className="mb-3">
        <label className="mb-1.5 block font-mono text-[11px] tracking-[.08em] text-fg-3 uppercase">
          {t('Cloudflare account')}
        </label>
        <Select
          style={{ width: '100%' }}
          value={activeAccountId ?? undefined}
          onChange={changeAccount}
          placeholder={t('Select account')}
          options={accounts.map((a) => ({ value: a.id, label: a.label || a.email || a.id.slice(0, 8) }))}
        />
      </div>

      <label className="mb-1.5 block font-mono text-[11px] tracking-[.08em] text-fg-3 uppercase">
        {t('Domain list')}
      </label>
      <Input.TextArea
        rows={7}
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        placeholder={'example.com\nexample.net\nexample.org'}
        className="font-mono"
      />
      {lines.length > 0 && (
          <div className="mt-1.5 font-mono text-[11.5px] text-fg-3">
          {t('{{count}} lines', { count: lines.length })} ·{' '}
          <span className="text-ok">{t('{{count}} valid', { count: validNames.length })}</span>
          {errorCount > 0 && (
            <>
              {' '}
              · <span className="text-danger">{t('{{count}} errors', { count: errorCount })}</span>
            </>
          )}
        </div>
      )}
      {lines.some((l) => l.status !== 'valid') && (
        <div className="mt-2 max-h-[132px] overflow-y-auto rounded-[6px] border border-solid border-stroke">
          {lines.slice(0, MAX_RENDERED_LINES).map(
            (line, i) =>
              line.status !== 'valid' && (
                <div
                  key={`${line.raw}-${i}`}
                  className="flex items-center gap-1.5 border-0 border-b border-solid border-stroke-2 px-[9px] py-[5px] font-mono text-[11.5px] text-danger last:border-b-0"
                >
                  <span className="min-w-0 truncate">{line.raw}</span>
                  <Tag variant={LINE_TAG[line.status].variant}>{t(LINE_TAG[line.status].label)}</Tag>
                </div>
              ),
          )}
          {lines.length > MAX_RENDERED_LINES && (
            <div className="px-[9px] py-[5px] font-mono text-[11px] text-fg-3">
              {t('+{{count}} more', { count: lines.length - MAX_RENDERED_LINES })}
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
