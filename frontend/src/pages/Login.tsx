import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Form, Input, Button, Card, Alert } from 'antd'
import { UserOutlined, LockOutlined, CloudOutlined } from '@ant-design/icons'
import { api } from '../services/api'
import { useAuthStore } from '../stores/useAuthStore'
import '../App.css'

export default function Login() {
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const navigate = useNavigate()
  const setToken = useAuthStore((s) => s.setToken)

  const onFinish = async (v: { email: string; password: string }) => {
    setLoading(true)
    setErr('')
    try {
      const { data } = await api.post<{ token: string }>('/auth/login', v)
      setToken(data.token)
      navigate('/')
    } catch (e: unknown) {
      const ex = e as { response?: { data?: { detail?: string | string[] }; status?: number }; message?: string }
      const d = ex?.response?.data?.detail
      const msg = typeof d === 'string' ? d : Array.isArray(d) ? d.map((x: { msg?: string }) => x?.msg).filter(Boolean).join(', ') : null
      setErr(msg || ex?.response?.data?.title || ex?.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-container">
      <Card className="auth-card" title={
        <div style={{ textAlign: 'center', padding: '8px 0' }}>
          <CloudOutlined style={{ fontSize: 32, color: '#1890ff', marginBottom: 8 }} />
          <div style={{ fontSize: 24, fontWeight: 600, marginTop: 8 }}>Cloudflare Tool</div>
          <div style={{ fontSize: 14, color: '#8c8c8c', marginTop: 4 }}>Sign in to your account</div>
        </div>
      }>
        {err && (
          <Alert
            message={err}
            type="error"
            showIcon
            closable
            onClose={() => setErr('')}
            style={{ marginBottom: 16 }}
          />
        )}
        <Form onFinish={onFinish} layout="vertical" size="large">
          <Form.Item
            name="email"
            label="Email"
            rules={[{ required: true, type: 'email', message: 'Please enter a valid email' }]}
          >
            <Input
              prefix={<UserOutlined />}
              placeholder="your-email@example.com"
            />
          </Form.Item>
          <Form.Item
            name="password"
            label="Password"
            rules={[{ required: true, message: 'Please enter your password' }]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="Enter your password"
            />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block size="large">
              Sign In
            </Button>
          </Form.Item>
        </Form>
        <div style={{ textAlign: 'center', marginTop: 16, color: '#8c8c8c' }}>
          Don&apos;t have an account?{' '}
          <Link to="/register" style={{ fontWeight: 500 }}>Sign up</Link>
        </div>
      </Card>
    </div>
  )
}
