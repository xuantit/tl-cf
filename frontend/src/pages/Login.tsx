import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Form, Input, Button, Alert } from 'antd'
import { useTranslation } from 'react-i18next'
import { api } from '../services/api'
import { useAuthStore } from '../stores/useAuthStore'
import { Tag } from '../components/ui'

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[11px] uppercase tracking-[.09em] text-fg-3">{children}</span>
  )
}

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
    <div className="grid min-h-screen place-items-center bg-bg-app p-5">
      <div className="fade-in w-[340px] max-w-full rounded-xl border border-solid border-stroke bg-bg p-[26px_24px] shadow-[0_8px_30px_-12px_rgb(0_0_0/.12)]">
        <div className="mb-5 flex items-center gap-2">
          <div className="grid h-6 w-6 flex-none place-items-center rounded-[6px] bg-accent text-[13px] text-white">
            ☁
          </div>
          <div className="font-mono text-[13px] font-semibold text-fg">CF Tool</div>
          <Tag className="ml-auto">v2</Tag>
        </div>
        <div className="text-[15px] font-semibold tracking-[-.02em] text-fg">{t('Sign In')}</div>
        <div className="mt-[3px] mb-[18px] font-mono text-[11.5px] text-fg-3">
          {t('Cloudflare admin console')}
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
        <Form onFinish={onFinish} layout="vertical" requiredMark={false}>
          <Form.Item
            name="email"
            label={<FieldLabel>Email</FieldLabel>}
            rules={[{ required: true, type: 'email', message: t('Please enter a valid email') }]}
            style={{ marginBottom: 11 }}
          >
            <Input placeholder="your-email@example.com" className="font-mono" autoFocus />
          </Form.Item>
          <Form.Item
            name="password"
            label={<FieldLabel>{t('Password')}</FieldLabel>}
            rules={[{ required: true, message: t('Please enter your password') }]}
            style={{ marginBottom: 11 }}
          >
            <Input.Password placeholder="••••••••••••" className="font-mono" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              block
              style={{ height: 32, marginTop: 6 }}
            >
              {t('Sign In')} →
            </Button>
          </Form.Item>
        </Form>
        <div className="mt-4 flex items-center gap-2 font-mono text-[11px] text-fg-3">
          <span>{t("Don't have an account?")}</span>
          <Link to="/register" className="ml-auto text-accent no-underline hover:text-accent-hover">
            {t('Sign up')} →
          </Link>
        </div>
      </div>
    </div>
  )
}
