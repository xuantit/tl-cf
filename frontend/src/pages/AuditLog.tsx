import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Card, Table, Tag, Typography, Button, Space, Input, Tooltip } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { useTranslation } from 'react-i18next'
import { api } from '../services/api'

const { Title, Text } = Typography

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

const METHOD_COLORS: Record<string, string> = {
  POST: 'green',
  PUT: 'blue',
  PATCH: 'blue',
  DELETE: 'red',
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

  const { data, isLoading, refetch, isFetching } = useQuery<AuditResponse>({
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
      width: 165,
      render: (v: string) => new Date(v).toLocaleString(dateLocale),
    },
    {
      title: t('User'),
      dataIndex: 'email',
      width: 200,
      ellipsis: true,
      render: (email: string | null) => email || <Text type="secondary">—</Text>,
    },
    {
      title: t('Action'),
      key: 'action',
      render: (_, r) => {
        const label = actionLabel(r.path)
        return (
          <Space orientation="vertical" size={0}>
            {label && <Text>{t(label)}</Text>}
            <Text type="secondary" style={{ fontSize: 12, fontFamily: 'monospace' }}>
              <Tag color={METHOD_COLORS[r.method] || 'default'} variant="filled" style={{ marginRight: 4 }}>
                {r.method}
              </Tag>
              {r.path}
            </Text>
          </Space>
        )
      },
    },
    {
      title: t('Result'),
      dataIndex: 'status',
      width: 100,
      render: (status: number) => (
        <Tag color={status < 400 ? 'success' : status < 500 ? 'warning' : 'error'} variant="filled">{status}</Tag>
      ),
    },
    {
      title: t('Details'),
      dataIndex: 'meta',
      width: 90,
      render: (meta: unknown) =>
        meta ? (
          <Tooltip
            title={<pre style={{ margin: 0, maxWidth: '90vw', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{JSON.stringify(meta, null, 2)}</pre>}
            styles={{ root: { maxWidth: '92vw' } }}
          >
            <Button type="link" size="small">{t('View')}</Button>
          </Tooltip>
        ) : (
          <Text type="secondary">—</Text>
        ),
    },
    {
      title: 'IP',
      dataIndex: 'ip',
      width: 120,
      ellipsis: true,
      render: (ip: string | null) => ip || <Text type="secondary">—</Text>,
    },
  ]

  return (
    <div style={{ padding: 'clamp(12px, 3vw, 24px)' }}>
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <Title level={2} style={{ fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 4 }}>
            {t('Audit trail')}
          </Title>
          <Text type="secondary">
            {t('Records every data-changing action (login, create/update/delete). Sensitive fields are masked.')}
          </Text>
        </div>
        <Space>
          <Input.Search
            placeholder={t('Filter by path (e.g. /api/domains)')}
            allowClear
            style={{ width: '100%', maxWidth: 280 }}
            onSearch={(v) => {
              setPage(1)
              setPathFilter(v.trim())
            }}
          />
          <Button icon={<ReloadOutlined />} onClick={() => refetch()} loading={isFetching}>
            {t('Reload')}
          </Button>
        </Space>
      </div>
      <Card>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={data?.items || []}
          loading={isLoading}
          scroll={{ x: 'max-content' }}
          pagination={{
            current: page,
            pageSize: 50,
            total: data?.total || 0,
            onChange: setPage,
            showSizeChanger: false,
            showTotal: (total) => t('{{total}} records', { total }),
          }}
        />
      </Card>
    </div>
  )
}
