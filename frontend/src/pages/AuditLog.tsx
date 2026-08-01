import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Table, Button, Input, Tooltip } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useTranslation } from 'react-i18next'
import { api, apiErrorDetail } from '../services/api'
import PageHeader from '../components/PageHeader'
import { Banner, EmptyState, Tag } from '../components/ui'
import { formatClock } from '../utils/format'

interface AuditEntry {
  id: string
  userId: string | null
  email: string | null
  method: string
  path: string
  status: number
  meta: unknown
  ip: string | null
  createdAt: string
}

interface AuditResponse {
  total: number
  page: number
  limit: number
  items: AuditEntry[]
}

// Map path pattern → action label (translated via t())
const ACTION_LABELS: [RegExp, string][] = [
  [/^\/api\/auth\/login$/, 'Login'],
  [/^\/api\/auth\/register$/, 'Register'],
  [/^\/api\/auth\/setup$/, 'Create first admin'],
  [/^\/api\/cf\/accounts\/import$/, 'Import CF accounts'],
  [/^\/api\/cf\/accounts\/[^/]+$/, 'Update/delete CF account'],
  [/^\/api\/cf\/accounts$/, 'Add CF account'],
  [/^\/api\/cf\/credentials$/, 'Save CF credentials'],
  [/^\/api\/domains\/bulk-create$/, 'Bulk create domains'],
  [/^\/api\/domains\/bulk-dns\/replace$/, 'Bulk replace DNS'],
  [/^\/api\/domains\/bulk-dns\/preview$/, 'Preview DNS replace'],
  [/^\/api\/domains\/bulk$/, 'Bulk domain operation'],
  [/^\/api\/domains\/[^/]+\/tags$/, 'Update tags'],
  [/^\/api\/domains\/[^/]+\/dns/, 'Edit DNS record'],
  [/^\/api\/domains\/[^/]+\/purge/, 'Purge cache'],
  [/^\/api\/domains\/[^/]+/, 'Domain operation'],
  [/^\/api\/domains$/, 'Create domain'],
  [/^\/api\/templates\/[^/]+\/apply$/, 'Apply template'],
  [/^\/api\/templates\/from-zone/, 'Create template from zone'],
  [/^\/api\/templates\/[^/]+$/, 'Update/delete template'],
  [/^\/api\/templates$/, 'Create template'],
  [/^\/api\/invites\/[^/]+$/, 'Revoke invite code'],
  [/^\/api\/invites$/, 'Create invite code'],
  [/^\/api\/users\/[^/]+$/, 'Manage user'],
]

function actionLabel(path: string): string | null {
  for (const [re, label] of ACTION_LABELS) {
    if (re.test(path)) return label
  }
  return null
}

export default function AuditLog() {
  const { t, i18n } = useTranslation()
  const dateLocale = i18n.language === 'vi' ? 'vi-VN' : 'en-US'
  const [page, setPage] = useState(1)
  const [pathFilter, setPathFilter] = useState('')

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery<AuditResponse>({
    queryKey: ['audit', page, pathFilter],
    queryFn: async () =>
      (
        await api.get('/audit', {
          params: { page, limit: 50, ...(pathFilter ? { path: pathFilter } : {}) },
        })
      ).data,
    placeholderData: keepPreviousData,
  })

  const columns: ColumnsType<AuditEntry> = [
    {
      title: t('Time'),
      dataIndex: 'createdAt',
      width: 130,
      render: (v: string) => (
        <span className="font-mono text-[11px] text-fg-2" title={new Date(v).toLocaleString(dateLocale)}>
          {formatClock(v, true)}
        </span>
      ),
    },
    {
      title: 'Actor',
      dataIndex: 'email',
      width: 200,
      ellipsis: true,
      render: (email: string | null) =>
        email ? (
          <span className="font-mono text-[12px] font-medium text-fg">{email}</span>
        ) : (
          <span className="text-fg-3">—</span>
        ),
    },
    {
      title: t('Action'),
      key: 'action',
      width: 190,
      render: (_, r) => {
        const label = actionLabel(r.path)
        const isAuth = /^\/api\/auth\//.test(r.path)
        const variant = isAuth ? 'default' : r.method === 'DELETE' ? 'err' : 'acc'
        return <Tag variant={variant}>{label ? t(label) : r.method.toLowerCase()}</Tag>
      },
    },
    {
      title: t('Target'),
      key: 'target',
      ellipsis: true,
      render: (_, r) => (
        <span className="font-mono text-[11px] text-fg-3">
          {r.method} {r.path}
        </span>
      ),
    },
    {
      title: 'IP',
      dataIndex: 'ip',
      width: 130,
      ellipsis: true,
      render: (ip: string | null) =>
        ip ? <span className="font-mono text-[11px] text-fg-2">{ip}</span> : <span className="text-fg-3">—</span>,
    },
    {
      title: t('Result'),
      dataIndex: 'status',
      width: 90,
      render: (status: number) => <Tag variant={status < 400 ? 'ok' : 'err'}>{status}</Tag>,
    },
    {
      title: '',
      dataIndex: 'meta',
      width: 70,
      render: (meta: unknown) =>
        meta ? (
          <Tooltip
            title={<pre style={{ margin: 0, maxWidth: '90vw', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{JSON.stringify(meta, null, 2)}</pre>}
            styles={{ root: { maxWidth: '92vw' } }}
          >
            <Button type="link" size="small">{t('View')}</Button>
          </Tooltip>
        ) : null,
    },
  ]

  return (
    <div className="fade-in p-[clamp(12px,3vw,24px)]">
      <PageHeader
        title={t('Audit log')}
        crumb={
          data ? `${t('{{total}} records', { total: data.total })} · ${t('immutable')}` : t('immutable')
        }
        actions={
          <>
            <Input.Search
              placeholder={t('Filter by path (e.g. /api/domains)')}
              allowClear
              style={{ width: 240 }}
              onSearch={(v) => {
                setPage(1)
                setPathFilter(v.trim())
              }}
            />
            <Button onClick={() => refetch()} loading={isFetching}>
              ↻ {t('Reload')}
            </Button>
          </>
        }
      />
      {isError && (
        <Banner
          tone="err"
          className="mb-3"
          actions={
            <Button size="small" loading={isFetching} onClick={() => refetch()}>
              ↻ {t('Retry')}
            </Button>
          }
        >
          {apiErrorDetail(error) || t('Could not load the audit log')}
        </Banner>
      )}
      <Table
        rowKey="id"
        columns={columns}
        dataSource={data?.items || []}
        loading={isLoading}
        scroll={{ x: 'max-content' }}
        locale={{
          emptyText: (
            <EmptyState
              icon="✎"
              title={t('No audit entries')}
              desc={pathFilter ? t('No entries match the current filter') : t('Mutating requests will appear here')}
            />
          ),
        }}
        pagination={{
          current: page,
          pageSize: 50,
          total: data?.total || 0,
          onChange: setPage,
          showSizeChanger: false,
          showTotal: (total) => t('{{total}} records', { total }),
        }}
      />
    </div>
  )
}
