import axios, { isAxiosError } from 'axios'
import { useAuthStore } from '../stores/useAuthStore'
import { useAccountStore } from '../stores/useAccountStore'

/** Extracts the backend error `detail` from an unknown error without `any` casts. */
export function apiErrorDetail(error: unknown): string | undefined {
  if (isAxiosError<{ detail?: string }>(error)) {
    const detail = error.response?.data?.detail
    if (typeof detail === 'string') return detail
  }
  return undefined
}

/** Extracts the backend error envelope `code` (e.g. ANALYTICS_PERMISSION_MISSING). */
export function apiErrorCode(error: unknown): string | undefined {
  if (isAxiosError<{ code?: string }>(error)) {
    const code = error.response?.data?.code
    if (typeof code === 'string') return code
  }
  return undefined
}

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:9000/api',
  headers: { 'Content-Type': 'application/json' },
})

// Endpoints that operate on the currently selected Cloudflare account.
// The active accountId is injected automatically as a query param.
const ACCOUNT_SCOPED = [
  '/domains',
  '/cf/test',
  '/templates',
  '/rules',
  '/changes',
  '/analytics',
  '/dashboard',
  '/tags',
]

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) config.headers.Authorization = `Bearer ${token}`

  const url = config.url || ''
  const activeAccountId = useAccountStore.getState().activeAccountId
  const isAccountScoped = ACCOUNT_SCOPED.some((p) => url === p || url.startsWith(p))
  if (activeAccountId && isAccountScoped) {
    config.params = { accountId: activeAccountId, ...(config.params || {}) }
  }
  return config
})

api.interceptors.response.use(
  (r) => r,
  (e) => {
    if (e.response?.status === 401) useAuthStore.getState().setToken(null)
    // Tài khoản bị admin khoá → đăng xuất ngay
    if (e.response?.status === 403 && e.response?.data?.detail === 'Tài khoản đã bị khoá') {
      useAuthStore.getState().setToken(null)
    }
    return Promise.reject(e)
  }
)
