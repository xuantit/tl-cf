import { useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Alert, Button, Form, Input } from 'antd'
import { useTranslation } from 'react-i18next'
import { api, apiErrorDetail } from '../services/api'
import AuthCard from '../components/AuthCard'
import TurnstileChallenge from '../components/TurnstileChallenge'
import { StrengthMeter } from '../components/ui'

export default function VerifyEmail() {
  const { t } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()
  const token = new URLSearchParams(location.hash.slice(1)).get('token') || ''
  const validToken = /^[a-f0-9]{64}$/.test(token)
  const [loading, setLoading] = useState(false)
  const submitting = useRef(false)
  const [err, setErr] = useState('')
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const [challengeGeneration, setChallengeGeneration] = useState(0)
  const [complete, setComplete] = useState(false)
  const [form] = Form.useForm<{ password: string; confirmPassword: string }>()
  const password = Form.useWatch('password', form) || ''

  const onFinish = async ({ password }: { password: string }) => {
    if (submitting.current) return
    if (turnstileToken === null) { setErr(t('Please complete anti-bot verification')); return }
    submitting.current = true
    setLoading(true)
    setErr('')
    try {
      await api.post('/auth/verify-email', { token, password, ...(turnstileToken ? { turnstileToken } : {}) })
      setComplete(true)
      form.resetFields()
      // Remove the consumed token from the current history entry.
      navigate('/verify-email', { replace: true })
    } catch (error) {
      setErr(apiErrorDetail(error) || t('Email verification failed'))
    } finally {
      setTurnstileToken(null)
      setChallengeGeneration((value) => value + 1)
      submitting.current = false
      setLoading(false)
    }
  }

  return (
    <AuthCard
      title={t(complete ? 'Email verified' : 'Complete your registration')}
      description={t(complete ? 'Your account is ready. You can now sign in.' : 'Choose a password to verify your email and create your account.')}
    >
      {complete ? (
        <Link to="/login"><Button type="primary" block>{t('Sign in')} →</Button></Link>
      ) : !validToken ? (
        <Alert type="warning" showIcon title={t('Missing or invalid verification link')} description={t('Open the link from your email, or request a new one.')} />
      ) : (
        <>
          {err && <Alert type="error" showIcon title={err} style={{ marginBottom: 16 }} />}
          <Form form={form} layout="vertical" requiredMark={false} onFinish={onFinish}>
            <Form.Item name="password" label={t('Password')} rules={[
              { required: true, message: t('Please enter your password') },
              { min: 8, message: t('Password must be at least 8 characters') },
              { validator: (_, value: string) => !value || new TextEncoder().encode(value).length <= 72
                ? Promise.resolve() : Promise.reject(new Error(t('Password must not exceed 72 bytes'))) },
            ]}>
              <Input.Password autoComplete="new-password" placeholder={t('At least 8 characters')} />
            </Form.Item>
            <StrengthMeter password={password} />
            <Form.Item name="confirmPassword" label={t('Confirm password')} dependencies={['password']} rules={[
              { required: true, message: t('Please confirm your password') },
              ({ getFieldValue }) => ({ validator: (_, value: string) => !value || getFieldValue('password') === value
                ? Promise.resolve() : Promise.reject(new Error(t('Passwords do not match'))) }),
            ]}>
              <Input.Password autoComplete="new-password" />
            </Form.Item>
            <TurnstileChallenge action="verify_email" generation={challengeGeneration} onToken={setTurnstileToken} />
            <Button type="primary" htmlType="submit" block loading={loading} disabled={turnstileToken === null}>{t('Verify email and create account')} →</Button>
          </Form>
        </>
      )}
      {!complete && <div className="mt-5 text-center text-[12px]"><Link to="/register">{t('Request a new verification email')}</Link></div>}
    </AuthCard>
  )
}