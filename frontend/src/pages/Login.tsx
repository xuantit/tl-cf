import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Form, Input, Button, Card, Alert } from 'antd'
import { UserOutlined, LockOutlined, CloudOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { api } from '../services/api'
import { useAuthStore } from '../stores/useAuthStore'
import '../App.css'

export default function Login() {
  const { t } = useTranslation()
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
      const ex = e as {
        response?: { data?: { detail?: string | Array<string | { msg?: string }>; title?: string }; status?: number }
        message?: string
      }
      const d = ex?.response?.data?.detail
      const msg = typeof d === 'string'
        ? d
        : Array.isArray(d)
          ? d
            .map((item) => typeof item === 'string' ? item : item?.msg)
            .filter((item): item is string => Boolean(item))
            .join(', ')
          : null
      setErr(msg || ex?.response?.data?.title || ex?.message || t('Login failed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-container">
      <Card className="auth-card">
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 14,
              background: '#f6821f',
              color: '#fff',
              fontSize: 24,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 16,
            }}
          >
            <CloudOutlined />
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>Cloudflare Tool</div>
          <div style={{ fontSize: 14, color: '#8c8c8c', marginTop: 4 }}>{t('Sign in to your account')}</div>
        </div>
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
            rules={[{ required: true, type: 'email', message: t('Please enter a valid email') }]}
          >
            <Input
              prefix={<UserOutlined style={{ color: '#bfbfbf' }} />}
              placeholder="your-email@example.com"
            />
          </Form.Item>
          <Form.Item
            name="password"
            label={t('Password')}
            rules={[{ required: true, message: t('Please enter your password') }]}
          >
            <Input.Password
              prefix={<LockOutlined style={{ color: '#bfbfbf' }} />}
              placeholder={t('Enter your password')}
            />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block size="large" style={{ height: 44, fontWeight: 600 }}>
              {t('Sign In')}
            </Button>
          </Form.Item>
        </Form>
        <div style={{ textAlign: 'center', marginTop: 16, color: '#8c8c8c' }}>
          {t("Don't have an account?")}{' '}
          <Link to="/register" style={{ fontWeight: 500 }}>{t('Sign up')}</Link>
        </div>
      </Card>
    </div>
  )
}
