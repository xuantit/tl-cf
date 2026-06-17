import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Tabs,
  Card,
  Table,
  Button,
  Form,
  Input,
  InputNumber,
  Select,
  Switch,
  message,
  Popconfirm,
  Space,
  Modal,
  Typography,
  Tag,
  Divider,
  Row,
  Col,
} from 'antd'
import { PlusOutlined, ReloadOutlined, ArrowLeftOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import { useState } from 'react'
import { api } from '../services/api'
import type { ColumnsType } from 'antd/es/table'

const { Title, Text } = Typography

interface DnsRecord {
  id: string
  type: string
  name: string
  content: string
  ttl: number
  proxied?: boolean
  priority?: number
}

interface CacheSettings {
  cache_level?: string
  browser_cache_ttl?: number
  tiered_cache_topology?: string
}

interface SslSettings {
  mode: string
}

interface TieredCacheSettings {
  topology: string
}

interface PageRule {
  id: string
  priority: number
  status: string
  targets: Array<{ target: string; constraint: { operator: string; value: string } }>
  actions: Array<{ id: string; value?: unknown }>
}

export default function DomainDetail() {
  const { zoneId } = useParams<{ zoneId: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [dnsForm] = Form.useForm()
  const [cacheForm] = Form.useForm()
  const [dnsModal, setDnsModal] = useState(false)
  const [editingDns, setEditingDns] = useState<DnsRecord | null>(null)

  const { data: zone } = useQuery({
    queryKey: ['domain', zoneId],
    queryFn: async () => {
      const res = await api.get(`/domains/${zoneId}`)
      return res.data
    },
  })

  const { data: dnsRecords = [], isLoading: dnsLoading } = useQuery<DnsRecord[]>({
    queryKey: ['dns', zoneId],
    queryFn: async () => {
      const res = await api.get(`/domains/${zoneId}/dns`)
      return res.data
    },
  })

  const { data: cacheSettings, isLoading: cacheLoading } = useQuery<CacheSettings>({
    queryKey: ['cache', zoneId],
    queryFn: async () => {
      const res = await api.get(`/domains/${zoneId}/cache-config`)
      return res.data
    },
  })

  const { data: sslSettings } = useQuery<SslSettings>({
    queryKey: ['ssl', zoneId],
    queryFn: async () => {
      const res = await api.get(`/domains/${zoneId}/ssl`)
      return res.data
    },
  })

  const { data: tieredCache } = useQuery<TieredCacheSettings>({
    queryKey: ['tiered-cache', zoneId],
    queryFn: async () => {
      const res = await api.get(`/domains/${zoneId}/tiered-cache`)
      return res.data
    },
  })

  const { data: rules = [], isLoading: rulesLoading } = useQuery<PageRule[]>({
    queryKey: ['rules', zoneId],
    queryFn: async () => {
      const res = await api.get(`/domains/${zoneId}/rules`)
      return res.data
    },
  })

  const createDns = useMutation({
    mutationFn: async (data: Partial<DnsRecord>) => {
      const res = await api.post(`/domains/${zoneId}/dns`, data)
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dns', zoneId] })
      setDnsModal(false)
      dnsForm.resetFields()
      setEditingDns(null)
      message.success('DNS record created')
    },
    onError: (e: any) => message.error(e?.response?.data?.detail || 'Failed to create DNS record'),
  })

  const updateDns = useMutation({
    mutationFn: async ({ recordId, data }: { recordId: string; data: Partial<DnsRecord> }) => {
      const res = await api.put(`/domains/${zoneId}/dns/${recordId}`, data)
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dns', zoneId] })
      setDnsModal(false)
      dnsForm.resetFields()
      setEditingDns(null)
      message.success('DNS record updated')
    },
    onError: (e: any) => message.error(e?.response?.data?.detail || 'Failed to update DNS record'),
  })

  const deleteDns = useMutation({
    mutationFn: async (recordId: string) => {
      await api.delete(`/domains/${zoneId}/dns/${recordId}`)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dns', zoneId] })
      message.success('DNS record deleted')
    },
    onError: (e: any) => message.error(e?.response?.data?.detail || 'Failed to delete DNS record'),
  })

  const updateCache = useMutation({
    mutationFn: async (data: CacheSettings) => {
      const res = await api.put(`/domains/${zoneId}/cache-config`, data)
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cache', zoneId] })
      qc.invalidateQueries({ queryKey: ['tiered-cache', zoneId] })
      message.success('Cache settings updated')
    },
    onError: (e: any) => message.error(e?.response?.data?.detail || 'Failed to update cache settings'),
  })

  const updateSsl = useMutation({
    mutationFn: async (data: { mode: string }) => {
      const res = await api.patch(`/domains/${zoneId}/ssl`, data)
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ssl', zoneId] })
      qc.invalidateQueries({ queryKey: ['domain', zoneId] })
      message.success('SSL settings updated')
    },
    onError: (e: any) => message.error(e?.response?.data?.detail || 'Failed to update SSL settings'),
  })

  const updateTieredCache = useMutation({
    mutationFn: async (data: { topology: string }) => {
      const res = await api.patch(`/domains/${zoneId}/tiered-cache`, data)
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tiered-cache', zoneId] })
      message.success('Tiered cache topology updated')
    },
    onError: (e: any) => message.error(e?.response?.data?.detail || 'Failed to update tiered cache topology'),
  })

  const purgeCache = useMutation({
    mutationFn: async () => {
      await api.post(`/domains/${zoneId}/cache-config/purge`)
    },
    onSuccess: () => {
      message.success('Cache purged successfully')
    },
    onError: (e: any) => message.error(e?.response?.data?.detail || 'Failed to purge cache'),
  })

  const updateRule = useMutation({
    mutationFn: async ({ ruleId, data }: { ruleId: string; data: Partial<PageRule> }) => {
      const res = await api.put(`/domains/${zoneId}/rules/${ruleId}`, data)
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rules', zoneId] })
      message.success('Rule updated')
    },
    onError: (e: any) => message.error(e?.response?.data?.detail || 'Failed to update rule'),
  })

  const dnsColumns: ColumnsType<DnsRecord> = [
    { title: 'Type', dataIndex: 'type', key: 'type', width: 100 },
    { title: 'Name', dataIndex: 'name', key: 'name' },
    { title: 'Content', dataIndex: 'content', key: 'content' },
    { title: 'TTL', dataIndex: 'ttl', key: 'ttl', width: 100 },
    {
      title: 'Proxied',
      dataIndex: 'proxied',
      key: 'proxied',
      width: 100,
      render: (proxied: boolean) => (
        <Tag color={proxied ? 'blue' : 'default'}>{proxied ? 'Yes' : 'No'}</Tag>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 150,
      render: (_: unknown, record: DnsRecord) => (
        <Space>
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => {
              setEditingDns(record)
              dnsForm.setFieldsValue(record)
              setDnsModal(true)
            }}
          >
            Edit
          </Button>
          <Popconfirm
            title="Delete this DNS record?"
            onConfirm={() => deleteDns.mutate(record.id)}
            okText="Yes"
            cancelText="No"
          >
            <Button size="small" danger icon={<DeleteOutlined />}>
              Delete
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const rulesColumns: ColumnsType<PageRule> = [
    { title: 'Priority', dataIndex: 'priority', key: 'priority', width: 100 },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 150,
      render: (status: string, record: PageRule) => (
        <Select
          value={status}
          style={{ width: 120 }}
          onChange={(newStatus) => updateRule.mutate({ ruleId: record.id, data: { status: newStatus } })}
          options={[
            { value: 'active', label: 'Active' },
            { value: 'disabled', label: 'Disabled' },
          ]}
        />
      ),
    },
    {
      title: 'Target',
      key: 'target',
      render: (_: unknown, record: PageRule) =>
        record.targets.map((t) => `${t.constraint.operator} ${t.constraint.value}`).join(', '),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: unknown, record: PageRule) =>
        record.actions.map((a) => `${a.id}${a.value ? `: ${JSON.stringify(a.value)}` : ''}`).join(', '),
    },
  ]

  return (
    <div style={{ padding: '24px' }}>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div>
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/domains')}
            style={{ marginBottom: 16 }}
          >
            Back to Domains
          </Button>
          <div className="page-header">
            <Title level={2} style={{ marginBottom: 8 }}>
              {zone?.name || 'Domain Details'}
            </Title>
            {zone && (
              <Space>
                <Tag color={zone.status === 'active' ? 'success' : 'warning'}>
                  {zone.status}
                </Tag>
                {(() => {
                  // Display SSL mode from settings if available, otherwise show zone SSL status
                  const sslDisplay = sslSettings?.mode 
                    ? sslSettings.mode.charAt(0).toUpperCase() + sslSettings.mode.slice(1)
                    : (zone.ssl?.status || 'unknown')
                  const sslColor = sslSettings?.mode 
                    ? (sslSettings.mode !== 'off' ? 'success' : 'default')
                    : (zone.ssl?.status === 'active' ? 'success' : 'default')
                  return (
                    <Tag color={sslColor}>
                      SSL: {sslDisplay}
                    </Tag>
                  )
                })()}
              </Space>
            )}
          </div>
        </div>

        {/* General Settings Section */}
        <Card title="General Settings">
          <Row gutter={[24, 24]}>
            {/* Column 1: SSL/TLS */}
            <Col xs={24} md={12} lg={8}>
              <div style={{ height: '100%', padding: '16px', background: '#fafafa', borderRadius: '8px' }}>
                <Text strong style={{ display: 'block', marginBottom: 8, fontSize: 14 }}>
                  SSL/TLS Encryption Mode
                </Text>
                <Text type="secondary" style={{ display: 'block', marginBottom: 16, fontSize: 12 }}>
                  Determine how Cloudflare connects to your origin server.
                </Text>
                <Select
                  value={sslSettings?.mode}
                  style={{ width: '100%' }}
                  size="large"
                  onChange={(value) => updateSsl.mutate({ mode: value })}
                  loading={updateSsl.isPending}
                  options={[
                    { value: 'off', label: 'Off' },
                    { value: 'flexible', label: 'Flexible' },
                    { value: 'full', label: 'Full' },
                    { value: 'strict', label: 'Strict' },
                  ]}
                />
              </div>
            </Col>

            {/* Column 2: Caching Level */}
            <Col xs={24} md={12} lg={8}>
              <div style={{ height: '100%', padding: '16px', background: '#fafafa', borderRadius: '8px' }}>
                <Text strong style={{ display: 'block', marginBottom: 8, fontSize: 14 }}>
                  Caching Level
                </Text>
                <Text type="secondary" style={{ display: 'block', marginBottom: 16, fontSize: 12 }}>
                  Determine how much of your website's static content you want Cloudflare to cache. Increased caching can speed up page load time.
                </Text>
                <Select
                  value={cacheSettings?.cache_level}
                  style={{ width: '100%' }}
                  size="large"
                  onChange={(value) => updateCache.mutate({ cache_level: value })}
                  loading={updateCache.isPending}
                  options={[
                    { value: 'aggressive', label: 'Standard' },
                    { value: 'basic', label: 'Ignore query string' },
                    { value: 'simplified', label: 'No query string' },
                  ]}
                />
              </div>
            </Col>

            {/* Column 3: Browser Cache TTL */}
            <Col xs={24} md={12} lg={8}>
              <div style={{ height: '100%', padding: '16px', background: '#fafafa', borderRadius: '8px' }}>
                <Text strong style={{ display: 'block', marginBottom: 8, fontSize: 14 }}>
                  Browser Cache TTL
                </Text>
                <Text type="secondary" style={{ display: 'block', marginBottom: 16, fontSize: 12 }}>
                  Determine the length of time Cloudflare instructs a visitor's browser to cache files. During this period, the browser loads the files from its local cache, speeding up page loads.
                </Text>
                <Select
                  value={cacheSettings?.browser_cache_ttl}
                  style={{ width: '100%' }}
                  size="large"
                  onChange={(value) => updateCache.mutate({ browser_cache_ttl: value })}
                  loading={updateCache.isPending}
                  options={[
                    { value: 0, label: 'Respect Existing Headers' },
                    { value: 1800, label: '30 minutes' },
                    { value: 3600, label: '1 hour' },
                    { value: 7200, label: '2 hours' },
                    { value: 14400, label: '4 hours' },
                    { value: 28800, label: '8 hours' },
                    { value: 43200, label: '12 hours' },
                    { value: 86400, label: '1 day' },
                    { value: 172800, label: '2 days' },
                    { value: 259200, label: '3 days' },
                    { value: 604800, label: '1 week' },
                    { value: 1209600, label: '2 weeks' },
                    { value: 2592000, label: '1 month' },
                    { value: 5184000, label: '2 months' },
                    { value: 15552000, label: '6 months' },
                    { value: 31536000, label: '1 year' },
                  ]}
                />
              </div>
            </Col>

            {/* Column 4: Tiered Cache Topology */}
            <Col xs={24} md={12} lg={8}>
              <div style={{ height: '100%', padding: '16px', background: '#fafafa', borderRadius: '8px' }}>
                <Text strong style={{ display: 'block', marginBottom: 8, fontSize: 14 }}>
                  Tiered Cache Topology
                </Text>
                <Text type="secondary" style={{ display: 'block', marginBottom: 16, fontSize: 12 }}>
                  Configure how Cloudflare's tiered cache distributes content across its network.
                </Text>
                <Select
                  value={tieredCache?.topology}
                  style={{ width: '100%' }}
                  size="large"
                  onChange={(value) => updateTieredCache.mutate({ topology: value })}
                  loading={updateTieredCache.isPending}
                  options={[
                    { value: 'smart', label: 'Smart' },
                    { value: 'generic', label: 'Generic' },
                  ]}
                />
              </div>
            </Col>
          </Row>
        </Card>

        <Tabs
          defaultActiveKey="dns"
          items={[
            {
              key: 'dns',
              label: 'DNS Records',
              children: (
                <Card
                  title="DNS Records"
                  extra={
                    <Button
                      type="primary"
                      icon={<PlusOutlined />}
                      onClick={() => {
                        setEditingDns(null)
                        dnsForm.resetFields()
                        setDnsModal(true)
                      }}
                    >
                      Add Record
                    </Button>
                  }
                >
                  <Table
                    loading={dnsLoading}
                    dataSource={dnsRecords}
                    rowKey="id"
                    columns={dnsColumns}
                    pagination={{ pageSize: 20 }}
                  />
                </Card>
              ),
            },
            {
              key: 'cache',
              label: 'Cache Configuration',
              children: (
                <Card title="Cache Settings">
                  <Form
                    form={cacheForm}
                    layout="vertical"
                    initialValues={cacheSettings}
                    onFinish={(values) => updateCache.mutate(values)}
                    style={{ maxWidth: 600 }}
                  >
                    <Form.Item name="cache_level" label="Cache Level">
                      <Select
                        size="large"
                        options={[
                          { value: 'aggressive', label: 'Aggressive' },
                          { value: 'basic', label: 'Basic' },
                          { value: 'simplified', label: 'Simplified' },
                        ]}
                      />
                    </Form.Item>
                    <Form.Item name="browser_cache_ttl" label="Browser Cache TTL (seconds)">
                      <InputNumber min={0} style={{ width: '100%' }} size="large" />
                    </Form.Item>
                    <Divider />
                    <Form.Item>
                      <Space>
                        <Button type="primary" htmlType="submit" loading={updateCache.isPending} size="large">
                          Update Settings
                        </Button>
                        <Button
                          icon={<ReloadOutlined />}
                          onClick={() => purgeCache.mutate()}
                          loading={purgeCache.isPending}
                          size="large"
                        >
                          Purge Cache
                        </Button>
                      </Space>
                    </Form.Item>
                  </Form>
                </Card>
              ),
            },
            {
              key: 'rules',
              label: 'Page Rules',
              children: (
                <Card title="Page Rules">
                  <Table
                    loading={rulesLoading}
                    dataSource={rules}
                    rowKey="id"
                    columns={rulesColumns}
                    pagination={{ pageSize: 20 }}
                  />
                </Card>
              ),
            },
          ]}
        />
      </Space>

      {/* DNS Record Modal */}
      <Modal
        title={editingDns ? 'Edit DNS Record' : 'Add DNS Record'}
        open={dnsModal}
        onCancel={() => {
          setDnsModal(false)
          dnsForm.resetFields()
          setEditingDns(null)
        }}
        footer={null}
        width={600}
      >
        <Form
          form={dnsForm}
          layout="vertical"
          onFinish={(values) => {
            if (editingDns) {
              updateDns.mutate({ recordId: editingDns.id, data: values })
            } else {
              createDns.mutate(values)
            }
          }}
        >
          <Form.Item name="type" label="Type" rules={[{ required: true }]}>
            <Select
              size="large"
              options={[
                { value: 'A', label: 'A' },
                { value: 'AAAA', label: 'AAAA' },
                { value: 'CNAME', label: 'CNAME' },
                { value: 'MX', label: 'MX' },
                { value: 'TXT', label: 'TXT' },
                { value: 'NS', label: 'NS' },
              ]}
            />
          </Form.Item>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input size="large" placeholder="example.com or @ for root" />
          </Form.Item>
          <Form.Item name="content" label="Content" rules={[{ required: true }]}>
            <Input size="large" />
          </Form.Item>
          <Form.Item name="ttl" label="TTL" initialValue={3600}>
            <InputNumber min={120} style={{ width: '100%' }} size="large" />
          </Form.Item>
          <Form.Item name="proxied" valuePropName="checked">
            <Switch checkedChildren="Proxied" unCheckedChildren="DNS Only" />
          </Form.Item>
          <Form.Item name="priority" label="Priority (for MX records)">
            <InputNumber min={0} style={{ width: '100%' }} size="large" />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button
                type="primary"
                htmlType="submit"
                loading={createDns.isPending || updateDns.isPending}
                size="large"
              >
                {editingDns ? 'Update' : 'Create'}
              </Button>
              <Button onClick={() => setDnsModal(false)} size="large">
                Cancel
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
