import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { message } from 'antd'
import { isAxiosError } from 'axios'
import { useTranslation } from 'react-i18next'
import { api } from '../services/api'
import type { Zone } from '../types/domain'

/**
 * Shared domains list. Uses the same queryKey (['domains']) as the
 * CommandPalette / AppShell sidebar count so they all share one cache entry.
 */
export function useDomains() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  return useQuery<Zone[]>({
    queryKey: ['domains'],
    queryFn: async () => {
      try {
        const res = await api.get<Zone[]>('/domains')
        return res.data
      } catch (error) {
        if (
          isAxiosError<{ detail?: string }>(error) &&
          error.response?.status === 400 &&
          error.response.data?.detail?.includes('credentials')
        ) {
          message.warning(t('Please add a Cloudflare account first'))
          navigate('/accounts')
        }
        throw error
      }
    },
  })
}

