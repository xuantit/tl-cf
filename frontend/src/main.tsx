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
import { useUiPrefStore } from './stores/useUiPrefStore'
import { setAntdApp } from './lib/antdApp'

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

  useEffect(() => {
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
    document.body.classList.toggle('dark', dark)
  }, [dark])

  // Table density preference (Settings → Giao diện) — tables pick it up via CSS in App.css.
  useEffect(() => {
    document.body.classList.remove('density-compact', 'density-comfortable', 'density-spacious')
    document.body.classList.add(`density-${density}`)
  }, [density])

  return (
    <ConfigProvider
      locale={i18n.language === 'vi' ? viVN : enUS}
      theme={{
        algorithm: dark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        token: {
          colorPrimary: '#f6821f',
          colorLink: '#0070f3',
          // Console 1a: tight radius family, borders over shadows, dense controls
          borderRadius: 6,
          borderRadiusLG: 8,
          borderRadiusSM: 4,
          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          fontSize: 14,
          controlHeight: 30,
          colorBgLayout: dark ? '#08090b' : '#f6f6f7',
          colorBgContainer: dark ? '#0d0e11' : '#ffffff',
          colorBorder: dark ? '#22242a' : '#e7e7ea',
          colorSplit: dark ? '#1a1c21' : '#f0f0f2',
          colorBorderSecondary: dark ? '#1a1c21' : '#f0f0f2',
          colorText: dark ? '#f0f1f3' : '#101114',
          colorTextSecondary: dark ? '#aab0ba' : '#4d525a',
          colorTextTertiary: dark ? '#7f8591' : '#767c86',
          boxShadow: 'none',
          boxShadowSecondary:
            '0 1px 1px rgba(0,0,0,0.02), 0 4px 8px -4px rgba(0,0,0,0.04), 0 16px 24px -8px rgba(0,0,0,0.06)',
        },
        components: {
          Card: { boxShadowTertiary: 'none', borderRadiusLG: 8, paddingLG: 24 },
          Modal: { borderRadiusLG: 12 },
          Drawer: { borderRadiusLG: 12 },
          Table: {
            headerBg: 'transparent',
            headerSplitColor: 'transparent',
            headerColor: dark ? '#7f8591' : '#767c86',
            cellPaddingBlock: 7,
            cellPaddingInline: 10,
            fontSize: 13,
            rowHoverBg: dark ? '#15171b' : '#f7f7f8',
          },
          Menu: {
            itemBorderRadius: 6,
            itemSelectedBg: dark ? '#2a1a09' : '#fff2e5',
            itemSelectedColor: '#f6821f',
            itemMarginInline: 8,
          },
          Layout: {
            siderBg: dark ? '#0a0b0e' : '#fbfbfc',
            headerBg: dark ? 'rgba(13,14,17,0.8)' : 'rgba(255,255,255,0.8)',
          },
          Button: { fontWeight: 500, fontSize: 13 },
          Tabs: { horizontalMargin: '0 0 12px 0' },
          Form: { labelColor: dark ? '#f0f1f3' : '#101114', verticalLabelPadding: '0 0 6px' },
        },
      }}
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
