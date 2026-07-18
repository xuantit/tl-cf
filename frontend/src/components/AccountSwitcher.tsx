import { useEffect } from 'react'
import { Select, Tag, Tooltip } from 'antd'
import { CloudServerOutlined } from '@ant-design/icons'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
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

export default function AccountSwitcher() {
  const { t } = useTranslation()
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

  const handleChange = (id: string) => {
    setActiveAccountId(id)
    // Refetch everything scoped to the active account.
    qc.invalidateQueries()
  }

  if (!isLoading && accounts.length === 0) {
    return (
      <Tag color="warning" style={{ marginRight: 8 }}>
        {t('No CF account')}
      </Tag>
    )
  }

  return (
    <Tooltip title={t('Active Cloudflare account')}>
      <Select
        value={activeAccountId ?? undefined}
        onChange={handleChange}
        loading={isLoading}
        style={{ minWidth: 140, maxWidth: 220, width: '100%' }}
        placeholder={t('Select account')}
        options={accounts.map((a) => ({
          value: a.id,
          label: (
            <span>
              <CloudServerOutlined style={{ marginRight: 6 }} />
              {a.label || a.email || a.id.slice(0, 8)}
              <Tag
                color={a.authType === 'apiToken' ? 'geekblue' : 'default'}
                style={{ marginLeft: 8 }}
              >
                {a.authType === 'apiToken' ? 'Token' : 'Global Key'}
              </Tag>
            </span>
          ),
        }))}
      />
    </Tooltip>
  )
}
