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
  theme,
} from 'antd'
import { PlusOutlined, ReloadOutlined, ArrowLeftOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
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

interface SecuritySettings {
  always_use_https: string
  automatic_https_rewrites: string
  security_level: string
  development_mode: string
  development_mode_time_remaining?: number
}

interface PageRule {
  id: string
  priority: number
  status: string
  targets: Array<{ target: string; constraint: { operator: string; value: string } }>
  actions: Array<{ id: string; value?: unknown }>
}

export default function DomainDetail() {
  const { t } = useTranslation()
  const { zoneId } = useParams<{ zoneId: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { token } = theme.useToken()
  const [dnsForm] = Form.useForm()
  const [cacheForm] = Form.useForm()
  const [dnsModal, setDnsModal] = useState(false)
  const [editingDns, setEditingDns] = useState<DnsRecord | null>(null)
  const [purgeUrlsText, setPurgeUrlsText] = useState('')

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

  const { data: cacheSettings } = useQuery<CacheSettings>({
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

  const { data: security, isLoading: securityLoading } = useQuery<SecuritySettings>({
    queryKey: ['security', zoneId],
    queryFn: async () => {
      const res = await api.get(`/domains/${zoneId}/security`)
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
      message.success(t('DNS record created'))
    },
    onError: (e: any) => message.error(e?.response?.data?.detail || t('Failed to create DNS record')),
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
      message.success(t('DNS record updated'))
    },
    onError: (e: any) => message.error(e?.response?.data?.detail || t('Failed to update DNS record')),
  })

  const deleteDns = useMutation({
    mutationFn: async (recordId: string) => {
      await api.delete(`/domains/${zoneId}/dns/${recordId}`)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dns', zoneId] })
      message.success(t('DNS record deleted'))
    },
    onError: (e: any) => message.error(e?.response?.data?.detail || t('Failed to delete DNS record')),
  })

  const updateCache = useMutation({
    mutationFn: async (data: CacheSettings) => {
      const res = await api.put(`/domains/${zoneId}/cache-config`, data)
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cache', zoneId] })
      qc.invalidateQueries({ queryKey: ['tiered-cache', zoneId] })
      message.success(t('Cache settings updated'))
    },
    onError: (e: any) => message.error(e?.response?.data?.detail || t('Failed to update cache settings')),
  })

  const updateSsl = useMutation({
    mutationFn: async (data: { mode: string }) => {
      const res = await api.patch(`/domains/${zoneId}/ssl`, data)
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ssl', zoneId] })
      qc.invalidateQueries({ queryKey: ['domain', zoneId] })
      message.success(t('SSL settings updated'))
    },
    onError: (e: any) => message.error(e?.response?.data?.detail || t('Failed to update SSL settings')),
  })

  const updateTieredCache = useMutation({
    mutationFn: async (data: { topology: string }) => {
      const res = await api.patch(`/domains/${zoneId}/tiered-cache`, data)
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tiered-cache', zoneId] })
      message.success(t('Tiered cache topology updated'))
    },
    onError: (e: any) => message.error(e?.response?.data?.detail || t('Failed to update tiered cache topology')),
  })

  const purgeCache = useMutation({
    mutationFn: async (files?: string[]) => {
      await api.post(`/domains/${zoneId}/cache-config/purge`, files && files.length ? { files } : {})
    },
    onSuccess: () => {
      message.success(t('Cache purged successfully'))
    },
    onError: (e: any) => message.error(e?.response?.data?.detail || t('Failed to purge cache')),
  })

  const updateSecurity = useMutation({
    mutationFn: async (data: Partial<Omit<SecuritySettings, 'development_mode_time_remaining'>>) => {
      const res = await api.patch(`/domains/${zoneId}/security`, data)
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['security', zoneId] })
      message.success(t('Settings updated'))
    },
    onError: (e: any) => message.error(e?.response?.data?.detail || t('Failed to update settings')),
  })

  const updateRule = useMutation({
    mutationFn: async ({ ruleId, data }: { ruleId: string; data: Partial<PageRule> }) => {
      const res = await api.put(`/domains/${zoneId}/rules/${ruleId}`, data)
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rules', zoneId] })
      message.success(t('Rule updated'))
    },
    onError: (e: any) => message.error(e?.response?.data?.detail || t('Failed to update rule')),
  })

  const dnsColumns: ColumnsType<DnsRecord> = [
    { title: t('Type'), dataIndex: 'type', key: 'type', width: 100 },
    { title: t('Name'), dataIndex: 'name', key: 'name' },
    { title: t('Content'), dataIndex: 'content', key: 'content' },
    { title: 'TTL', dataIndex: 'ttl', key: 'ttl', width: 100 },
    {
      title: 'Proxied',
      dataIndex: 'proxied',
      key: 'proxied',
      width: 100,
      render: (proxied: boolean) => (
        <Tag color={proxied ? 'blue' : 'default'} bordered={false}>{proxied ? t('Yes') : t('No')}</Tag>
      ),
    },
    {
      title: t('Actions'),
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
            {t('Edit')}
          </Button>
          <Popconfirm
            title={t('Delete this DNS record?')}
            onConfirm={() => deleteDns.mutate(record.id)}
            okText={t('Yes')}
            cancelText={t('No')}
          >
            <Button size="small" danger icon={<DeleteOutlined />}>
              {t('Delete')}
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const rulesColumns: ColumnsType<PageRule> = [
    { title: t('Priority'), dataIndex: 'priority', key: 'priority', width: 100 },
    {
      title: t('Status'),
      dataIndex: 'status',
      key: 'status',
      width: 150,
      render: (status: string, record: PageRule) => (
        <Select
          value={status}
          style={{ width: 120 }}
          onChange={(newStatus) => updateRule.mutate({ ruleId: record.id, data: { status: newStatus } })}
          options={[
            { value: 'active', label: t('Active') },
            { value: 'disabled', label: t('Disabled') },
          ]}
        />
      ),
    },
    {
      title: t('Target'),
      key: 'target',
      render: (_: unknown, record: PageRule) =>
        record.targets.map((tg) => `${tg.constraint.operator} ${tg.constraint.value}`).join(', '),
    },
    {
      title: t('Actions'),
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
            {t('Back to Domains')}
          </Button>
          <div className="page-header">
            <Title level={2} style={{ fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 4 }}>
              {zone?.name || t('Domain Details')}
            </Title>
            {zone && (
              <Space>
                <Tag color={zone.status === 'active' ? 'success' : 'warning'} bordered={false}>
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
                    <Tag color={sslColor} bordered={false}>
                      SSL: {sslDisplay}
                    </Tag>
                  )
                })()}
              </Space>
            )}
          </div>
        </div>

        {/* General Settings Section */}
        <Card title={t('General Settings')}>
          <Row gutter={[24, 24]}>
            {/* Column 1: SSL/TLS */}
            <Col xs={24} md={12} lg={8}>
              <div style={{ height: '100%', padding: '16px', background: 'transparent', border: `1px solid ${token.colorBorderSecondary}`, borderRadius: 10 }}>
                <Text strong style={{ display: 'block', marginBottom: 8, fontSize: 14 }}>
                  {t('SSL/TLS Encryption Mode')}
                </Text>
                <Text type="secondary" style={{ display: 'block', marginBottom: 16, fontSize: 12 }}>
                  {t('Determine how Cloudflare connects to your origin server.')}
                </Text>
                <Select
                  value={sslSettings?.mode}
                  style={{ width: '100%' }}
                  size="large"
                  onChange={(value) => updateSsl.mutate({ mode: value })}
                  loading={updateSsl.isPending}
                  options={[
                    { value: 'off', label: t('Off') },
                    { value: 'flexible', label: 'Flexible' },
                    { value: 'full', label: 'Full' },
                    { value: 'strict', label: 'Strict' },
                  ]}
                />
              </div>
            </Col>

            {/* Column 2: Caching Level */}
            <Col xs={24} md={12} lg={8}>
              <div style={{ height: '100%', padding: '16px', background: 'transparent', border: `1px solid ${token.colorBorderSecondary}`, borderRadius: 10 }}>
                <Text strong style={{ display: 'block', marginBottom: 8, fontSize: 14 }}>
                  {t('Caching Level')}
                </Text>
                <Text type="secondary" style={{ display: 'block', marginBottom: 16, fontSize: 12 }}>
                  {t("Determine how much of your website's static content you want Cloudflare to cache. Increased caching can speed up page load time.")}
                </Text>
                <Select
                  value={cacheSettings?.cache_level}
                  style={{ width: '100%' }}
                  size="large"
                  onChange={(value) => updateCache.mutate({ cache_level: value })}
                  loading={updateCache.isPending}
                  options={[
                    { value: 'aggressive', label: t('Standard') },
                    { value: 'basic', label: t('Ignore query string') },
                    { value: 'simplified', label: t('No query string') },
                  ]}
                />
              </div>
            </Col>

            {/* Column 3: Browser Cache TTL */}
            <Col xs={24} md={12} lg={8}>
              <div style={{ height: '100%', padding: '16px', background: 'transparent', border: `1px solid ${token.colorBorderSecondary}`, borderRadius: 10 }}>
                <Text strong style={{ display: 'block', marginBottom: 8, fontSize: 14 }}>
                  {t('Browser Cache TTL')}
                </Text>
                <Text type="secondary" style={{ display: 'block', marginBottom: 16, fontSize: 12 }}>
                  {t("Determine the length of time Cloudflare instructs a visitor's browser to cache files. During this period, the browser loads the files from its local cache, speeding up page loads.")}
                </Text>
                <Select
                  value={cacheSettings?.browser_cache_ttl}
                  style={{ width: '100%' }}
                  size="large"
                  onChange={(value) => updateCache.mutate({ browser_cache_ttl: value })}
                  loading={updateCache.isPending}
                  options={[
                    { value: 0, label: t('Respect Existing Headers') },
                    { value: 1800, label: t('30 minutes') },
                    { value: 3600, label: t('1 hour') },
                    { value: 7200, label: t('2 hours') },
                    { value: 14400, label: t('4 hours') },
                    { value: 28800, label: t('8 hours') },
                    { value: 43200, label: t('12 hours') },
                    { value: 86400, label: t('1 day') },
                    { value: 172800, label: t('2 days') },
                    { value: 259200, label: t('3 days') },
                    { value: 604800, label: t('1 week') },
                    { value: 1209600, label: t('2 weeks') },
                    { value: 2592000, label: t('1 month') },
                    { value: 5184000, label: t('2 months') },
                    { value: 15552000, label: t('6 months') },
                    { value: 31536000, label: t('1 year') },
                  ]}
                />
              </div>
            </Col>

            {/* Column 4: Tiered Cache Topology */}
            <Col xs={24} md={12} lg={8}>
              <div style={{ height: '100%', padding: '16px', background: 'transparent', border: `1px solid ${token.colorBorderSecondary}`, borderRadius: 10 }}>
                <Text strong style={{ display: 'block', marginBottom: 8, fontSize: 14 }}>
                  {t('Tiered Cache Topology')}
                </Text>
                <Text type="secondary" style={{ display: 'block', marginBottom: 16, fontSize: 12 }}>
                  {t("Configure how Cloudflare's tiered cache distributes content across its network.")}
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
              label: t('DNS Records'),
              children: (
                <Card
                  title={t('DNS Records')}
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
                      {t('Add Record')}
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
              label: t('Cache Configuration'),
              children: (
                <Card title={t('Cache Settings')}>
                  <Form
                    form={cacheForm}
                    layout="vertical"
                    initialValues={cacheSettings}
                    onFinish={(values) => updateCache.mutate(values)}
                    style={{ maxWidth: 600 }}
                  >
                    <Form.Item name="cache_level" label={t('Cache Level')}>
                      <Select
                        size="large"
                        options={[
                          { value: 'aggressive', label: 'Aggressive' },
                          { value: 'basic', label: 'Basic' },
                          { value: 'simplified', label: 'Simplified' },
                        ]}
                      />
                    </Form.Item>
                    <Form.Item name="browser_cache_ttl" label={t('Browser Cache TTL (seconds)')}>
                      <InputNumber min={0} style={{ width: '100%' }} size="large" />
                    </Form.Item>
                    <Divider />
                    <Form.Item>
                      <Space>
                        <Button type="primary" htmlType="submit" loading={updateCache.isPending} size="large">
                          {t('Update Settings')}
                        </Button>
                        <Button
                          icon={<ReloadOutlined />}
                          onClick={() => purgeCache.mutate(undefined)}
                          loading={purgeCache.isPending}
                          size="large"
                        >
                          {t('Purge Cache')}
                        </Button>
                      </Space>
                    </Form.Item>
                  </Form>
                </Card>
              ),
            },
            {
              key: 'security',
              label: t('Security & Speed'),
              children: (
                <Card title={t('Security & Speed')} loading={securityLoading}>
                  <Row gutter={[24, 24]}>
                    <Col xs={24} md={12}>
                      <div style={{ padding: 16, background: token.colorFillQuaternary, borderRadius: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Text strong>{t('Always Use HTTPS')}</Text>
                          <Switch
                            checked={security?.always_use_https === 'on'}
                            loading={updateSecurity.isPending}
                            onChange={(c) => updateSecurity.mutate({ always_use_https: c ? 'on' : 'off' })}
                          />
                        </div>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {t('Automatically redirect all HTTP requests to HTTPS.')}
                        </Text>
                      </div>
                    </Col>

                    <Col xs={24} md={12}>
                      <div style={{ padding: 16, background: token.colorFillQuaternary, borderRadius: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Text strong>{t('Automatic HTTPS Rewrites')}</Text>
                          <Switch
                            checked={security?.automatic_https_rewrites === 'on'}
                            loading={updateSecurity.isPending}
                            onChange={(c) => updateSecurity.mutate({ automatic_https_rewrites: c ? 'on' : 'off' })}
                          />
                        </div>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {t('Rewrite HTTP links to HTTPS to avoid mixed content errors.')}
                        </Text>
                      </div>
                    </Col>

                    <Col xs={24} md={12}>
                      <div style={{ padding: 16, background: token.colorFillQuaternary, borderRadius: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Text strong>{t('Development Mode')}</Text>
                          <Switch
                            checked={security?.development_mode === 'on'}
                            loading={updateSecurity.isPending}
                            onChange={(c) => updateSecurity.mutate({ development_mode: c ? 'on' : 'off' })}
                          />
                        </div>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {t('Temporarily bypass cache for 3 hours to test changes.')}
                          {security?.development_mode === 'on' && security?.development_mode_time_remaining
                            ? ' ' + t('~{{count}} minutes remaining.', { count: Math.round(security.development_mode_time_remaining / 60) })
                            : ''}
                        </Text>
                      </div>
                    </Col>

                    <Col xs={24} md={12}>
                      <div style={{ padding: 16, background: token.colorFillQuaternary, borderRadius: 8 }}>
                        <Text strong style={{ display: 'block', marginBottom: 8 }}>
                          {t('Security Level')}
                        </Text>
                        <Select
                          value={security?.security_level}
                          style={{ width: '100%' }}
                          loading={updateSecurity.isPending}
                          onChange={(value) => updateSecurity.mutate({ security_level: value })}
                          options={[
                            { value: 'off', label: t('Off') },
                            { value: 'essentially_off', label: t('Essentially Off') },
                            { value: 'low', label: t('Low') },
                            { value: 'medium', label: t('Medium') },
                            { value: 'high', label: t('High') },
                            { value: 'under_attack', label: t("I'm Under Attack!") },
                          ]}
                        />
                        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 8 }}>
                          {t('How strictly suspicious visitors are challenged. Use "Under Attack" during an attack.')}
                        </Text>
                      </div>
                    </Col>
                  </Row>

                  <Divider />

                  <Title level={5}>{t('Purge Cache')}</Title>
                  <Space direction="vertical" style={{ width: '100%' }} size="middle">
                    <Text type="secondary">
                      {t('Purge all cache, or enter specific URLs (one per line) to purge only those.')}
                    </Text>
                    <Input.TextArea
                      rows={3}
                      placeholder={'https://example.com/style.css\nhttps://example.com/app.js'}
                      value={purgeUrlsText}
                      onChange={(e) => setPurgeUrlsText(e.target.value)}
                    />
                    <Space wrap>
                      <Button
                        icon={<ReloadOutlined />}
                        loading={purgeCache.isPending}
                        onClick={() => {
                          const files = purgeUrlsText
                            .split('\n')
                            .map((u) => u.trim())
                            .filter(Boolean)
                          if (files.length === 0) {
                            message.warning(t('Enter at least one URL, or use the "Purge everything" button'))
                            return
                          }
                          purgeCache.mutate(files, { onSuccess: () => setPurgeUrlsText('') })
                        }}
                      >
                        {t('Purge by URL')}
                      </Button>
                      <Popconfirm
                        title={t('Purge everything?')}
                        description={t('All cache for this domain will be purged.')}
                        okText={t('Purge')}
                        cancelText={t('Cancel')}
                        onConfirm={() => purgeCache.mutate(undefined)}
                      >
                        <Button danger icon={<ReloadOutlined />} loading={purgeCache.isPending}>
                          {t('Purge everything')}
                        </Button>
                      </Popconfirm>
                    </Space>
                  </Space>
                </Card>
              ),
            },
            {
              key: 'rules',
              label: t('Page Rules'),
              children: (
                <Card title={t('Page Rules')}>
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
        title={editingDns ? t('Edit DNS Record') : t('Add DNS Record')}
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
          <Form.Item name="type" label={t('Type')} rules={[{ required: true }]}>
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
          <Form.Item name="name" label={t('Name')} rules={[{ required: true }]}>
            <Input size="large" placeholder={t('example.com or @ for root')} />
          </Form.Item>
          <Form.Item name="content" label={t('Content')} rules={[{ required: true }]}>
            <Input size="large" />
          </Form.Item>
          <Form.Item name="ttl" label="TTL" initialValue={3600}>
            <InputNumber min={120} style={{ width: '100%' }} size="large" />
          </Form.Item>
          <Form.Item name="proxied" valuePropName="checked">
            <Switch checkedChildren="Proxied" unCheckedChildren="DNS Only" />
          </Form.Item>
          <Form.Item name="priority" label={t('Priority (for MX records)')}>
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
                {editingDns ? t('Update') : t('Create')}
              </Button>
              <Button onClick={() => setDnsModal(false)} size="large">
                {t('Cancel')}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
