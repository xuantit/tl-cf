import { useEffect } from 'react'
import { ConfigProvider, App as AntApp } from 'antd'
import viVN from 'antd/locale/vi_VN'
import enUS from 'antd/locale/en_US'
import { useTranslation } from 'react-i18next'
import App from './App.tsx'
import { useThemeStore } from './stores/useThemeStore'
import { buildAntdTheme, mobileTokenOverride } from './theme/antdTheme'
import { useIsMobile } from './hooks/useIsMobile'

/** Stable empty theme object — extracted to avoid re-renders on every render cycle */
const EMPTY_THEME = {}

export default function ThemedApp() {
  const dark = useThemeStore((s) => s.dark)
  const { i18n } = useTranslation()
  const isMobile = useIsMobile()

  useEffect(() => {
    document.body.style.background = dark ? '#0a0a0a' : '#ffffff'
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
    document.body.classList.toggle('dark', dark)
  }, [dark])

  return (
    <ConfigProvider
      locale={i18n.language === 'vi' ? viVN : enUS}
      theme={buildAntdTheme(dark)}
    >
      {/* Nested provider overrides touch target size on mobile */}
      <ConfigProvider theme={isMobile ? mobileTokenOverride : EMPTY_THEME}>
        <AntApp>
          <App />
        </AntApp>
      </ConfigProvider>
    </ConfigProvider>
  )
}
