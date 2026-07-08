import { useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Modal, Input, Typography, Space, Alert, Button, Table, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useTranslation } from 'react-i18next'
import { api } from '../../services/api'
import type { BulkJob } from '../../hooks/useJobPolling'

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

function parseDomains(raw: string): { valid: string[]; invalid: string[] } {
  const lines = [...new Set(raw.split(/\r?\n/).map((l) => l.trim().toLowerCase()).filter(Boolean))]
  return {
    valid: lines.filter((l) => DOMAIN_REGEX.test(l)),
    invalid: lines.filter((l) => !DOMAIN_REGEX.test(l)),
  }
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
        <Space direction="vertical" size={0}>
          {ns.map((n) => (
            <Text key={n} copyable style={{ fontFamily: 'monospace' }}>
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
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
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
          />
        </>
      )}
      <Button onClick={() => exportCsv(job)}>{t('Export CSV')}</Button>
    </Space>
  )
}

export default function BulkAddDomainsModal({ open, onClose, onJobCreated }: BulkAddDomainsModalProps) {
  const { t } = useTranslation()
  const [raw, setRaw] = useState('')

  const { valid, invalid } = useMemo(() => parseDomains(raw), [raw])

  const createMutation = useMutation({
    mutationFn: async (names: string[]) =>
      (await api.post('/domains/bulk-create', { names })).data as { jobId: string },
    onSuccess: (data) => {
      setRaw('')
      onJobCreated(data.jobId)
    },
    onError: (error: any) => message.error(error.response?.data?.detail || t('Could not create domains in bulk')),
  })

  const handleClose = () => {
    setRaw('')
    onClose()
  }

  return (
    <Modal
      title={t('Bulk add domains')}
      open={open}
      onCancel={handleClose}
      onOk={() => createMutation.mutate(valid)}
      okText={t('Create {{count}} domains', { count: valid.length })}
      cancelText={t('Cancel')}
      okButtonProps={{ disabled: valid.length === 0, loading: createMutation.isPending }}
      width={640}
    >
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <Text type="secondary">{t('Paste a list of domains, one per line (max 500).')}</Text>
        <Input.TextArea
          rows={10}
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder={'example.com\nexample.net\nexample.org'}
        />
        <Space>
          <Text>
            {t('Valid')}: <Text strong>{valid.length}</Text>
          </Text>
          {invalid.length > 0 && <Text type="danger">{t('Invalid: {{count}}', { count: invalid.length })}</Text>}
        </Space>
        {invalid.length > 0 && (
          <Alert
            type="warning"
            showIcon
            message={t('Invalid lines will be skipped')}
            description={invalid.slice(0, 10).join(', ') + (invalid.length > 10 ? '…' : '')}
          />
        )}
      </Space>
    </Modal>
  )
}
