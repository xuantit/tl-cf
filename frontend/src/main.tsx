import { StrictMode } from 'react'
import { useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { ConfigProvider, theme as antdTheme, App as AntApp } from 'antd'
import viVN from 'antd/locale/vi_VN'
import enUS from 'antd/locale/en_US'
import { useTranslation } from 'react-i18next'
import './i18n'
import './index.css'
import App from './App.tsx'
import { useThemeStore } from './stores/useThemeStore'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
})

function ThemedApp() {
  const dark = useThemeStore((s) => s.dark)
  const { i18n } = useTranslation()

  useEffect(() => {
    document.body.style.background = dark ? '#101014' : '#f7f7f8'
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
    document.body.classList.toggle('dark', dark)
  }, [dark])

  return (
    <ConfigProvider
      locale={i18n.language === 'vi' ? viVN : enUS}
      theme={{
        algorithm: dark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        token: {
          colorPrimary: '#f6821f',
          borderRadius: 10,
          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          colorBgLayout: dark ? '#101014' : '#f7f7f8',
          colorBgContainer: dark ? '#17171c' : '#ffffff',
          colorBorderSecondary: dark ? '#26262e' : '#eaeaef',
        },
        components: {
          Card: { boxShadowTertiary: 'none' },
          Table: { headerBg: dark ? '#1c1c22' : '#fafafb', headerSplitColor: 'transparent' },
          Menu: {
            itemBorderRadius: 8,
            itemSelectedBg: 'rgba(246,130,31,0.12)',
            itemSelectedColor: '#f6821f',
            itemMarginInline: 8,
          },
          Layout: {
            siderBg: dark ? '#17171c' : '#ffffff',
            headerBg: dark ? 'rgba(23,23,28,0.8)' : 'rgba(255,255,255,0.8)',
          },
          Button: { fontWeight: 500 },
        },
      }}
    >
      <AntApp>
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
