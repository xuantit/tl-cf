import { StrictMode } from 'react'
import { useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { ConfigProvider, App as AntApp } from 'antd'
import viVN from 'antd/locale/vi_VN'
import enUS from 'antd/locale/en_US'
import { useTranslation } from 'react-i18next'
import './i18n'
import './index.css'
import App from './App.tsx'
import { initializeThemeSync, useThemeStore } from './stores/useThemeStore'
import { useUiPrefStore } from './stores/useUiPrefStore'
import { setAntdApp } from './lib/antdApp'
import { getAppTheme } from './lib/antdTheme'

initializeThemeSync()

// Binds context-aware message/modal/notification instances so they follow the
// dynamic theme (and avoid antd's "Static function can not consume context" warning).
function AntdAppBridge() {
  setAntdApp(AntApp.useApp())
  return null
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
})

// Exported so react-refresh can track this component (entry file)
export function ThemedApp() {
  const dark = useThemeStore((s) => s.dark)
  const density = useUiPrefStore((s) => s.density)
  const { i18n } = useTranslation()

  // Table density preference (Settings → Giao diện) — tables pick it up via CSS in App.css.
  useEffect(() => {
    document.body.classList.remove('density-compact', 'density-comfortable', 'density-spacious')
    document.body.classList.add(`density-${density}`)
  }, [density])

  return (
    <ConfigProvider
      locale={i18n.language === 'vi' ? viVN : enUS}
      theme={getAppTheme(dark)}
    >
      <AntApp>
        <AntdAppBridge />
        <App />
      </AntApp>
    </ConfigProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ThemedApp />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
