import axios from 'axios'
import { useAuthStore } from '../stores/useAuthStore'
import { useAccountStore } from '../stores/useAccountStore'

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:9000/api',
  headers: { 'Content-Type': 'application/json' },
})

// Endpoints that operate on the currently selected Cloudflare account.
// The active accountId is injected automatically as a query param.
const ACCOUNT_SCOPED = ['/domains', '/cf/test', '/templates', '/rules', '/changes']

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
