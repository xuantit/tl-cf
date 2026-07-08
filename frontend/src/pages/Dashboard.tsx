import { useQuery } from '@tanstack/react-query'
import { Card, Row, Col, Typography, Space, Button, theme, Alert, Tag } from 'antd'
import { GlobalOutlined, CheckCircleOutlined, SettingOutlined, ClockCircleOutlined } from '@ant-design/icons'
import { api } from '../services/api'
import { useNavigate } from 'react-router-dom'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

const { Title, Text, Paragraph } = Typography

export default function Dashboard() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { token } = theme.useToken()
  const { data: domains = [] } = useQuery({
    queryKey: ['domains'],
    queryFn: async () => {
      try {
        const res = await api.get('/domains')
        return res.data
      } catch {
        return []
      }
    },
  })

  const { data: accounts = [] } = useQuery({
    queryKey: ['cf-accounts'],
    queryFn: async () => {
      try {
        const res = await api.get('/cf/accounts')
        return res.data
      } catch {
        return []
      }
    },
  })

  const hasAccounts = accounts.length > 0

  const activeDomains = domains.filter((d: any) => d.status === 'active').length
  const totalDomains = domains.length
  const pendingDomains = domains.filter((d: any) => d.status !== 'active')

  return (
    <div style={{ padding: '24px' }}>
      <div className="page-header">
        <Title level={2} style={{ fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 4 }}>
          Dashboard
        </Title>
        <Text type="secondary">{t('Overview of your Cloudflare domains')}</Text>
      </div>

      {!hasAccounts && (
        <Card
          style={{
            marginBottom: 24,
            background: 'rgba(246,130,31,0.06)',
            border: '1px solid rgba(246,130,31,0.25)',
          }}
        >
          <Space direction="vertical" size="small" style={{ width: '100%' }}>
            <Title level={4} style={{ margin: 0 }}>
              <SettingOutlined style={{ marginRight: 8, color: '#f6821f' }} />
              {t('No Cloudflare account')}
            </Title>
            <Paragraph type="secondary" style={{ margin: 0 }}>
              {t('Add a Cloudflare account (API Token or Global API Key) to start managing domains.')}
            </Paragraph>
            <Link to="/accounts">
              <Button type="primary" style={{ marginTop: 8 }}>{t('Add account →')}</Button>
            </Link>
          </Space>
        </Card>
      )}

      {pendingDomains.length > 0 && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 24 }}
          message={t('{{count}} domains not active yet — point nameservers to Cloudflare', { count: pendingDomains.length })}
          description={
            <Space wrap size={4}>
              {pendingDomains.slice(0, 10).map((d: any) => (
                <Tag key={d.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/domains/${d.id}`)}>
                  {d.name}
                </Tag>
              ))}
              {pendingDomains.length > 10 && <Text type="secondary">{t('+{{count}} more domains', { count: pendingDomains.length - 10 })}</Text>}
            </Space>
          }
        />
      )}

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card className="stat-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div className="icon-chip" style={{ background: 'rgba(246,130,31,0.12)', color: '#f6821f' }}>
                <GlobalOutlined />
              </div>
              <div>
                <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em', color: token.colorTextSecondary, fontWeight: 600 }}>
                  {t('Total Domains')}
                </div>
                <div style={{ fontSize: 28, fontWeight: 700, lineHeight: 1.2 }}>{totalDomains}</div>
              </div>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="stat-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div className="icon-chip" style={{ background: 'rgba(82,196,26,0.12)', color: '#52c41a' }}>
                <CheckCircleOutlined />
              </div>
              <div>
                <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em', color: token.colorTextSecondary, fontWeight: 600 }}>
                  {t('Active Domains')}
                </div>
                <div style={{ fontSize: 28, fontWeight: 700, lineHeight: 1.2 }}>{activeDomains}</div>
              </div>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="stat-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div className="icon-chip" style={{ background: 'rgba(250,173,20,0.12)', color: '#faad14' }}>
                <ClockCircleOutlined />
              </div>
              <div>
                <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em', color: token.colorTextSecondary, fontWeight: 600 }}>
                  {t('Pending')}
                </div>
                <div style={{ fontSize: 28, fontWeight: 700, lineHeight: 1.2 }}>{totalDomains - activeDomains}</div>
              </div>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="stat-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div className="icon-chip" style={{ background: token.colorFillSecondary, color: token.colorTextSecondary }}>
                <SettingOutlined />
              </div>
              <div>
                <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em', color: token.colorTextSecondary, fontWeight: 600 }}>
                  {t('CF Accounts')}
                </div>
                <div style={{ fontSize: 28, fontWeight: 700, lineHeight: 1.2, color: hasAccounts ? undefined : '#ff4d4f' }}>
                  {accounts.length}
                </div>
              </div>
            </div>
          </Card>
        </Col>
      </Row>

      <Card title={t('Quick Actions')} style={{ marginBottom: 24 }}>
        <Space wrap>
          <Link to="/domains">
            <Button type="primary" icon={<GlobalOutlined />} size="large">
              {t('View All Domains')}
            </Button>
          </Link>
          <Link to="/accounts">
            <Button icon={<SettingOutlined />} size="large">
              {t('Manage accounts')}
            </Button>
          </Link>
        </Space>
      </Card>

      {domains.length > 0 && (
        <Card title={t('Recent Domains')}>
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            {domains.slice(0, 5).map((domain: any) => (
              <div
                key={domain.id}
                className="hover-row"
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 16px',
                  borderRadius: 10,
                  border: `1px solid ${token.colorBorderSecondary}`,
                  cursor: 'pointer',
                }}
                onClick={() => navigate(`/domains/${domain.id}`)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: domain.status === 'active' ? '#52c41a' : '#faad14',
                      display: 'inline-block',
                    }}
                  />
                  <div>
                    <Text strong>{domain.name}</Text>
                    <br />
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {t('Status')}: {domain.status}
                    </Text>
                  </div>
                </div>
                <Button type="link">{t('Manage →')}</Button>
              </div>
            ))}
          </Space>
        </Card>
      )}
    </div>
  )
}
