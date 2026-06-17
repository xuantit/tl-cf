import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Form, Input, Button, Card, Alert } from 'antd'
import { UserOutlined, LockOutlined, CloudOutlined } from '@ant-design/icons'
import { api } from '../services/api'
import { useAuthStore } from '../stores/useAuthStore'
import '../App.css'

export default function Register() {
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const navigate = useNavigate()
  const setToken = useAuthStore((s) => s.setToken)

  const onFinish = async (v: { email: string; password: string }) => {
    setLoading(true)
    setErr('')
    try {
      await api.post('/auth/register', v)
      navigate('/login')
    } catch (e: unknown) {
      setErr((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-container">
      <Card className="auth-card" title={
        <div style={{ textAlign: 'center', padding: '8px 0' }}>
          <CloudOutlined style={{ fontSize: 32, color: '#1890ff', marginBottom: 8 }} />
          <div style={{ fontSize: 24, fontWeight: 600, marginTop: 8 }}>Create Account</div>
          <div style={{ fontSize: 14, color: '#8c8c8c', marginTop: 4 }}>Sign up to get started</div>
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
            rules={[
              { required: true, type: 'email', message: 'Please enter a valid email' },
              { min: 5, message: 'Email must be at least 5 characters' }
            ]}
          >
            <Input
              prefix={<UserOutlined />}
              placeholder="your-email@example.com"
            />
          </Form.Item>
          <Form.Item
            name="password"
            label="Password"
            rules={[
              { required: true, message: 'Please enter your password' },
              { min: 8, message: 'Password must be at least 8 characters' }
            ]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="At least 8 characters"
            />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block size="large">
              Create Account
            </Button>
          </Form.Item>
        </Form>
        <div style={{ textAlign: 'center', marginTop: 16, color: '#8c8c8c' }}>
          Already have an account?{' '}
          <Link to="/login" style={{ fontWeight: 500 }}>Sign in</Link>
        </div>
      </Card>
    </div>
  )
}
