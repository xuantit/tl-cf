import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, Form, Select, InputNumber, Button, message } from 'antd'
import { useState } from 'react'
import { api } from '../services/api'

export default function Cache() {
  const [zoneId, setZoneId] = useState<string | undefined>(undefined)
  const [form] = Form.useForm()
  const qc = useQueryClient()

  const { data: domains = [] } = useQuery({ queryKey: ['domains'], queryFn: async () => (await api.get('/domains')).data })
  const { data, isLoading } = useQuery({
    queryKey: ['cache', zoneId],
    queryFn: async () => (await api.get(`/cache/${zoneId}/settings`)).data.settings,
    enabled: !!zoneId,
  })

  const update = useMutation({
    mutationFn: async (v: Record<string, unknown>) => (await api.patch(`/cache/${zoneId}/settings`, v)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cache', zoneId] }); message.success('Updated') },
    onError: (e: { response?: { data?: { detail?: string } } }) => message.error(e?.response?.data?.detail || 'Failed'),
  })

  const zones = domains.filter((d: { zone_id?: string }) => d.zone_id).map((d: { name: string; zone_id: string }) => ({ value: d.zone_id, label: d.name }))

  return (
    <div>
      <h1>Cache Configuration</h1>
      <Card>
        <div style={{ marginBottom: 16 }}>
          <Select placeholder="Select zone" options={zones} value={zoneId} onChange={setZoneId} style={{ width: 300 }} allowClear />
        </div>
        {zoneId && data && (
          <Form
            key={zoneId}
            form={form}
            layout="vertical"
            initialValues={{
              cache_level: data.cache_level || 'standard',
              browser_cache_ttl: data.browser_cache_ttl ?? 14400,
              always_online: data.always_online || 'on',
              development_mode: data.development_mode || 'off',
            }}
            onFinish={(v) => update.mutate(v)}
          >
            <Form.Item name="cache_level" label="Cache Level">
              <Select options={[
                { value: 'off', label: 'Off' },
                { value: 'basic', label: 'Basic' },
                { value: 'simplified', label: 'Simplified' },
                { value: 'aggressive', label: 'Aggressive' },
                { value: 'cache_everything', label: 'Cache Everything' },
              ]} />
            </Form.Item>
            <Form.Item name="browser_cache_ttl" label="Browser Cache TTL (seconds)"><InputNumber min={0} /></Form.Item>
            <Form.Item name="always_online" label="Always Online">
              <Select options={[{ value: 'on', label: 'On' }, { value: 'off', label: 'Off' }]} />
            </Form.Item>
            <Form.Item name="development_mode" label="Development Mode">
              <Select options={[{ value: 'on', label: 'On' }, { value: 'off', label: 'Off' }]} />
            </Form.Item>
            <Form.Item><Button type="primary" htmlType="submit" loading={update.isPending}>Update</Button></Form.Item>
          </Form>
        )}
        {zoneId && isLoading && <div>Loading...</div>}
      </Card>
    </div>
  )
}
