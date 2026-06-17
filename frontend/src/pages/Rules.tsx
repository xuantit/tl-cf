import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, Table, Button, Form, Input, Modal, Select, message, Popconfirm } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { useState } from 'react'
import { api } from '../services/api'

export default function Rules() {
  const [zoneId, setZoneId] = useState<string | undefined>(undefined)
  const [addModal, setAddModal] = useState(false)
  const [form] = Form.useForm()
  const qc = useQueryClient()

  const { data: domains = [] } = useQuery({ queryKey: ['domains'], queryFn: async () => (await api.get('/domains')).data })
  const { data: rules = [], isLoading } = useQuery({
    queryKey: ['rules', zoneId],
    queryFn: async () => (await api.get(`/rules/${zoneId}/page-rules`)).data.rules,
    enabled: !!zoneId,
  })

  const create = useMutation({
    mutationFn: async (v: { url: string; action_id: string; action_value: string }) => {
      const targets = [{ target: 'url', constraint: { operator: 'matches', value: v.url } }]
      const actions = [{ id: v.action_id, value: v.action_value }]
      return (await api.post(`/rules/${zoneId}/page-rules`, { targets, actions, priority: 1 })).data
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['rules', zoneId] }); setAddModal(false); form.resetFields(); message.success('Created') },
    onError: (e: { response?: { data?: { detail?: string } } }) => message.error(e?.response?.data?.detail || 'Failed'),
  })

  const remove = useMutation({
    mutationFn: async (ruleId: string) => (await api.delete(`/rules/${zoneId}/page-rules/${ruleId}`)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['rules', zoneId] }); message.success('Deleted') },
    onError: (e: { response?: { data?: { detail?: string } } }) => message.error(e?.response?.data?.detail || 'Failed'),
  })

  const zones = domains.filter((d: { zone_id?: string }) => d.zone_id).map((d: { name: string; zone_id: string }) => ({ value: d.zone_id, label: d.name }))

  return (
    <div>
      <h1>Page Rules</h1>
      <Card>
        <div style={{ marginBottom: 16 }}>
          <Select placeholder="Select zone" options={zones} value={zoneId} onChange={setZoneId} style={{ width: 300 }} allowClear />
        </div>
        {zoneId && (
          <>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddModal(true)} style={{ marginBottom: 16 }}>Add Page Rule</Button>
            <Table
              loading={isLoading}
              dataSource={rules}
              rowKey="id"
              columns={[
                { title: 'Targets', dataIndex: 'targets', render: (t: unknown) => ((t as { constraint?: { value?: string } }[])?.[0]?.constraint?.value) || '-' },
                { title: 'Actions', dataIndex: 'actions', render: (a: unknown) => ((a as { id?: string; value?: string }[]) || []).map((x) => `${(x as { id?: string; value?: string })?.id}=${(x as { id?: string; value?: string })?.value}`).join(', ') },
                { title: 'Priority', dataIndex: 'priority' },
                {
                  title: 'Actions',
                  render: (_: unknown, r: { id: string }) => (
                    <Popconfirm title="Delete?" onConfirm={() => remove.mutate(r.id)}>
                      <Button type="link" danger size="small">Delete</Button>
                    </Popconfirm>
                  ),
                },
              ]}
            />
          </>
        )}
      </Card>
      <Modal title="Add Page Rule" open={addModal} onCancel={() => setAddModal(false)} footer={null}>
        <Form form={form} layout="vertical" onFinish={(v) => create.mutate(v)}>
          <Form.Item name="url" label="URL pattern" rules={[{ required: true }]}><Input placeholder="*example.com/*" /></Form.Item>
          <Form.Item name="action_id" label="Action" rules={[{ required: true }]}>
            <Select options={[
              { value: 'cache_level', label: 'Cache Level' },
              { value: 'ssl', label: 'SSL' },
              { value: 'forwarding_url', label: 'Forwarding URL' },
            ]} />
          </Form.Item>
          <Form.Item name="action_value" label="Value" rules={[{ required: true }]}><Input placeholder="e.g. aggressive or 0 (off) / 1 (flexible) / 2 (full)" /></Form.Item>
          <Form.Item><Button type="primary" htmlType="submit" loading={create.isPending}>Create</Button></Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
