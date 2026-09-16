import { useEffect, useRef, useState } from 'react'
import { Alert, Button } from 'antd'
import { useTranslation } from 'react-i18next'
import { api } from '../services/api'
import { loadTurnstile, type TurnstileApi } from '../lib/turnstile'

export default function TurnstileChallenge({ action, generation, onToken }: {
  action: 'register' | 'verify_email'
  generation: number
  onToken: (value: string | null) => void
}) {
  const { t } = useTranslation()
  const container = useRef<HTMLDivElement>(null)
  const [error, setError] = useState(false)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    let widgetId: string | undefined
    let widgetApi: TurnstileApi | undefined
    onToken(null)
    const fail = () => { if (!controller.signal.aborted) { onToken(null); setError(true) } }
    void (async () => {
      try {
        const { data } = await api.get<{ enabled: boolean; siteKey: string | null }>('/auth/turnstile', { signal: controller.signal })
        if (controller.signal.aborted) return
        setError(false)
        if (data.enabled === false) { onToken(''); return }
        if (data.enabled !== true || !data.siteKey) { fail(); return }
        widgetApi = await loadTurnstile()
        if (controller.signal.aborted || !container.current) return
        widgetId = widgetApi.render(container.current, {
          sitekey: data.siteKey, action, theme: 'auto', size: 'flexible',
          callback: (token) => { if (!controller.signal.aborted) { setError(false); onToken(token) } },
          'expired-callback': fail,
          'error-callback': fail,
        })
      } catch { fail() }
    })()
    return () => {
      controller.abort()
      if (widgetId && widgetApi) widgetApi.remove(widgetId)
    }
  }, [action, generation, retry, onToken])
  return <div className="my-3" aria-label={t('Anti-bot verification')}>
    <div ref={container} />
    {error && <Alert type="warning" showIcon title={t('Anti-bot verification unavailable or expired. Please retry.')}
      action={<Button size="small" onClick={() => setRetry((value) => value + 1)}>{t('Retry')}</Button>} />}
  </div>
}