import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Table, Tag, Button, message, Input, Space, Typography, Modal, Form, Popconfirm, theme, Select } from 'antd'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { SearchOutlined, PlusOutlined, DeleteOutlined, ReloadOutlined, SwapOutlined, AppstoreAddOutlined, TagsOutlined } from '@ant-design/icons'
import { api } from '../services/api'
import type { ColumnsType } from 'antd/es/table'
import type { Key } from 'react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import BulkProgressModal from '../components/BulkProgressModal'
import BulkAddDomainsModal, { CreateZonesDone } from '../components/domains/BulkAddDomainsModal'
import BulkDnsReplaceModal from '../components/domains/BulkDnsReplaceModal'
import PageHeader from '../components/PageHeader'

const { Text } = Typography

interface Zone {
  id: string
  name: string
  status: string
  plan?: string
  ssl?: {
    status: string
    certificate_authority?: string
    mode?: string
  }
  sslMode?: string
  tags?: string[]
}

export default function Domains() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { token } = theme.useToken()
  const [searchParams, setSearchParams] = useSearchParams()
  // Sidebar "Find" hands off its query via ?q=
  const [searchText, setSearchText] = useState(searchParams.get('q') || '')
  const [tagFilter, setTagFilter] = useState<string[]>([])
  const [form] = Form.useForm()

  // Modal & job state live in the URL so F5 / shared links restore the view
  const activeModal = searchParams.get('modal') // 'add' | 'bulk-add' | 'bulk-dns'
  const jobId = searchParams.get('job')
  const selectedRowKeys = searchParams.getAll('zone')

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

  const setSelectedRowKeys = (zoneIds: string[]) => {
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous)
        next.delete('zone')
        zoneIds.forEach((zoneId) => next.append('zone', zoneId))
        return next
      },
      { replace: true },
    )
  }

  const { data: domains = [], isLoading } = useQuery<Zone[]>({
    queryKey: ['domains'],
    queryFn: async () => {
      try {
        const res = await api.get('/domains')
        return res.data
      } catch (error: any) {
        if (error.response?.status === 400 && error.response?.data?.detail?.includes('credentials')) {
          message.warning(t('Please add a Cloudflare account first'))
          navigate('/accounts')
        }
        throw error
      }
    },
  })

  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await api.post('/domains', { name })
      return res.data
    },
    onSuccess: () => {
      message.success(t('Domain added successfully'))
      setParams({ modal: null })
      form.resetFields()
      queryClient.invalidateQueries({ queryKey: ['domains'] })
    },
    onError: (error: any) => {
      message.error(error.response?.data?.detail || t('Could not add domain'))
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (zoneId: string) => {
      await api.delete(`/domains/${zoneId}`)
    },
    onSuccess: () => {
      message.success(t('Domain deleted'))
      queryClient.invalidateQueries({ queryKey: ['domains'] })
    },
    onError: (error: any) => {
      message.error(error.response?.data?.detail || t('Could not delete domain'))
    },
  })

  const bulkMutation = useMutation({
    mutationFn: async (payload: { action: 'purge' | 'delete' }) => {
      const res = await api.post('/domains/bulk', { ...payload, zoneIds: selectedRowKeys })
      return res.data as { jobId: string }
    },
    onSuccess: (data) => {
      setParams({ job: data.jobId, modal: null })
    },
    onError: (error: any) => {
      message.error(error.response?.data?.detail || t('Bulk operation failed'))
    },
  })

  const closeBulkJob = () => {
    // Remove job + selected zones in a single update; two sequential setSearchParams calls are
    // unreliable (react-router ref not updated between calls) and would leave the modal open.
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('job')
        next.delete('zone')
        return next
      },
      { replace: true },
    )
    queryClient.invalidateQueries({ queryKey: ['domains'] })
  }

  const allTags = [...new Set(domains.flatMap((d) => d.tags || []))].sort()

  const filteredDomains = domains.filter(
    (domain) =>
      domain.name.toLowerCase().includes(searchText.toLowerCase()) &&
      (tagFilter.length === 0 || tagFilter.every((t) => (domain.tags || []).includes(t)))
  )

  const activeDomains = domains.filter((d) => d.status === 'active').length
  const pendingDomains = domains.filter((d) => d.status === 'pending').length

  const statusDot = (color: string, label: string) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
      <span style={{ textTransform: 'capitalize' }}>{label}</span>
    </span>
  )

  const columns: ColumnsType<Zone> = [
    {
      title: 'Domain',
      dataIndex: 'name',
      key: 'name',
      render: (text: string) => <span style={{ fontWeight: 500, fontSize: 15 }}>{text}</span>,
    },
    {
      title: 'Plan',
      key: 'plan',
      width: 120,
      filters: [...new Set(domains.map((d) => d.plan).filter((p): p is string => !!p))].sort().map((plan) => ({
        text: plan.charAt(0).toUpperCase() + plan.slice(1),
        value: plan,
      })),
      onFilter: (value, record) => record.plan === value,
      render: (_: unknown, record: Zone) => {
        if (!record.plan) return <span style={{ color: '#8f8f8f' }}>—</span>
        const colors: Record<string, string> = { enterprise: 'gold', business: 'blue', pro: 'purple' }
        return (
          <Tag variant="filled" color={colors[record.plan] || 'default'}>
            {record.plan.charAt(0).toUpperCase() + record.plan.slice(1)}
          </Tag>
        )
      },
    },
    {
      title: t('Status'),
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (status: string) =>
        statusDot(status === 'active' ? '#28a948' : status === 'pending' ? '#ffae00' : '#8f8f8f', status),
    },
    {
      title: 'SSL',
      key: 'ssl',
      width: 130,
      render: (_: unknown, record: Zone) => {
        const sslMode = record.sslMode || record.ssl?.mode
        const sslStatus = record.ssl?.status || 'unknown'
        if (sslMode) {
          return statusDot(sslMode !== 'off' ? '#28a948' : '#8f8f8f', sslMode)
        }
        if (sslStatus !== 'unknown') {
          return statusDot(sslStatus === 'active' ? '#28a948' : '#ffae00', sslStatus)
        }
        return statusDot('#8f8f8f', 'unknown')
      },
    },
    {
      title: 'Tags',
      key: 'tags',
      width: 220,
      render: (_: unknown, record: Zone) => (
        <Space size={4} wrap>
          {(record.tags || []).map((tag) => (
            <Tag
              key={tag}
              variant="filled"
              style={{ cursor: 'pointer' }}
              onClick={(e) => {
                e.stopPropagation()
                setTagFilter([tag])
              }}
            >
              {tag}
            </Tag>
          ))}
        </Space>
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 60,
      render: (_: unknown, record: Zone) => (
        <span onClick={(e) => e.stopPropagation()}>
          <Popconfirm
            title={t('Delete domain')}
            description={t('Are you sure you want to delete {{name}}?', { name: record.name })}
            okText={t('Delete')}
            cancelText={t('Cancel')}
            okButtonProps={{ danger: true, loading: deleteMutation.isPending }}
            onConfirm={() => deleteMutation.mutate(record.id)}
          >
            <Button danger type="text" size="small" icon={<DeleteOutlined />} />
          </Popconfirm>
        </span>
      ),
    },
  ]

  return (
    <div style={{ padding: 'clamp(12px, 3vw, 24px)' }}>
      <PageHeader
        title="Domains"
        description={`${domains.length} domains · ${activeDomains} active · ${pendingDomains} pending`}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input
          size="large"
          prefix={<SearchOutlined style={{ color: '#8f8f8f' }} />}
          placeholder={t('Search domains...')}
          allowClear
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          className="min-w-[200px] flex-1"
        />
        <Select
          mode="multiple"
          allowClear
          size="large"
          placeholder={<><TagsOutlined /> {t('Filter by tag')}</>}
          value={tagFilter}
          onChange={setTagFilter}
          options={allTags.map((t) => ({ value: t, label: t }))}
          className="min-w-[160px]"
        />
        <Button size="large" icon={<AppstoreAddOutlined />} onClick={() => setParams({ modal: 'bulk-add' })}>
          {t('Bulk add')}
        </Button>
        <Button size="large" type="primary" icon={<PlusOutlined />} onClick={() => setParams({ modal: 'add' })}>
          {t('Add domain')}
        </Button>
      </div>

      <Space orientation="vertical" style={{ width: '100%' }} size="large">
          {selectedRowKeys.length > 0 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                flexWrap: 'wrap',
                padding: '10px 14px',
                background: token.colorFillQuaternary,
                borderRadius: 8,
              }}
            >
              <Text strong>{t('{{count}} domain(s) selected', { count: selectedRowKeys.length })}</Text>
              <Popconfirm
                title={t('Bulk purge cache')}
                description={t('Purge all cache for the {{count}} selected domain(s)?', { count: selectedRowKeys.length })}
                okText={t('Purge')}
                cancelText={t('Cancel')}
                onConfirm={() => bulkMutation.mutate({ action: 'purge' })}
              >
                <Button icon={<ReloadOutlined />} loading={bulkMutation.isPending}>
                  {t('Purge cache')}
                </Button>
              </Popconfirm>
              <Button icon={<SwapOutlined />} onClick={() => setParams({ modal: 'bulk-dns' })}>
                {t('Bulk DNS replace')}
              </Button>
              <Popconfirm
                title={t('Bulk delete domains')}
                description={t('Delete the {{count}} selected domain(s) from Cloudflare? This action cannot be undone.', { count: selectedRowKeys.length })}
                okText={t('Delete')}
                cancelText={t('Cancel')}
                okButtonProps={{ danger: true }}
                onConfirm={() => bulkMutation.mutate({ action: 'delete' })}
              >
                <Button danger icon={<DeleteOutlined />} loading={bulkMutation.isPending}>
                  {t('Delete domains')}
                </Button>
              </Popconfirm>
              <Button type="text" onClick={() => setSelectedRowKeys([])}>
                {t('Clear selection')}
              </Button>
            </div>
          )}
          <Table
            loading={isLoading}
            dataSource={filteredDomains}
            rowKey="id"
            columns={columns}
            rowClassName="hover-row"
            onRow={(record) => ({ onClick: () => navigate(`/domains/${record.id}`) })}
            rowSelection={{
              selectedRowKeys,
              preserveSelectedRowKeys: true,
              onChange: (keys: Key[]) => setSelectedRowKeys(keys as string[]),
            }}
            pagination={{
              pageSize: 20,
              showSizeChanger: true,
              showTotal: (total) => t('Total {{total}} domains', { total }),
            }}
            scroll={{ x: 'max-content' }}
          />
        </Space>

      <Modal
        title={t('Add new domain')}
        open={activeModal === 'add'}
        onCancel={() => {
          setParams({ modal: null })
          form.resetFields()
        }}
        onOk={() => form.submit()}
        okText={t('Add')}
        cancelText={t('Cancel')}
        confirmLoading={createMutation.isPending}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={(values) => createMutation.mutate(values.name.trim())}
        >
          <Form.Item
            label={t('Domain name')}
            name="name"
            rules={[
              { required: true, message: t('Please enter a domain name') },
              {
                pattern: /^([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/,
                message: t('Invalid domain name (e.g. example.com)'),
              },
            ]}
          >
            <Input placeholder="example.com" size="large" autoFocus />
          </Form.Item>
        </Form>
      </Modal>

      <BulkProgressModal
        jobId={jobId}
        open={!!jobId}
        onClose={closeBulkJob}
        renderDone={(job) => (job.type === 'create-zones' ? <CreateZonesDone job={job} /> : null)}
      />

      <BulkAddDomainsModal
        open={activeModal === 'bulk-add'}
        onClose={() => setParams({ modal: null })}
        onJobCreated={(id) => setParams({ modal: null, job: id })}
      />

      <BulkDnsReplaceModal
        open={activeModal === 'bulk-dns'}
        onClose={() => setParams({ modal: null })}
        onJobCreated={(id) => setParams({ modal: null, job: id })}
        zoneIds={selectedRowKeys}
        zoneNames={Object.fromEntries(domains.map((d) => [d.id, d.name]))}
      />
    </div>
  )
}
