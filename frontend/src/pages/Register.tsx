import { useState } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import { Form, Input, Button, Card, Alert } from 'antd'
import { UserOutlined, LockOutlined, CloudOutlined, KeyOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { api } from '../services/api'
import '../App.css'

export default function Register() {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const onFinish = async (v: { email: string; password: string; inviteCode: string }) => {
    setLoading(true)
    setErr('')
    try {
      await api.post('/auth/register', v)
      navigate('/login')
    } catch (e: unknown) {
      setErr((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || t('Registration failed'))
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
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>{t('Create Account')}</div>
          <div style={{ fontSize: 14, color: '#8c8c8c', marginTop: 4 }}>{t('Sign up to get started')}</div>
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
        <Form
          onFinish={onFinish}
          layout="vertical"
          size="large"
          initialValues={{ inviteCode: searchParams.get('invite') || '' }}
        >
          <Form.Item
            name="inviteCode"
            label={t('Invite code')}
            rules={[{ required: true, message: t('An invite code is required to sign up') }]}
          >
            <Input
              prefix={<KeyOutlined style={{ color: '#bfbfbf' }} />}
              placeholder="CF-XXXXX-XXXXX"
            />
          </Form.Item>
          <Form.Item
            name="email"
            label="Email"
            rules={[
              { required: true, type: 'email', message: t('Please enter a valid email') },
              { min: 5, message: t('Email must be at least 5 characters') }
            ]}
          >
            <Input
              prefix={<UserOutlined style={{ color: '#bfbfbf' }} />}
              placeholder="your-email@example.com"
            />
          </Form.Item>
          <Form.Item
            name="password"
            label={t('Password')}
            rules={[
              { required: true, message: t('Please enter your password') },
              { min: 8, message: t('Password must be at least 8 characters') }
            ]}
          >
            <Input.Password
              prefix={<LockOutlined style={{ color: '#bfbfbf' }} />}
              placeholder={t('At least 8 characters')}
            />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block size="large" style={{ height: 44, fontWeight: 600 }}>
              {t('Create Account')}
            </Button>
          </Form.Item>
        </Form>
        <div style={{ textAlign: 'center', marginTop: 16, color: '#8c8c8c' }}>
          {t('Already have an account?')}{' '}
          <Link to="/login" style={{ fontWeight: 500 }}>{t('Sign in')}</Link>
        </div>
      </Card>
    </div>
  )
}
