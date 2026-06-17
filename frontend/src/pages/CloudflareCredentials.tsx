import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Form, Input, Button, Card, message, Alert, Space, Typography, Divider } from 'antd'
import { CloudOutlined, CheckCircleOutlined, InfoCircleOutlined, SafetyOutlined } from '@ant-design/icons'
import { api } from '../services/api'

const { Title, Text, Paragraph } = Typography

export default function CloudflareCredentials() {
  const qc = useQueryClient()
  const [form] = Form.useForm()

  const { data: credentials, isLoading } = useQuery({
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

  const saveCredentials = useMutation({
    mutationFn: async (data: { email: string; globalApiKey: string }) => {
      await api.post('/cf/credentials', data)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cf-credentials'] })
      message.success('Cloudflare credentials saved successfully')
    },
    onError: (e: any) => {
      message.error(e?.response?.data?.detail || 'Failed to save credentials')
    },
  })

  const testConnection = useMutation({
    mutationFn: async () => {
      const res = await api.get('/cf/test')
      return res.data
    },
    onSuccess: (data) => {
      if (data.valid) {
        message.success('Connection test successful')
      } else {
        message.error('Connection test failed')
      }
    },
    onError: () => {
      message.error('Connection test failed')
    },
  })

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: '24px' }}>
      <div className="page-header">
        <Title level={2} style={{ marginBottom: 8 }}>
          <CloudOutlined style={{ marginRight: 8, color: '#1890ff' }} />
          Cloudflare Credentials
        </Title>
        <Text type="secondary">Configure your Cloudflare API credentials to manage domains</Text>
      </div>

      <Card>
        <Alert
          message="How to get your Global API Key"
          description={
            <div>
              <Paragraph style={{ marginBottom: 8 }}>
                1. Go to{' '}
                <a href="https://dash.cloudflare.com/profile/api-tokens" target="_blank" rel="noopener noreferrer">
                  Cloudflare Dashboard → My Profile → API Tokens
                </a>
              </Paragraph>
              <Paragraph style={{ marginBottom: 0 }}>
                2. Scroll down to &quot;API Keys&quot; section and copy your &quot;Global API Key&quot;
              </Paragraph>
            </div>
          }
          type="info"
          icon={<InfoCircleOutlined />}
          style={{ marginBottom: 24 }}
        />

        {credentials && (
          <Alert
            message="Credentials Configured"
            description={
              <div>
                <Text strong>Email:</Text> {credentials.email}
                <br />
                <Text strong>Saved on:</Text> {new Date(credentials.createdAt).toLocaleString()}
              </div>
            }
            type="success"
            icon={<CheckCircleOutlined />}
            style={{ marginBottom: 24 }}
            action={
              <Button size="small" onClick={() => testConnection.mutate()} loading={testConnection.isPending}>
                Test Connection
              </Button>
            }
          />
        )}

        <Form
          form={form}
          layout="vertical"
          initialValues={credentials || {}}
          onFinish={(values) => saveCredentials.mutate(values)}
        >
          <Form.Item
            name="email"
            label={
              <span>
                <SafetyOutlined style={{ marginRight: 4 }} />
                Cloudflare Email
              </span>
            }
            rules={[{ required: true, type: 'email', message: 'Please enter a valid email' }]}
          >
            <Input size="large" placeholder="your-email@example.com" />
          </Form.Item>
          <Form.Item
            name="globalApiKey"
            label={
              <span>
                <SafetyOutlined style={{ marginRight: 4 }} />
                Global API Key
              </span>
            }
            rules={[{ required: true, message: 'Please enter your Global API Key' }]}
            help="Your API key will be encrypted and stored securely"
          >
            <Input.Password size="large" placeholder="Your Global API Key" />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" loading={saveCredentials.isPending} size="large">
                {credentials ? 'Update Credentials' : 'Save Credentials'}
              </Button>
              {credentials && (
                <Button onClick={() => testConnection.mutate()} loading={testConnection.isPending} size="large">
                  Test Connection
                </Button>
              )}
            </Space>
          </Form.Item>
        </Form>
      </Card>
    </div>
  )
}
