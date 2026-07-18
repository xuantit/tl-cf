import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom'
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
  Grid,
  Breadcrumb,
} from 'antd'
import { PlusOutlined, ReloadOutlined, ArrowLeftOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import PageRuleFormModal from '../components/rules/PageRuleFormModal'
import ModernRulesPanel from '../components/rules/ModernRulesPanel'
import type { PageRuleInput } from '../components/rules/pageRulePresets'
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
  topology: 'off' | 'smart' | 'generic' | null
  enabled?: boolean
  available?: boolean
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
  status: 'active' | 'disabled'
  targets: Array<{ target: string; constraint: { operator: string; value: string } }>
  actions: Array<{ id: string; value?: unknown }>
}

type FeatureState = 'available' | 'forbidden' | 'plan_limited' | 'unavailable' | 'unknown'

interface FeatureCapability {
  state: FeatureState
  requiredPermission: string
  reason: string | null
}

interface CapabilitiesResponse {
  token: { valid: boolean; authType?: string; accountId: string | null }
  zone: { id: string; plan: string | null } | null
  features: Record<string, FeatureCapability>
}

export default function DomainDetail() {
  const { t } = useTranslation()
  const { zoneId } = useParams<{ zoneId: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const qc = useQueryClient()
  const { token } = theme.useToken()
  const screens = Grid.useBreakpoint()
  const isMobile = !screens.md
  const [dnsForm] = Form.useForm()
  const [purgeUrlsText, setPurgeUrlsText] = useState('')
  const [tagsDraft, setTagsDraft] = useState<string[]>([])

  const activeTab = searchParams.get('tab') || 'overview'
  const activeModal = searchParams.get('modal')
  const editId = searchParams.get('edit')
  const setViewParams = (updates: Record<string, string | null>) => {
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous)
        for (const [key, value] of Object.entries(updates)) {
          if (value === null) next.delete(key)
          else next.set(key, value)
        }
        return next
      },
      { replace: true },
    )
  }

  const { data: zone } = useQuery({
    queryKey: ['domain', zoneId],
    queryFn: async () => {
      const res = await api.get(`/domains/${zoneId}`)
      return res.data
    },
  })

  const { data: capabilities, refetch: refetchCapabilities, isFetching: capabilitiesFetching } = useQuery<CapabilitiesResponse>({
    queryKey: ['capabilities', zoneId],
    queryFn: async () => (await api.get(`/cf/capabilities`, { params: { zoneId } })).data,
    enabled: !!zoneId,
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
    retry: false,
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

  const editingDns = activeModal === 'dns-edit' ? dnsRecords.find((record) => record.id === editId) ?? null : null
  const editingRule = activeModal === 'rule-edit' ? rules.find((rule) => rule.id === editId) ?? null : null
  const dnsModalOpen = activeModal === 'dns-add' || activeModal === 'dns-edit'
  const ruleModalOpen = activeModal === 'rule-add'

  const zonePlan: string | null = zone?.plan ?? capabilities?.zone?.plan ?? null
  const isEnterprise = zonePlan === 'enterprise'

  const createDns = useMutation({
    mutationFn: async (data: Partial<DnsRecord>) => {
      const res = await api.post(`/domains/${zoneId}/dns`, data)
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dns', zoneId] })
      setViewParams({ modal: null, edit: null })
      dnsForm.resetFields()
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
      setViewParams({ modal: null, edit: null })
      dnsForm.resetFields()
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

  const createRule = useMutation({
    mutationFn: async (data: PageRuleInput) => {
      const res = await api.post(`/domains/${zoneId}/rules`, data)
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rules', zoneId] })
      setViewParams({ modal: null, edit: null })
      message.success(t('Rule created'))
    },
    onError: (e: any) => message.error(e?.response?.data?.detail || t('Failed to create rule')),
  })

  const deleteRule = useMutation({
    mutationFn: async (ruleId: string) => api.delete(`/domains/${zoneId}/rules/${ruleId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rules', zoneId] })
      message.success(t('Rule deleted'))
    },
    onError: (e: any) => message.error(e?.response?.data?.detail || t('Failed to delete rule')),
  })

  // Sync tags editor with saved zone tags
  useEffect(() => {
    setTagsDraft((zone as any)?.tags ?? [])
  }, [zone])

  const updateTags = useMutation({
    mutationFn: async (tags: string[]) => (await api.put(`/domains/${zoneId}/tags`, { tags })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['domain', zoneId] })
      qc.invalidateQueries({ queryKey: ['domains'] })
      message.success(t('Tags updated'))
    },
    onError: (e: any) => message.error(e?.response?.data?.detail || t('Could not save tags')),
  })

  const deleteZone = useMutation({
    mutationFn: async () => api.delete(`/domains/${zoneId}`),
    onSuccess: () => {
      message.success(t('Domain deleted'))
      qc.invalidateQueries({ queryKey: ['domains'] })
      navigate('/')
    },
    onError: (e: any) => message.error(e?.response?.data?.detail || t('Could not delete domain')),
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
        <Tag color={proxied ? 'blue' : 'default'} variant="filled">{proxied ? t('Yes') : t('No')}</Tag>
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
              dnsForm.setFieldsValue(record)
              setViewParams({ tab: 'dns', modal: 'dns-edit', edit: record.id })
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
      render: (status: PageRule['status'], record: PageRule) => (
        <Select
          value={status}
          style={{ width: 120 }}
          onChange={(newStatus: PageRule['status']) => updateRule.mutate({ ruleId: record.id, data: { status: newStatus } })}
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
      key: 'ruleActions',
      render: (_: unknown, record: PageRule) =>
        record.actions.map((a) => `${a.id}${a.value ? `: ${JSON.stringify(a.value)}` : ''}`).join(', '),
    },
    {
      title: t('Actions'),
      key: 'actions',
      width: 170,
      render: (_: unknown, record: PageRule) => (
        <Space>
          <Button
            size="small"
            onClick={() => setViewParams({ tab: 'rules', modal: 'rule-edit', edit: record.id })}
          >
            {t('Edit')}
          </Button>
          <Popconfirm
            title={t('Delete this rule?')}
            okText={t('Delete')}
            cancelText={t('Cancel')}
            onConfirm={() => deleteRule.mutate(record.id)}
          >
            <Button size="small" danger>
              {t('Delete')}
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const editingRuleInput: PageRuleInput | undefined = editingRule
    ? {
        priority: editingRule.priority,
        status: editingRule.status,
        targets: editingRule.targets.map((target) => ({
          target: 'url',
          constraint: {
            operator: (target.constraint.operator as 'matches' | 'contains' | 'equals' | 'not_equal' | 'not_contain') || 'matches',
            value: target.constraint.value,
          },
        })),
        actions: editingRule.actions,
      }
    : undefined

  return (
    <div style={{ padding: 'clamp(12px, 3vw, 24px)' }}>
      <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
        {!isMobile && (
          <Breadcrumb
            items={[
              { title: <Link to="/">Domains</Link> },
              { title: zone?.name || '…' },
            ]}
          />
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {isMobile && (
            <Button
              type="text"
              icon={<ArrowLeftOutlined />}
              onClick={() => navigate('/')}
              aria-label={t('Back to Domains')}
            />
          )}
          <Title level={isMobile ? 4 : 2} style={{ fontWeight: 700, letterSpacing: '-0.02em', margin: 0, flex: '0 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {zone?.name || t('Domain Details')}
          </Title>
          {zone && (
            <Space size={4} wrap>
              <Tag color={zone.status === 'active' ? 'success' : 'warning'} variant="filled">
                {zone.status}
              </Tag>
              {zonePlan && (
                <Tag color={isEnterprise ? 'gold' : 'default'} variant="filled">
                  {zonePlan.charAt(0).toUpperCase() + zonePlan.slice(1)}
                </Tag>
              )}
              {(() => {
                // Display SSL mode from settings if available, otherwise show zone SSL status
                const sslDisplay = sslSettings?.mode
                  ? sslSettings.mode.charAt(0).toUpperCase() + sslSettings.mode.slice(1)
                  : (zone.ssl?.status || 'unknown')
                const sslColor = sslSettings?.mode
                  ? (sslSettings.mode !== 'off' ? 'success' : 'default')
                  : (zone.ssl?.status === 'active' ? 'success' : 'default')
                return (
                  <Tag color={sslColor} variant="filled">
                    SSL: {sslDisplay}
                  </Tag>
                )
              })()}
            </Space>
          )}
        </div>

        <Tabs
          activeKey={activeTab}
          size={isMobile ? 'small' : 'middle'}
          onChange={(tab) => setViewParams({ tab, modal: null, edit: null, kind: null, sub: null })}
          items={[
            {
              key: 'overview',
              label: t('Overview'),
              children: (
                <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
                  {capabilities && (
                    <Card
                      size="small"
                      title={t('Permissions & Capabilities')}
                      extra={
                        <Space>
                          <Button
                            size="small"
                            icon={<ReloadOutlined />}
                            loading={capabilitiesFetching}
                            onClick={() => refetchCapabilities()}
                          >
                            {t('Re-check')}
                          </Button>
                          <Button size="small" onClick={() => navigate(`/history?tab=changes&zone=${zoneId}`)}>
                            {t('View change history')}
                          </Button>
                        </Space>
                      }
                    >
                      <Space wrap>
                        {Object.entries(capabilities.features).map(([name, feature]) => {
                          const colorByState: Record<FeatureState, string> = {
                            available: 'success',
                            forbidden: 'error',
                            plan_limited: 'warning',
                            unavailable: 'default',
                            unknown: 'default',
                          }
                          const labelByName: Record<string, string> = {
                            dns: t('DNS'),
                            cachePurge: t('Cache Purge'),
                            ssl: t('SSL/TLS'),
                            pageRules: t('Page Rules'),
                            modernRules: t('Rules'),
                          }
                          const tip = feature.reason
                            ? `${feature.requiredPermission} — ${feature.reason}`
                            : feature.requiredPermission
                          return (
                            <Tag key={name} color={colorByState[feature.state]} variant="filled" title={tip}>
                              {(labelByName[name] || name)}: {t(feature.state)}
                            </Tag>
                          )
                        })}
                      </Space>
                    </Card>
                  )}

                  <Card size="small" title={t('Zone information')}>
                    <Row gutter={[24, 12]}>
                      <Col xs={24} md={12}>
                        <Text type="secondary">Zone ID</Text>
                        <div><code>{zoneId}</code></div>
                      </Col>
                      <Col xs={24} md={12}>
                        <Text type="secondary">{t('Status')}</Text>
                        <div>{zone?.status || '—'}</div>
                      </Col>
                      {zone?.nameServers?.length ? (
                        <Col xs={24}>
                          <Text type="secondary">Nameservers</Text>
                          <div>
                            {zone.nameServers.map((ns: string) => (
                              <div key={ns}><code>{ns}</code></div>
                            ))}
                          </div>
                        </Col>
                      ) : null}
                    </Row>
                  </Card>
                </Space>
              ),
            },
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
                        dnsForm.resetFields()
                        setViewParams({ tab: 'dns', modal: 'dns-add', edit: null })
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
                    scroll={{ x: 'max-content' }}
                  />
                </Card>
              ),
            },
            {
              key: 'rules',
              label: t('Rules'),
              children: (
                <Card>
                  <Tabs
                    activeKey={searchParams.get('sub') === 'legacy' ? 'legacy' : 'modern'}
                    onChange={(sub) => setViewParams({ sub: sub === 'legacy' ? 'legacy' : null, modal: null, edit: null, kind: null })}
                    items={[
                      {
                        key: 'modern',
                        label: t('Rules'),
                        children: zoneId ? <ModernRulesPanel zoneId={zoneId} /> : null,
                      },
                      {
                        key: 'legacy',
                        label: t('Page Rules (Legacy)'),
                        children: (
                          <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
                            <Button type="primary" icon={<PlusOutlined />} onClick={() => setViewParams({ tab: 'rules', sub: 'legacy', modal: 'rule-add', edit: null })}>
                              {t('Add Page Rule')}
                            </Button>
                            <Table
                              loading={rulesLoading}
                              dataSource={rules}
                              rowKey="id"
                              columns={rulesColumns}
                              pagination={{ pageSize: 20 }}
                              scroll={{ x: 'max-content' }}
                            />
                          </Space>
                        ),
                      },
                    ]}
                  />
                </Card>
              ),
            },
            {
              key: 'cache',
              label: t('Cache'),
              children: (
                <Card title={t('Cache Settings')}>
                  <Row gutter={[24, 24]}>
                    <Col xs={24} md={12} lg={8}>
                      <div style={{ height: '100%', padding: '16px', border: `1px solid ${token.colorBorderSecondary}`, borderRadius: 10 }}>
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
                    <Col xs={24} md={12} lg={8}>
                      <div style={{ height: '100%', padding: '16px', border: `1px solid ${token.colorBorderSecondary}`, borderRadius: 10 }}>
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
                    <Col xs={24} md={12} lg={8}>
                      <div style={{ height: '100%', padding: '16px', border: `1px solid ${token.colorBorderSecondary}`, borderRadius: 10 }}>
                        <Text strong style={{ display: 'block', marginBottom: 8, fontSize: 14 }}>
                          {t('Tiered Cache Topology')}
                        </Text>
                        <Text type="secondary" style={{ display: 'block', marginBottom: 16, fontSize: 12 }}>
                          {tieredCache?.available === false
                            ? t('Not available: the API token lacks the Tiered Cache permission or your plan does not include it.')
                            : t("Configure how Cloudflare's tiered cache distributes content across its network.")}
                        </Text>
                        <Select
                          value={tieredCache?.topology ?? undefined}
                          style={{ width: '100%' }}
                          size="large"
                          disabled={tieredCache?.available === false}
                          placeholder={tieredCache?.available === false ? t('Unavailable') : undefined}
                          onChange={(value) => updateTieredCache.mutate({ topology: value })}
                          loading={updateTieredCache.isPending}
                          options={[
                            { value: 'off', label: t('Off (disabled)') },
                            { value: 'smart', label: t('Smart Tiered Cache (recommended)') },
                            ...(isEnterprise
                              ? [{ value: 'generic', label: t('Generic Global (Enterprise)') }]
                              : []),
                          ]}
                        />
                      </div>
                    </Col>
                  </Row>

                  <Divider />

                  <Title level={5}>{t('Purge Cache')}</Title>
                  <Space orientation="vertical" style={{ width: '100%' }} size="middle">
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
              key: 'security',
              label: t('Security & Speed'),
              children: (
                <Card title={t('Security & Speed')} loading={securityLoading}>
                  <Row gutter={[24, 24]}>
                    <Col xs={24} md={12}>
                      <div style={{ padding: 16, background: token.colorFillQuaternary, borderRadius: 8 }}>
                        <Text strong style={{ display: 'block', marginBottom: 8 }}>
                          {t('SSL/TLS Encryption Mode')}
                        </Text>
                        <Select
                          value={sslSettings?.mode}
                          style={{ width: '100%' }}
                          loading={updateSsl.isPending}
                          onChange={(value) => updateSsl.mutate({ mode: value })}
                          options={[
                            { value: 'off', label: t('Off') },
                            { value: 'flexible', label: 'Flexible' },
                            { value: 'full', label: 'Full' },
                            { value: 'strict', label: 'Strict' },
                          ]}
                        />
                        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 8 }}>
                          {t('Determine how Cloudflare connects to your origin server.')}
                        </Text>
                      </div>
                    </Col>

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
                </Card>
              ),
            },
            {
              key: 'settings',
              label: t('Settings'),
              children: (
                <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
                  <Card size="small" title={t('Tags')}>
                    <Space orientation="vertical" style={{ width: '100%' }} size="small">
                      <Text type="secondary">{t('Tags are stored locally to organize your domains.')}</Text>
                      <Space.Compact style={{ width: '100%', maxWidth: 480 }}>
                        <Select
                          mode="tags"
                          style={{ flex: 1 }}
                          value={tagsDraft}
                          onChange={setTagsDraft}
                          placeholder={t('Enter tag…')}
                          tokenSeparators={[',']}
                        />
                        <Button
                          type="primary"
                          loading={updateTags.isPending}
                          onClick={() => updateTags.mutate(tagsDraft)}
                        >
                          {t('Save')}
                        </Button>
                      </Space.Compact>
                    </Space>
                  </Card>

                  <Card size="small" title={<Text type="danger">{t('Danger zone')}</Text>}>
                    <Space orientation="vertical" size="small">
                      <Text type="secondary">
                        {t('Delete this domain from Cloudflare. This action cannot be undone.')}
                      </Text>
                      <Popconfirm
                        title={t('Delete domain')}
                        description={t('Delete {{name}} from Cloudflare? This cannot be undone.', { name: zone?.name })}
                        okText={t('Delete')}
                        cancelText={t('Cancel')}
                        okButtonProps={{ danger: true }}
                        onConfirm={() => deleteZone.mutate()}
                      >
                        <Button danger icon={<DeleteOutlined />} loading={deleteZone.isPending}>
                          {t('Delete domain')}
                        </Button>
                      </Popconfirm>
                    </Space>
                  </Card>
                </Space>
              ),
            },
          ]}
        />
      </Space>

      {/* DNS Record Modal */}
      <Modal
        title={editingDns ? t('Edit DNS Record') : t('Add DNS Record')}
        open={dnsModalOpen}
        onCancel={() => {
          setViewParams({ modal: null, edit: null })
          dnsForm.resetFields()
        }}
        footer={null}
        width={600}
        style={{ maxWidth: '95vw' }}
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
              <Button onClick={() => setViewParams({ modal: null, edit: null })} size="large">
                {t('Cancel')}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      <PageRuleFormModal
        open={ruleModalOpen}
        title={t('Add Page Rule')}
        zoneName={zone?.name}
        loading={createRule.isPending}
        onCancel={() => setViewParams({ modal: null, edit: null })}
        onSubmit={(payload) => createRule.mutate(payload)}
      />

      <PageRuleFormModal
        open={!!editingRule}
        title={t('Edit Page Rule')}
        zoneName={zone?.name}
        initialValue={editingRuleInput}
        loading={updateRule.isPending}
        onCancel={() => setViewParams({ modal: null, edit: null })}
        onSubmit={(payload) => {
          if (!editingRule) return
          updateRule.mutate({ ruleId: editingRule.id, data: payload })
        }}
      />
    </div>
  )
}
