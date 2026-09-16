import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Form, Input, Button, Alert } from 'antd'
import { useTranslation } from 'react-i18next'
import { api, apiErrorDetail } from '../services/api'
import AuthCard from '../components/AuthCard'
import TurnstileChallenge from '../components/TurnstileChallenge'

export default function Register() {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)
  const submitting = useRef(false)
  const [err, setErr] = useState('')
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const [challengeGeneration, setChallengeGeneration] = useState(0)
  const [sentEmail, setSentEmail] = useState('')
  const [cooldown, setCooldown] = useState(0)
  const coolingDown = cooldown > 0
  const [form] = Form.useForm<{ email: string }>()

  useEffect(() => {
    if (!coolingDown) return
    const timer = setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1000)
    return () => clearInterval(timer)
  }, [coolingDown])

  const onFinish = async ({ email }: { email: string }) => {
    if (submitting.current) return
    if (turnstileToken === null) { setErr(t('Please complete anti-bot verification')); return }
    submitting.current = true
    setLoading(true)
    setErr('')
    try {
      const normalizedEmail = email.trim().toLowerCase()
      const { data } = await api.post<{ retryAfter: number }>('/auth/register', {
        email: normalizedEmail, ...(turnstileToken ? { turnstileToken } : {}),
      })
      setSentEmail(normalizedEmail)
      setCooldown(data.retryAfter || 60)
    } catch (e: unknown) {
      setErr(apiErrorDetail(e) || t('Registration failed'))
    } finally {
      setTurnstileToken(null)
      setChallengeGeneration((value) => value + 1)
      submitting.current = false
      setLoading(false)
    }
  }

  return (
    <AuthCard
      title={t(sentEmail ? 'Check your email' : 'Sign up with email')}
      description={t('No invite code needed. Verify your email, then choose a password to create your account.')}
    >
        {err && (
          <Alert
            title={err}
            type="error"
            showIcon
            closable
            onClose={() => setErr('')}
            style={{ marginBottom: 14 }}
          />
        )}
        <TurnstileChallenge action="register" generation={challengeGeneration} onToken={setTurnstileToken} />
        {sentEmail ? (
          <div className="space-y-4">
            <Alert
              type="success"
              showIcon
              title={t('Check your inbox and spam folder')}
              description={t('If {{email}} is eligible and within sending limits, a verification email will arrive shortly. Links expire 30 minutes after the first request; resending does not extend them.', { email: sentEmail })}
            />
            <p className="text-[12px] leading-relaxed text-fg-3">{t('Already registered? Sign in instead. Your password will not be changed.')}</p>
            <Button block loading={loading} disabled={coolingDown || turnstileToken === null} onClick={() => onFinish({ email: sentEmail })}>
              {coolingDown ? t('Resend in {{seconds}}s', { seconds: cooldown }) : t('Resend verification email')}
            </Button>
            <Button type="text" block disabled={loading} onClick={() => { setSentEmail(''); setErr('') }}>
              {t('Use a different email')}
            </Button>
          </div>
        ) : (
        <Form
          form={form}
          onFinish={onFinish}
          layout="vertical"
          requiredMark={false}
        >
          <Form.Item
            name="email"
            label="Email"
            normalize={(value: string) => value.trim()}
            rules={[
              { required: true, type: 'email', message: t('Please enter a valid email') },
              { max: 254 }
            ]}
            style={{ marginBottom: 11 }}
          >
            <Input type="email" autoComplete="email" placeholder="your-email@example.com" className="font-mono" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              disabled={turnstileToken === null}
              block
              style={{ height: 32, marginTop: 14 }}
            >
              {t('Send verification email')} →
            </Button>
          </Form.Item>
        </Form>
        )}
        <div className="mt-4 flex items-center gap-2 font-mono text-[11px] text-fg-3">
          <span>{t('Already have an account?')}</span>
          <Link to="/login" className="ml-auto text-accent no-underline hover:text-accent-hover">
            {t('Sign in')} →
          </Link>
        </div>
    </AuthCard>
  )
}
