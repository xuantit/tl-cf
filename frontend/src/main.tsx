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
    document.body.style.background = dark ? '#0a0a0a' : '#ffffff'
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
          colorLink: '#0070f3',
          // Vercel-style: tight radius family, borders over shadows
          borderRadius: 6,
          borderRadiusLG: 8,
          borderRadiusSM: 4,
          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          fontSize: 14,
          colorBgLayout: dark ? '#0a0a0a' : '#ffffff',
          colorBgContainer: dark ? '#111111' : '#ffffff',
          colorBorderSecondary: dark ? '#26262e' : '#eaeaea',
          colorTextSecondary: dark ? '#a1a1aa' : '#666666',
          boxShadow: 'none',
          boxShadowSecondary:
            '0 1px 1px rgba(0,0,0,0.02), 0 4px 8px -4px rgba(0,0,0,0.04), 0 16px 24px -8px rgba(0,0,0,0.06)',
        },
        components: {
          Card: { boxShadowTertiary: 'none', borderRadiusLG: 8, paddingLG: 24 },
          Modal: { borderRadiusLG: 8 },
          Table: {
            headerBg: 'transparent',
            headerSplitColor: 'transparent',
            headerColor: dark ? '#a1a1aa' : '#666666',
            cellPaddingBlock: 12,
            rowHoverBg: dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
          },
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
          Tabs: { horizontalMargin: '0 0 12px 0' },
          Form: { labelColor: dark ? '#e4e4e7' : '#171717', verticalLabelPadding: '0 0 6px' },
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
