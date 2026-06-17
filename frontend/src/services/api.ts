import axios from 'axios'
import { useAuthStore } from '../stores/useAuthStore'

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:9000/api',
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (r) => r,
  (e) => {
    if (e.response?.status === 401) useAuthStore.getState().setToken(null)
    return Promise.reject(e)
  }
)
