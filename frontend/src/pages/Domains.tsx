import { useQuery } from '@tanstack/react-query'
import { Table, Tag, Button, message, Card, Input, Space, Typography, Row, Col, Statistic } from 'antd'
import { useNavigate } from 'react-router-dom'
import { GlobalOutlined, SearchOutlined, SettingOutlined, CheckCircleOutlined, ClockCircleOutlined } from '@ant-design/icons'
import { api } from '../services/api'
import type { ColumnsType } from 'antd/es/table'
import { useState } from 'react'

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
}

export default function Domains() {
  const navigate = useNavigate()
  const [searchText, setSearchText] = useState('')
  
  const { data: domains = [], isLoading } = useQuery<Zone[]>({
    queryKey: ['domains'],
    queryFn: async () => {
      try {
        const res = await api.get('/domains')
        return res.data
      } catch (error: any) {
        if (error.response?.status === 400 && error.response?.data?.detail?.includes('credentials')) {
          message.warning('Please configure Cloudflare credentials first')
          navigate('/cf-credentials')
        }
        throw error
      }
    },
  })

  const filteredDomains = domains.filter((domain) =>
    domain.name.toLowerCase().includes(searchText.toLowerCase())
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
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status: string) => {
        const color = status === 'active' ? 'success' : status === 'pending' ? 'warning' : 'default'
        const icon = status === 'active' ? <CheckCircleOutlined /> : <ClockCircleOutlined />
        return (
          <Tag color={color} icon={icon}>
            {status.toUpperCase()}
          </Tag>
        )
      },
    },
    {
      title: 'SSL Status',
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
        
        return <Tag color={color}>{displayStatus}</Tag>
      },
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 150,
      render: (_: unknown, record: Zone) => (
        <Button
          type="primary"
          icon={<SettingOutlined />}
          onClick={() => navigate(`/domains/${record.id}`)}
        >
          Manage
        </Button>
      ),
    },
  ]

  return (
    <div style={{ padding: '24px' }}>
      <div className="page-header">
        <Title level={2} style={{ marginBottom: 8 }}>
          <GlobalOutlined style={{ marginRight: 8, color: '#1890ff' }} />
          Domains
        </Title>
        <Text type="secondary">Manage your Cloudflare domains and DNS records</Text>
      </div>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={8}>
          <Card>
            <Statistic
              title="Total Domains"
              value={domains.length}
              prefix={<GlobalOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic
              title="Active"
              value={activeDomains}
              prefix={<CheckCircleOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic
              title="Pending"
              value={pendingDomains}
              prefix={<ClockCircleOutlined />}
              valueStyle={{ color: '#faad14' }}
            />
          </Card>
        </Col>
      </Row>

      <Card>
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          <Search
            placeholder="Search domains..."
            allowClear
            enterButton={<SearchOutlined />}
            size="large"
            onSearch={setSearchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ maxWidth: 400 }}
          />
          <Table
            loading={isLoading}
            dataSource={filteredDomains}
            rowKey="id"
            columns={columns}
            pagination={{
              pageSize: 20,
              showSizeChanger: true,
              showTotal: (total) => `Total ${total} domains`,
            }}
          />
        </Space>
      </Card>
    </div>
  )
}
