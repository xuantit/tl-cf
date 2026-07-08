import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useAccountStore } from './useAccountStore'

interface AuthState {
  token: string | null
  setToken: (t: string | null) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      setToken: (token) => {
        // Token change = different user session: drop the previous user's selected CF account
        useAccountStore.getState().setActiveAccountId(null)
        set({ token })
      },
    }),
    {
      name: 'auth-token',
      partialize: (state) => ({ token: state.token }),
    },
  ),
)

/** Đọc role từ JWT payload (không verify — chỉ dùng để ẩn/hiện UI, backend vẫn enforce) */
export function getRoleFromToken(token: string | null): string | null {
  if (!token) return null
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    return typeof payload.role === 'string' ? payload.role : null
  } catch {
    return null
  }
}

/** Đọc userId từ JWT payload (không verify — chỉ dùng cho UI) */
export function getUserIdFromToken(token: string | null): string | null {
  if (!token) return null
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    return typeof payload.userId === 'string' ? payload.userId : null
  } catch {
    return null
  }
}

/** Đọc email từ JWT payload (không verify — chỉ dùng cho UI) */
export function getEmailFromToken(token: string | null): string | null {
  if (!token) return null
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    return typeof payload.email === 'string' ? payload.email : null
  } catch {
    return null
  }
}

