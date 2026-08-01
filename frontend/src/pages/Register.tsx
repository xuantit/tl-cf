import { useState } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import { Form, Input, Button, Alert, message } from 'antd'
import { useTranslation } from 'react-i18next'
import { api } from '../services/api'
import { StrengthMeter, Tag } from '../components/ui'

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[11px] uppercase tracking-[.09em] text-fg-3">{children}</span>
  )
}

export default function Register() {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [form] = Form.useForm<{ email: string; password: string; inviteCode: string }>()
  const password = Form.useWatch('password', form) || ''

  const onFinish = async (v: { email: string; password: string; inviteCode: string }) => {
    setLoading(true)
    setErr('')
    try {
      await api.post('/auth/register', v)
      message.success(t('Registration successful! Please sign in.'))
      setTimeout(() => navigate('/login'), 1200)
    } catch (e: unknown) {
      setErr((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || t('Registration failed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-bg-app p-5">
      <div className="fade-in w-[352px] max-w-full rounded-xl border border-solid border-stroke bg-bg p-[26px_24px] shadow-[0_8px_30px_-12px_rgb(0_0_0/.12)]">
        <div className="mb-5 flex items-center gap-2">
          <div className="grid h-6 w-6 flex-none place-items-center rounded-[6px] bg-accent text-[13px] text-white">
            ☁
          </div>
          <div className="font-mono text-[13px] font-semibold text-fg">CF Tool</div>
          <Tag className="ml-auto">v2</Tag>
        </div>
        <div className="text-[15px] font-semibold tracking-[-.02em] text-fg">{t('Sign up')}</div>
        <div className="mt-[3px] mb-[18px] font-mono text-[11.5px] text-fg-3">
          {t('An invite code from an admin is required')}
        </div>
        {err && (
          <Alert
            message={err}
            type="error"
            showIcon
            closable
            onClose={() => setErr('')}
            style={{ marginBottom: 14 }}
          />
        )}
        <Form
          form={form}
          onFinish={onFinish}
          layout="vertical"
          requiredMark={false}
          initialValues={{ inviteCode: searchParams.get('invite') || '' }}
        >
          <Form.Item
            name="inviteCode"
            label={<FieldLabel>{t('Invite code')}</FieldLabel>}
            rules={[{ required: true, message: t('An invite code is required to sign up') }]}
            style={{ marginBottom: 11 }}
          >
            <Input placeholder="CF-XXXXX-XXXXX" className="font-mono" />
          </Form.Item>
          <Form.Item
            name="email"
            label={<FieldLabel>Email</FieldLabel>}
            rules={[
              { required: true, type: 'email', message: t('Please enter a valid email') },
              { min: 5, message: t('Email must be at least 5 characters') }
            ]}
            style={{ marginBottom: 11 }}
          >
            <Input placeholder="your-email@example.com" className="font-mono" />
          </Form.Item>
          <Form.Item
            name="password"
            label={<FieldLabel>{t('Password')}</FieldLabel>}
            rules={[
              { required: true, message: t('Please enter your password') },
              { min: 8, message: t('Password must be at least 8 characters') }
            ]}
            style={{ marginBottom: 0 }}
          >
            <Input.Password placeholder={t('At least 8 characters')} className="font-mono" />
          </Form.Item>
          <StrengthMeter password={password} />
          <Form.Item style={{ marginBottom: 0 }}>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              block
              style={{ height: 32, marginTop: 14 }}
            >
              {t('Create Account')} →
            </Button>
          </Form.Item>
        </Form>
        <div className="mt-4 flex items-center gap-2 font-mono text-[11px] text-fg-3">
          <span>{t('Already have an account?')}</span>
          <Link to="/login" className="ml-auto text-accent no-underline hover:text-accent-hover">
            {t('Sign in')} →
          </Link>
        </div>
      </div>
    </div>
  )
}
