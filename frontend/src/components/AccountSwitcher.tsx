import { useEffect } from 'react'
import { Dropdown, Spin } from 'antd'
import type { MenuProps } from 'antd'
import { DownOutlined, SettingOutlined } from '@ant-design/icons'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { api } from '../services/api'
import { useAccountStore } from '../stores/useAccountStore'

export interface CfAccount {
  id: string
  label?: string
  authType: 'globalApiKey' | 'apiToken'
  email?: string
  isActive: boolean
  domainsCount: number
}

/** Colour dot indicating account active/inactive state */
function StatusDot({ active }: { active: boolean }) {
  // TODO(redesign-pr1): thay bằng primitive StatusDot thật từ PR 1/4
  return (
    <span
      className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${active ? 'bg-green-500' : 'bg-fg-secondary dark:bg-fg-dark-secondary'}`}
      aria-label={active ? 'Active' : 'Inactive'}
    />
  )
}

interface AccountSwitcherProps {
  /** When true, show only the initial (for mobile header) */
  compact?: boolean
}

export default function AccountSwitcher({ compact = false }: AccountSwitcherProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const activeAccountId = useAccountStore((s) => s.activeAccountId)
  const setActiveAccountId = useAccountStore((s) => s.setActiveAccountId)

  const { data: accounts = [], isLoading } = useQuery<CfAccount[]>({
    queryKey: ['cf-accounts'],
    queryFn: async () => (await api.get('/cf/accounts')).data,
  })

  // Auto-select first account when none is selected or the selected one no longer exists.
  useEffect(() => {
    if (accounts.length === 0) return
    const exists = accounts.some((a) => a.id === activeAccountId)
    if (!activeAccountId || !exists) {
      setActiveAccountId(accounts[0].id)
    }
  }, [accounts, activeAccountId, setActiveAccountId])

  const handleSelect = (id: string) => {
    setActiveAccountId(id)
    qc.invalidateQueries()
  }

  const activeAccount = accounts.find((a) => a.id === activeAccountId)
  const activeLabel = activeAccount
    ? activeAccount.label || activeAccount.email || activeAccount.id.slice(0, 8)
    : t('Select account')

  // Derive initial letter for avatar
  const initial = activeLabel ? activeLabel.charAt(0).toUpperCase() : '?'

  const menuItems: MenuProps['items'] = [
    ...accounts.map((a) => ({
      key: a.id,
      label: (
        <span className="flex items-center gap-2">
          <StatusDot active={a.isActive} />
          <span className="flex-1 truncate">{a.label || a.email || a.id.slice(0, 8)}</span>
          {a.id === activeAccountId && (
            <span className="text-[10px] font-semibold text-accent">{t('Active')}</span>
          )}
        </span>
      ),
      onClick: () => handleSelect(a.id),
    })),
    { type: 'divider' as const },
    {
      key: 'manage',
      icon: <SettingOutlined />,
      label: t('Manage accounts'),
      onClick: () => navigate('/accounts'),
    },
  ]

  if (isLoading) {
    return <Spin size="small" />
  }

  if (compact) {
    // Mobile header: just the initial avatar
    return (
      <Dropdown menu={{ items: menuItems }} trigger={['click']}>
        <button
          className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md border border-stroke bg-bg-secondary text-[12px] font-semibold text-fg transition-colors hover:border-accent/40 dark:border-stroke-dark dark:bg-bg-dark-secondary dark:text-fg-dark"
          aria-label={t('Switch account')}
        >
          {initial}
        </button>
      </Dropdown>
    )
  }

  return (
    <Dropdown menu={{ items: menuItems }} trigger={['click']}>
      <button className="flex w-full cursor-pointer items-center gap-2 rounded-md border border-stroke bg-bg px-2 py-1.5 text-[13px] transition-colors hover:border-accent/40 dark:border-stroke-dark dark:bg-bg-dark">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-accent/15 text-[10px] font-semibold text-accent">
          {initial}
        </span>
        <span className="min-w-0 flex-1 truncate text-left text-fg dark:text-fg-dark">
          {activeLabel}
        </span>
        <DownOutlined className="shrink-0 text-[11px] text-fg-secondary dark:text-fg-dark-secondary" />
      </button>
    </Dropdown>
  )
}
