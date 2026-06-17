import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, Table, Button, Form, Input, Modal, Select, InputNumber, Switch, message, Popconfirm } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { useState } from 'react'
import { api } from '../services/api'

export default function DNS() {
  const [zoneId, setZoneId] = useState<string | undefined>(undefined)
  const [addModal, setAddModal] = useState(false)
  const [form] = Form.useForm()
  const qc = useQueryClient()

  const { data: domains = [] } = useQuery({ queryKey: ['domains'], queryFn: async () => (await api.get('/domains')).data })
  const { data: recs = [], isLoading } = useQuery({
    queryKey: ['dns', zoneId],
    queryFn: async () => (await api.get(`/dns/${zoneId}/records`)).data.records,
    enabled: !!zoneId,
  })

  const create = useMutation({
    mutationFn: async (v: { type: string; name: string; content: string; ttl?: number; proxied?: boolean }) =>
      (await api.post(`/dns/${zoneId}/records`, { ...v, ttl: v.ttl || 1, proxied: v.proxied ?? false })).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['dns', zoneId] }); setAddModal(false); form.resetFields(); message.success('Created') },
    onError: (e: { response?: { data?: { detail?: string } } }) => message.error(e?.response?.data?.detail || 'Failed'),
  })

  const remove = useMutation({
    mutationFn: async (recordId: string) => (await api.delete(`/dns/${zoneId}/records/${recordId}`)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['dns', zoneId] }); message.success('Deleted') },
    onError: (e: { response?: { data?: { detail?: string } } }) => message.error(e?.response?.data?.detail || 'Failed'),
  })

  const zones = domains.filter((d: { zone_id?: string }) => d.zone_id).map((d: { id: string; name: string; zone_id: string }) => ({ value: d.zone_id, label: d.name }))

  return (
    <div>
      <h1>DNS Management</h1>
      <Card>
        <div style={{ marginBottom: 16 }}>
          <Select placeholder="Select zone (domain)" options={zones} value={zoneId} onChange={setZoneId} style={{ width: 300 }} allowClear />
        </div>
        {zoneId && (
          <>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddModal(true)} style={{ marginBottom: 16 }}>Add Record</Button>
            <Table
              loading={isLoading}
              dataSource={recs}
              rowKey="id"
              columns={[
                { title: 'Type', dataIndex: 'type' },
                { title: 'Name', dataIndex: 'name' },
                { title: 'Content', dataIndex: 'content' },
                { title: 'TTL', dataIndex: 'ttl' },
                { title: 'Proxied', dataIndex: 'proxied', render: (v: boolean) => (v ? 'Yes' : 'No') },
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
      <Modal title="Add DNS Record" open={addModal} onCancel={() => setAddModal(false)} footer={null}>
        <Form form={form} layout="vertical" onFinish={(v) => create.mutate(v)}>
          <Form.Item name="type" label="Type" rules={[{ required: true }]}>
            <Select options={['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS'].map((t) => ({ value: t, label: t }))} placeholder="Select" />
          </Form.Item>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}><Input placeholder="@ or subdomain" /></Form.Item>
          <Form.Item name="content" label="Content" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="ttl" label="TTL" initialValue={1}><InputNumber min={1} /></Form.Item>
          <Form.Item name="proxied" label="Proxied" valuePropName="checked" initialValue={false}><Switch /></Form.Item>
          <Form.Item><Button type="primary" htmlType="submit" loading={create.isPending}>Create</Button></Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
