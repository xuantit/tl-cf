export interface TurnstileApi {
  render(container: HTMLElement, options: {
    sitekey: string; action: string; theme: string; size: string;
    callback: (token: string) => void;
    'expired-callback': () => void;
    'error-callback': () => void;
  }): string
  remove(id: string): void
}
declare global { interface Window { turnstile?: TurnstileApi } }

let loading: Promise<TurnstileApi> | undefined
export function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  if (loading) return loading
  loading = new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    script.async = true
    const fail = () => { clearTimeout(timer); script.remove(); loading = undefined; reject(new Error('Turnstile script unavailable')) }
    const timer = setTimeout(fail, 15000)
    script.onerror = fail
    script.onload = () => {
      if (!window.turnstile) { fail(); return }
      clearTimeout(timer)
      resolve(window.turnstile)
    }
    document.head.appendChild(script)
  })
  return loading
}