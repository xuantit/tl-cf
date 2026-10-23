import { BulbFilled, BulbOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useThemeStore } from '../stores/useThemeStore'

export default function ThemeToggle() {
  const { t } = useTranslation()
  const dark = useThemeStore((state) => state.dark)
  const toggle = useThemeStore((state) => state.toggle)
  const label = dark ? t('Light mode') : t('Dark mode')
  return <button type="button" className="console-theme-toggle" onClick={toggle} aria-label={label} title={label}>
    {dark ? <BulbFilled /> : <BulbOutlined />}
  </button>
}