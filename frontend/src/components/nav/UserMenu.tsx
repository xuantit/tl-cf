import { Dropdown, Avatar } from 'antd'
import type { MenuProps } from 'antd'
import {
  LogoutOutlined,
  BulbOutlined,
  BulbFilled,
  TranslationOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useAuthStore, getEmailFromToken } from '../../stores/useAuthStore'
import { useThemeStore } from '../../stores/useThemeStore'

interface UserMenuProps {
  size?: number
}

export default function UserMenu({ size = 28 }: UserMenuProps) {
  const { t, i18n } = useTranslation()
  const setToken = useAuthStore((s) => s.setToken)
  const authToken = useAuthStore((s) => s.token)
  const email = getEmailFromToken(authToken)
  const dark = useThemeStore((s) => s.dark)
  const toggleTheme = useThemeStore((s) => s.toggle)

  const items: MenuProps['items'] = [
    {
      key: 'email',
      label: <span className="text-fg-secondary text-[12px]">{email}</span>,
      disabled: true,
    },
    { type: 'divider' },
    {
      key: 'lang',
      icon: <TranslationOutlined />,
      label: i18n.language === 'vi' ? 'English' : 'Tiếng Việt',
    },
    {
      key: 'theme',
      icon: dark ? <BulbFilled /> : <BulbOutlined />,
      label: dark ? t('Light mode') : t('Dark mode'),
    },
    { type: 'divider' },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: t('Logout'),
      danger: true,
    },
  ]

  const onClick: MenuProps['onClick'] = ({ key }) => {
    if (key === 'logout') setToken(null)
    else if (key === 'lang') i18n.changeLanguage(i18n.language === 'vi' ? 'en' : 'vi')
    else if (key === 'theme') toggleTheme()
  }

  const initial = email ? email.charAt(0).toUpperCase() : null

  return (
    <Dropdown menu={{ items, onClick }} trigger={['click']}>
      <button
        className="flex cursor-pointer items-center gap-2 rounded-md border-0 bg-transparent px-2 py-1.5 text-left hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
        aria-label={t('User menu')}
      >
        <Avatar
          size={size}
          style={{
            background: 'rgba(246,130,31,0.15)',
            color: '#f6821f',
            fontWeight: 600,
            flexShrink: 0,
          }}
        >
          {initial ?? <UserOutlined />}
        </Avatar>
        <span className="min-w-0 flex-1 truncate text-[13px] text-fg-secondary dark:text-fg-dark-secondary">
          {email}
        </span>
      </button>
    </Dropdown>
  )
}
