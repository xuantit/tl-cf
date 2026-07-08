import { useQuery } from '@tanstack/react-query'
import { api } from '../services/api'

export type BulkJobItemStatus = 'pending' | 'running' | 'success' | 'error'

export interface BulkJobItem {
  key: string
  label?: string
  status: BulkJobItemStatus
  error?: string
  result?: unknown
}

export interface BulkJob {
  id: string
  type: string
  status: 'running' | 'done' | 'interrupted'
  total: number
  processed: number
  succeeded: number
  failed: number
  items: BulkJobItem[]
  createdAt: number
  finishedAt?: number
}

export function useJobPolling(jobId: string | null) {
  return useQuery<BulkJob>({
    queryKey: ['job', jobId],
    queryFn: async () => (await api.get(`/jobs/${jobId}`)).data,
    enabled: !!jobId,
    retry: false,
    refetchInterval: (query) =>
      query.state.data?.status !== 'running' && (query.state.data || query.state.error) ? false : 1500,
  })
}
