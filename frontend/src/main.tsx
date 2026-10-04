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
          colorPrimary: dark ? '#f4d675' : '#946500',
          colorLink: dark ? '#a9c2ff' : '#365bb5',
          borderRadius: 10,
          borderRadiusLG: 16,
          borderRadiusSM: 6,
          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          fontSize: 14,
          controlHeight: 36,
          colorBgLayout: dark ? '#191b24' : '#f3f4f8',
          colorBgContainer: dark ? '#212430' : '#ffffff',
          colorBgElevated: dark ? '#292d3b' : '#ffffff',
          colorBorder: dark ? '#34394a' : '#dfe3ed',
          colorSplit: dark ? '#2c3040' : '#eceef4',
          colorBorderSecondary: dark ? '#2c3040' : '#eceef4',
          colorText: dark ? '#f3f4f8' : '#202433',
          colorTextSecondary: dark ? '#c0c6d5' : '#535e74',
          colorTextTertiary: dark ? '#9da6bc' : '#68738a',
          boxShadow: 'none',
          boxShadowSecondary:
            '0 1px 1px rgba(0,0,0,0.02), 0 4px 8px -4px rgba(0,0,0,0.04), 0 16px 24px -8px rgba(0,0,0,0.06)',
        },
        components: {
          Card: { boxShadowTertiary: 'none', borderRadiusLG: 16, paddingLG: 24 },
          Modal: { borderRadiusLG: 18 },
          Drawer: { borderRadiusLG: 16 },
          Table: {
            headerBg: dark ? '#252937' : '#f8f9fc',
            headerSplitColor: 'transparent',
            headerColor: dark ? '#9da6bc' : '#68738a',
            cellPaddingBlock: 10,
            cellPaddingInline: 14,
            fontSize: 13,
            rowHoverBg: dark ? '#2b3040' : '#f0f2f8',
          },
          Menu: {
            itemBorderRadius: 10,
            itemSelectedBg: dark ? '#363126' : '#fff0c4',
            itemSelectedColor: dark ? '#f4d675' : '#946500',
            itemMarginInline: 8,
          },
          Layout: {
            siderBg: dark ? '#151720' : '#fafbfe',
            headerBg: dark ? '#191b24' : '#f3f4f8',
          },
          Button: { fontWeight: 600, fontSize: 13, primaryColor: dark ? '#202433' : '#ffffff' },
          Tabs: { horizontalMargin: '0 0 12px 0' },
          Form: { labelColor: dark ? '#f3f4f8' : '#202433', verticalLabelPadding: '0 0 6px' },
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
