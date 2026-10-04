import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface ThemeState {
  dark: boolean
  toggle: () => void
  setDark: (d: boolean) => void
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      // New visitors start with the cinematic palette; persisted choices win.
      dark: true,
      toggle: () => set((s) => ({ dark: !s.dark })),
      setDark: (dark) => set({ dark }),
    }),
    {
      name: 'app-theme',
    },
  ),
)
