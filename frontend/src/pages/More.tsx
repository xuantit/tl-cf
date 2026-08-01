import { Button, Switch } from 'antd'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthStore, getRoleFromToken, getEmailFromToken } from '../stores/useAuthStore'
import { useThemeStore } from '../stores/useThemeStore'
import { SectionHeader, Tag } from '../components/ui'

function MoreRow({ to, icon, label, meta }: { to: string; icon: string; label: string; meta?: string }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-[11px] border-b border-stroke-2 px-[14px] py-[9px] transition-colors active:bg-bg-hover"
    >
      <span className="w-4 text-center !text-fg-2">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] !text-fg">{label}</span>
        {meta && <span className="mt-[2px] block font-mono text-[11px] text-fg-3">{meta}</span>}
      </span>
      <span className="text-[13px] !text-fg-3">›</span>
    </Link>
  )
}

/** Mobile "More" menu page (.mnav → Thêm): links + settings + logout. */
export default function More() {
  const { t, i18n } = useTranslation()
  const token = useAuthStore((s) => s.token)
  const setToken = useAuthStore((s) => s.setToken)
  const isAdmin = getRoleFromToken(token) === 'admin'
  const email = getEmailFromToken(token)
  const dark = useThemeStore((s) => s.dark)
  const toggleTheme = useThemeStore((s) => s.toggle)

  return (
    <div className="fade-in mx-auto max-w-[560px]">
      <div className="px-[14px] pt-[8px] pb-[9px]">
        <h1 className="text-[19px] font-semibold tracking-[-0.02em]">{t('More')}</h1>
        <div className="mt-[2px] font-mono text-[11.5px] text-fg-3">
          {email}
          {isAdmin ? ' · admin' : ''}
        </div>
      </div>

      <SectionHeader title="Cloudflare" />
      <MoreRow to="/overview" icon="▦" label={t('Overview')} />
      <MoreRow to="/accounts" icon="⌂" label={t('Accounts')} />
      <MoreRow to="/templates" icon="▤" label="Templates" />
      <MoreRow to="/tags" icon="⊘" label="Tags" />
      <MoreRow to="/analytics" icon="◱" label="Analytics" />

      {isAdmin && (
        <>
          <SectionHeader title={t('Administration')} />
          <MoreRow to="/users" icon="◉" label={t('Users')} />
          <MoreRow to="/invites" icon="✉" label={t('Invite codes')} />
          <MoreRow to="/audit" icon="✎" label={t('Audit log')} />
        </>
      )}

      <SectionHeader title={t('Settings')} />
      <MoreRow to="/settings" icon="⚙" label={t('Settings')} />
      <div className="flex h-[34px] items-center justify-between border-b border-stroke-2 px-[14px] text-[12.5px]">
        <span>{t('Dark theme')}</span>
        <Switch size="small" checked={dark} onChange={toggleTheme} />
      </div>
      <button
        type="button"
        onClick={() => i18n.changeLanguage(i18n.language === 'vi' ? 'en' : 'vi')}
        className="flex h-[34px] w-full cursor-pointer items-center justify-between border-x-0 border-t-0 border-b border-solid border-stroke-2 bg-transparent px-[14px] text-left text-[12.5px] text-fg"
      >
        <span>{t('Language')}</span>
        <Tag>{i18n.language === 'vi' ? 'Tiếng Việt' : 'English'}</Tag>
      </button>

      <div className="p-[14px]">
        <Button danger block onClick={() => setToken(null)}>
          {t('Logout')}
        </Button>
      </div>
    </div>
  )
}
