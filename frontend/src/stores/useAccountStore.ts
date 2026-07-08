import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface AccountState {
  activeAccountId: string | null
  setActiveAccountId: (id: string | null) => void
}

export const useAccountStore = create<AccountState>()(
  persist(
    (set) => ({
      activeAccountId: null,
      setActiveAccountId: (activeAccountId) => set({ activeAccountId }),
    }),
    {
      name: 'active-account',
      partialize: (state) => ({ activeAccountId: state.activeAccountId }),
    },
  ),
)
