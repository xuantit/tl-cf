import { useQuery } from '@tanstack/react-query'
import { Card, Row, Col, Typography, Space, Button } from 'antd'
import { GlobalOutlined, CheckCircleOutlined, SettingOutlined, DashboardOutlined, ClockCircleOutlined } from '@ant-design/icons'
import { api } from '../services/api'
import { useNavigate } from 'react-router-dom'
import { Link } from 'react-router-dom'

const { Title, Text, Paragraph } = Typography

export default function Dashboard() {
  const navigate = useNavigate()
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

  const { data: credentials } = useQuery({
    queryKey: ['cf-credentials'],
    queryFn: async () => {
      try {
        const res = await api.get('/cf/credentials')
        return res.data
      } catch {
        return null
      }
    },
  })

  const activeDomains = domains.filter((d: any) => d.status === 'active').length
  const totalDomains = domains.length

  return (
    <div style={{ padding: '24px' }}>
      <div className="page-header">
        <Title level={2} style={{ marginBottom: 8 }}>
          <DashboardOutlined style={{ marginRight: 8, color: '#1890ff' }} />
          Dashboard
        </Title>
        <Text type="secondary">Overview of your Cloudflare domains</Text>
      </div>

      {!credentials && (
        <Card
          type="inner"
          style={{
            marginBottom: 24,
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            border: 'none',
          }}
        >
          <Space direction="vertical" size="small" style={{ width: '100%' }}>
            <Title level={4} style={{ color: '#fff', margin: 0 }}>
              <SettingOutlined style={{ marginRight: 8 }} />
              Setup Required
            </Title>
            <Paragraph style={{ color: '#fff', margin: 0, opacity: 0.9 }}>
              Please configure your Cloudflare credentials to start managing domains.
            </Paragraph>
            <Link to="/cf-credentials">
              <button
                style={{
                  background: '#fff',
                  color: '#667eea',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  marginTop: 8,
                }}
              >
                Configure Now →
              </button>
            </Link>
          </Space>
        </Card>
      )}

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card className="stats-card">
            <div className="stats-number">{totalDomains}</div>
            <div className="stats-label">Total Domains</div>
            <GlobalOutlined style={{ fontSize: 32, color: '#1890ff', marginTop: 8 }} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="stats-card">
            <div className="stats-number" style={{ color: '#52c41a' }}>
              {activeDomains}
            </div>
            <div className="stats-label">Active Domains</div>
            <CheckCircleOutlined style={{ fontSize: 32, color: '#52c41a', marginTop: 8 }} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="stats-card">
            <div className="stats-number" style={{ color: '#faad14' }}>
              {totalDomains - activeDomains}
            </div>
            <div className="stats-label">Pending</div>
            <ClockCircleOutlined style={{ fontSize: 32, color: '#faad14', marginTop: 8 }} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="stats-card">
            <div className="stats-number" style={{ color: credentials ? '#52c41a' : '#ff4d4f' }}>
              {credentials ? '✓' : '✗'}
            </div>
            <div className="stats-label">CF Credentials</div>
            <SettingOutlined style={{ fontSize: 32, color: credentials ? '#52c41a' : '#ff4d4f', marginTop: 8 }} />
          </Card>
        </Col>
      </Row>

      <Card title="Quick Actions" style={{ marginBottom: 24 }}>
        <Space wrap>
          <Link to="/domains">
            <Button type="primary" icon={<GlobalOutlined />} size="large">
              View All Domains
            </Button>
          </Link>
          <Link to="/cf-credentials">
            <Button icon={<SettingOutlined />} size="large">
              {credentials ? 'Update' : 'Setup'} Credentials
            </Button>
          </Link>
        </Space>
      </Card>

      {domains.length > 0 && (
        <Card title="Recent Domains">
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            {domains.slice(0, 5).map((domain: any) => (
              <div
                key={domain.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px',
                  background: '#fafafa',
                  borderRadius: '6px',
                  cursor: 'pointer',
                }}
                onClick={() => navigate(`/domains/${domain.id}`)}
              >
                <div>
                  <Text strong>{domain.name}</Text>
                  <br />
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Status: {domain.status}
                  </Text>
                </div>
                <Button type="link">Manage →</Button>
              </div>
            ))}
          </Space>
        </Card>
      )}
    </div>
  )
}
