import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

interface ThemeState {
  dark: boolean
  toggle: () => void
  setDark: (d: boolean) => void
}

function storedDark(value: unknown): boolean {
  if (value && typeof value === 'object' && 'dark' in value && typeof value.dark === 'boolean') return value.dark
  return true
}

// Blocked storage must not stop rendering or switching the current tab's theme.
const safeStorage = {
  getItem: (key: string) => { try { return localStorage.getItem(key) } catch { return null } },
  setItem: (key: string, value: string) => { try { localStorage.setItem(key, value) } catch { /* In-memory mode. */ } },
  removeItem: (key: string) => { try { localStorage.removeItem(key) } catch { /* In-memory mode. */ } },
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
      storage: createJSONStorage(() => safeStorage),
      partialize: ({ dark }) => ({ dark }),
      merge: (saved, current) => ({ ...current, dark: storedDark(saved) }),
    },
  ),
)

function applyTheme(dark: boolean) {
  document.documentElement.classList.toggle('dark', dark)
  // Keep body.dark for existing integrations; html.dark also covers portals and the first paint.
  document.body.classList.toggle('dark', dark)
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
  document.documentElement.style.backgroundColor = dark ? '#191b24' : '#f3f4f8'
}

let stopSync: (() => void) | undefined

/** Called once before React mounts, not after paint. Returns cleanup for tests/HMR. */
export function initializeThemeSync() {
  if (stopSync) return stopSync
  applyTheme(useThemeStore.getState().dark)
  const unsubscribe = useThemeStore.subscribe((state) => applyTheme(state.dark))
  const onStorage = (event: StorageEvent) => {
    if (event.key !== 'app-theme' && event.key !== null) return
    let dark = true
    try { dark = storedDark(JSON.parse(event.newValue || 'null')?.state) } catch { /* Default on corrupt storage. */ }
    if (dark !== useThemeStore.getState().dark) useThemeStore.setState({ dark })
  }
  window.addEventListener('storage', onStorage)
  stopSync = () => {
    unsubscribe()
    window.removeEventListener('storage', onStorage)
    stopSync = undefined
  }
  return stopSync
}

if (import.meta.hot) import.meta.hot.dispose(() => stopSync?.())
