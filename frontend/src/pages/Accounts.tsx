import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, Table, Button, Form, Input, Modal, message } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { useState } from 'react'
import { api } from '../services/api'

export default function Accounts() {
  const [modal, setModal] = useState(false)
  const [form] = Form.useForm()
  const qc = useQueryClient()

  const { data: list = [], isLoading } = useQuery({
    queryKey: ['accounts'],
    queryFn: async () => (await api.get('/accounts')).data,
  })

  const create = useMutation({
    mutationFn: async (v: { name: string; cf_account_id: string; api_token: string }) =>
      (await api.post('/accounts', v)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['accounts'] }); setModal(false); form.resetFields(); message.success('Created') },
    onError: (e: { response?: { data?: { detail?: string } } }) => message.error(e?.response?.data?.detail || 'Failed'),
  })

  return (
    <div>
      <h1>Accounts</h1>
      <Card>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModal(true)} style={{ marginBottom: 16 }}>Add Account</Button>
        <Table
          loading={isLoading}
          dataSource={list}
          rowKey="id"
          columns={[
            { title: 'Name', dataIndex: 'name' },
            { title: 'CF Account ID', dataIndex: 'cf_account_id' },
            { title: 'Active', dataIndex: 'is_active', render: (v: boolean) => (v ? 'Yes' : 'No') },
          ]}
        />
      </Card>
      <Modal title="Add Account" open={modal} onCancel={() => setModal(false)} footer={null}>
        <Form form={form} layout="vertical" onFinish={(v) => create.mutate(v)}>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="cf_account_id" label="Cloudflare Account ID" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="api_token" label="API Token" rules={[{ required: true }]}><Input.Password /></Form.Item>
          <Form.Item><Button type="primary" htmlType="submit" loading={create.isPending}>Create</Button></Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

