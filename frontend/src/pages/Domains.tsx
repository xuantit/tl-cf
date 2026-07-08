import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Table, Tag, Button, message, Card, Input, Space, Typography, Row, Col, Statistic, Modal, Form, Popconfirm, theme, Select } from 'antd'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { GlobalOutlined, SearchOutlined, SettingOutlined, CheckCircleOutlined, ClockCircleOutlined, PlusOutlined, DeleteOutlined, ReloadOutlined, SwapOutlined, AppstoreAddOutlined, TagsOutlined, EditOutlined, CheckOutlined, CloseOutlined } from '@ant-design/icons'
import { api } from '../services/api'
import type { ColumnsType } from 'antd/es/table'
import type { Key } from 'react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import BulkProgressModal from '../components/BulkProgressModal'
import BulkAddDomainsModal, { CreateZonesDone } from '../components/domains/BulkAddDomainsModal'
import BulkDnsReplaceModal from '../components/domains/BulkDnsReplaceModal'

const { Title, Text } = Typography
const { Search } = Input

interface Zone {
  id: string
  name: string
  status: string
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
  const [searchText, setSearchText] = useState('')
  const [tagFilter, setTagFilter] = useState<string[]>([])
  const [editingTagsZoneId, setEditingTagsZoneId] = useState<string | null>(null)
  const [tagsDraft, setTagsDraft] = useState<string[]>([])
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([])
  const [form] = Form.useForm()

  // Modal & job state live in the URL so F5 / shared links restore the view
  const activeModal = searchParams.get('modal') // 'add' | 'bulk-add' | 'bulk-dns'
  const jobId = searchParams.get('job')

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
    setParams({ job: null })
    setSelectedRowKeys([])
    queryClient.invalidateQueries({ queryKey: ['domains'] })
  }

  const tagsMutation = useMutation({
    mutationFn: async ({ zoneId, tags }: { zoneId: string; tags: string[] }) => {
      await api.put(`/domains/${zoneId}/tags`, { tags })
    },
    onSuccess: () => {
      setEditingTagsZoneId(null)
      queryClient.invalidateQueries({ queryKey: ['domains'] })
    },
    onError: (error: any) => {
      message.error(error.response?.data?.detail || t('Could not save tags'))
    },
  })

  const allTags = [...new Set(domains.flatMap((d) => d.tags || []))].sort()

  const filteredDomains = domains.filter(
    (domain) =>
      domain.name.toLowerCase().includes(searchText.toLowerCase()) &&
      (tagFilter.length === 0 || tagFilter.every((t) => (domain.tags || []).includes(t)))
  )

  const activeDomains = domains.filter((d) => d.status === 'active').length
  const pendingDomains = domains.filter((d) => d.status === 'pending').length

  const columns: ColumnsType<Zone> = [
    {
      title: 'Domain',
      dataIndex: 'name',
      key: 'name',
      render: (text: string) => (
        <span style={{ fontWeight: 500, fontSize: 15 }}>{text}</span>
      ),
    },
    {
      title: t('Status'),
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status: string) => {
        const color = status === 'active' ? 'success' : status === 'pending' ? 'warning' : 'default'
        const icon = status === 'active' ? <CheckCircleOutlined /> : <ClockCircleOutlined />
        return (
          <Tag color={color} icon={icon} bordered={false}>
            {status.toUpperCase()}
          </Tag>
        )
      },
    },
    {
      title: t('SSL Status'),
      key: 'ssl',
      width: 120,
      render: (_: unknown, record: Zone) => {
        // Use SSL mode if available, otherwise use SSL status
        const sslMode = record.sslMode || record.ssl?.mode
        const sslStatus = record.ssl?.status || 'unknown'

        // If we have SSL mode, determine status from mode
        let displayStatus: string
        let color: string

        if (sslMode) {
          displayStatus = sslMode !== 'off' ? sslMode.charAt(0).toUpperCase() + sslMode.slice(1) : 'Off'
          color = sslMode !== 'off' ? 'success' : 'default'
        } else if (sslStatus && sslStatus !== 'unknown') {
          displayStatus = sslStatus.toUpperCase()
          color = sslStatus === 'active' ? 'success' : sslStatus === 'pending' ? 'warning' : 'default'
        } else {
          displayStatus = 'UNKNOWN'
          color = 'default'
        }

        return <Tag color={color} bordered={false}>{displayStatus}</Tag>
      },
    },
    {
      title: 'Tags',
      key: 'tags',
      width: 240,
      render: (_: unknown, record: Zone) => {
        if (editingTagsZoneId === record.id) {
          return (
            <Space.Compact style={{ width: '100%' }}>
              <Select
                mode="tags"
                size="small"
                autoFocus
                style={{ flex: 1, minWidth: 140 }}
                value={tagsDraft}
                onChange={setTagsDraft}
                options={allTags.map((t) => ({ value: t, label: t }))}
                placeholder={t('Enter tag…')}
                tokenSeparators={[',']}
              />
              <Button
                size="small"
                type="primary"
                icon={<CheckOutlined />}
                loading={tagsMutation.isPending}
                onClick={() => tagsMutation.mutate({ zoneId: record.id, tags: tagsDraft })}
              />
              <Button size="small" icon={<CloseOutlined />} onClick={() => setEditingTagsZoneId(null)} />
            </Space.Compact>
          )
        }
        return (
          <Space size={4} wrap>
            {(record.tags || []).map((t) => (
              <Tag key={t} color="geekblue" style={{ cursor: 'pointer' }} onClick={() => setTagFilter([t])}>
                {t}
              </Tag>
            ))}
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              onClick={() => {
                setEditingTagsZoneId(record.id)
                setTagsDraft(record.tags || [])
              }}
            />
          </Space>
        )
      },
    },
    {
      title: t('Actions'),
      key: 'actions',
      width: 220,
      render: (_: unknown, record: Zone) => (
        <Space>
          <Button
            type="primary"
            icon={<SettingOutlined />}
            onClick={() => navigate(`/domains/${record.id}`)}
          >
            {t('Manage')}
          </Button>
          <Popconfirm
            title={t('Delete domain')}
            description={t('Are you sure you want to delete {{name}}?', { name: record.name })}
            okText={t('Delete')}
            cancelText={t('Cancel')}
            okButtonProps={{ danger: true, loading: deleteMutation.isPending }}
            onConfirm={() => deleteMutation.mutate(record.id)}
          >
            <Button danger icon={<DeleteOutlined />}>
              {t('Delete')}
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div style={{ padding: '24px' }}>
      <div className="page-header">
        <Title level={2} style={{ fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 4 }}>
          Domains
        </Title>
        <Text type="secondary">{t('Manage your Cloudflare domains and DNS records')}</Text>
      </div>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={8}>
          <Card>
            <Statistic
              title={t('Total Domains')}
              value={domains.length}
              prefix={<GlobalOutlined />}
              valueStyle={{ color: token.colorPrimary }}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic
              title={t('Active')}
              value={activeDomains}
              prefix={<CheckCircleOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic
              title={t('Pending')}
              value={pendingDomains}
              prefix={<ClockCircleOutlined />}
              valueStyle={{ color: '#faad14' }}
            />
          </Card>
        </Col>
      </Row>

      <Card>
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
            <Space wrap>
              <Search
                placeholder={t('Search domains...')}
                allowClear
                enterButton={<SearchOutlined />}
                size="large"
                onSearch={setSearchText}
                onChange={(e) => setSearchText(e.target.value)}
                style={{ width: 320 }}
              />
              <Select
                mode="multiple"
                allowClear
                size="large"
                placeholder={<><TagsOutlined /> {t('Filter by tag')}</>}
                value={tagFilter}
                onChange={setTagFilter}
                options={allTags.map((t) => ({ value: t, label: t }))}
                style={{ minWidth: 200 }}
              />
            </Space>
            <Space>
              <Button
                size="large"
                icon={<AppstoreAddOutlined />}
                onClick={() => setParams({ modal: 'bulk-add' })}
              >
                {t('Bulk add')}
              </Button>
              <Button
                type="primary"
                size="large"
                icon={<PlusOutlined />}
                onClick={() => setParams({ modal: 'add' })}
              >
                {t('Add domain')}
              </Button>
            </Space>
          </Space>
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
          />
        </Space>
      </Card>

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
