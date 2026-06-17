import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, Table, Button, Form, Input, Modal, Select, message, Popconfirm, InputNumber, Switch, Space } from 'antd'
import { PlusOutlined, ExportOutlined, AppstoreOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import { useState } from 'react'
import { api } from '../services/api'

export default function Templates() {
  const [addModal, setAddModal] = useState(false)
  const [dnsModal, setDnsModal] = useState(false)
  const [fromDomainModal, setFromDomainModal] = useState(false)
  const [editModal, setEditModal] = useState(false)
  const [applyModal, setApplyModal] = useState(false)
  const [bulkApplyModal, setBulkApplyModal] = useState(false)
  const [applyId, setApplyId] = useState<string | undefined>(undefined)
  const [editId, setEditId] = useState<string | undefined>(undefined)
  const [addForm] = Form.useForm()
  const [dnsForm] = Form.useForm()
  const [fromForm] = Form.useForm()
  const [editForm] = Form.useForm()
  const [applyForm] = Form.useForm()
  const [bulkApplyForm] = Form.useForm()
  const qc = useQueryClient()

  const { data: templates = [], isLoading } = useQuery({ queryKey: ['templates'], queryFn: async () => (await api.get('/templates')).data })
  const { data: domains = [] } = useQuery({ queryKey: ['domains'], queryFn: async () => (await api.get('/domains')).data })

  const create = useMutation({
    mutationFn: async (v: { name: string; category?: string }) =>
      (await api.post('/templates', { name: v.name, category: v.category, dns_records: [], cache_settings: {}, page_rules: [], firewall_rules: [] })).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['templates'] }); setAddModal(false); addForm.resetFields(); message.success('Created') },
    onError: (e: { response?: { data?: { detail?: string } } }) => message.error(e?.response?.data?.detail || 'Failed'),
  })

  const createDns = useMutation({
    mutationFn: async (v: { name: string; category?: string; dns_records: Array<{ type: string; name: string; content: string; ttl?: number; proxied?: boolean }> }) =>
      (await api.post('/templates', { name: v.name, category: v.category, dns_records: v.dns_records, cache_settings: {}, page_rules: [], firewall_rules: [] })).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['templates'] }); setDnsModal(false); dnsForm.resetFields(); message.success('Template created') },
    onError: (e: { response?: { data?: { detail?: string } } }) => message.error(e?.response?.data?.detail || 'Failed'),
  })

  const fromDomain = useMutation({
    mutationFn: async (v: { name: string; category?: string; zone_id: string }) => (await api.post('/templates/from-domain', v)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['templates'] }); setFromDomainModal(false); fromForm.resetFields(); message.success('Created from domain') },
    onError: (e: { response?: { data?: { detail?: string } } }) => message.error(e?.response?.data?.detail || 'Failed'),
  })

  const update = useMutation({
    mutationFn: async (v: { dns_records: Array<{ type: string; name: string; content: string; ttl?: number; proxied?: boolean }> }) =>
      (await api.patch(`/templates/${editId}`, { dns_records: v.dns_records })).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['templates'] }); setEditModal(false); setEditId(undefined); editForm.resetFields(); message.success('Updated') },
    onError: (e: { response?: { data?: { detail?: string } } }) => message.error(e?.response?.data?.detail || 'Failed'),
  })

  const apply = useMutation({
    mutationFn: async (v: { zone_id: string }) => (await api.post(`/templates/${applyId}/apply`, v)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['templates', 'dns'] }); setApplyModal(false); setApplyId(undefined); applyForm.resetFields(); message.success('Applied') },
    onError: (e: { response?: { data?: { detail?: string } } }) => message.error(e?.response?.data?.detail || 'Failed'),
  })

  const bulkApply = useMutation({
    mutationFn: async (v: { zone_ids: string[] }) => (await api.post(`/templates/${applyId}/bulk-apply`, v)).data,
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ['templates', 'dns'] })
      setBulkApplyModal(false)
      setApplyId(undefined)
      bulkApplyForm.resetFields()
      const success = d?.results?.filter((r: { ok?: boolean }) => r?.ok).length || 0
      const failed = d?.results?.filter((r: { ok?: boolean }) => !r?.ok).length || 0
      message.success(`Applied to ${success} zones, failed ${failed}`)
    },
    onError: (e: { response?: { data?: { detail?: string } } }) => message.error(e?.response?.data?.detail || 'Failed'),
  })

  const remove = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/templates/${id}`)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['templates'] }); message.success('Deleted') },
    onError: (e: { response?: { data?: { detail?: string } } }) => message.error(e?.response?.data?.detail || 'Failed'),
  })

  const zones = domains.filter((d: { zone_id?: string }) => d.zone_id).map((d: { name: string; zone_id: string }) => ({ value: d.zone_id, label: d.name }))

  const openEdit = (t: { id: string; dns_records?: unknown[] }) => {
    setEditId(t.id)
    editForm.setFieldsValue({ dns_records: (t.dns_records || []).map((r: { type?: string; name?: string; content?: string; ttl?: number; proxied?: boolean }) => ({ type: r.type || 'A', name: r.name || '', content: r.content || '', ttl: r.ttl || 1, proxied: r.proxied || false })) })
    setEditModal(true)
  }

  return (
    <div>
      <h1>Templates</h1>
      <Card>
        <div style={{ marginBottom: 16 }}>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddModal(true)}>Create Empty</Button>
          <Button icon={<PlusOutlined />} onClick={() => setDnsModal(true)} style={{ marginLeft: 8 }}>Create DNS Template</Button>
          <Button icon={<ExportOutlined />} onClick={() => setFromDomainModal(true)} style={{ marginLeft: 8 }}>Create from Domain</Button>
        </div>
        <Table
          loading={isLoading}
          dataSource={templates}
          rowKey="id"
          columns={[
            { title: 'Name', dataIndex: 'name' },
            { title: 'Category', dataIndex: 'category' },
            { title: 'DNS Records', dataIndex: 'dns_records', render: (a: unknown[]) => (a?.length ?? 0) },
            { title: 'Page Rules', dataIndex: 'page_rules', render: (a: unknown[]) => (a?.length ?? 0) },
            {
              title: 'Actions',
              render: (_: unknown, r: { id: string }) => (
                <>
                  <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>Edit</Button>
                  <Button type="link" size="small" icon={<AppstoreOutlined />} onClick={() => { setApplyId(r.id); setApplyModal(true) }}>Apply</Button>
                  <Button type="link" size="small" icon={<AppstoreOutlined />} onClick={() => { setApplyId(r.id); setBulkApplyModal(true) }}>Bulk Apply</Button>
                  <Popconfirm title="Delete?" onConfirm={() => remove.mutate(r.id)}>
                    <Button type="link" danger size="small" icon={<DeleteOutlined />}>Delete</Button>
                  </Popconfirm>
                </>
              ),
            },
          ]}
        />
      </Card>

      <Modal title="Create Template" open={addModal} onCancel={() => setAddModal(false)} footer={null} width={500}>
        <Form form={addForm} layout="vertical" onFinish={(v) => create.mutate(v)}>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="category" label="Category"><Input /></Form.Item>
          <Form.Item><Button type="primary" htmlType="submit" loading={create.isPending}>Create</Button></Form.Item>
        </Form>
      </Modal>

      <Modal title="Create DNS Template" open={dnsModal} onCancel={() => setDnsModal(false)} footer={null} width={800}>
        <Form form={dnsForm} layout="vertical" onFinish={(v) => createDns.mutate(v)} initialValues={{ dns_records: [{ type: 'A', name: '', content: '', ttl: 1, proxied: false }] }}>
          <Form.Item name="name" label="Template Name" rules={[{ required: true }]}><Input placeholder="e.g. Default DNS" /></Form.Item>
          <Form.Item name="category" label="Category"><Input placeholder="e.g. Standard" /></Form.Item>
          <Form.List name="dns_records">
            {(fields, { add, remove }) => (
              <>
                {fields.map(({ key, name, ...restField }) => (
                  <Space key={key} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
                    <Form.Item {...restField} name={[name, 'type']} rules={[{ required: true }]} style={{ width: 100 }}>
                      <Select options={['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS'].map(t => ({ value: t, label: t }))} placeholder="Type" />
                    </Form.Item>
                    <Form.Item {...restField} name={[name, 'name']} rules={[{ required: true }]} style={{ width: 150 }}>
                      <Input placeholder="Name (@, tv, *)" />
                    </Form.Item>
                    <Form.Item {...restField} name={[name, 'content']} rules={[{ required: true }]} style={{ width: 200 }}>
                      <Input placeholder="Content (IP or domain)" />
                    </Form.Item>
                    <Form.Item {...restField} name={[name, 'ttl']} style={{ width: 80 }}>
                      <InputNumber min={1} placeholder="TTL" />
                    </Form.Item>
                    <Form.Item {...restField} name={[name, 'proxied']} valuePropName="checked">
                      <Switch checkedChildren="Proxy" unCheckedChildren="DNS" />
                    </Form.Item>
                    <Button type="link" danger onClick={() => remove(name)}>Remove</Button>
                  </Space>
                ))}
                <Form.Item>
                  <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>Add DNS Record</Button>
                </Form.Item>
              </>
            )}
          </Form.List>
          <Form.Item><Button type="primary" htmlType="submit" loading={createDns.isPending}>Create Template</Button></Form.Item>
        </Form>
      </Modal>

      <Modal title="Edit Template" open={editModal} onCancel={() => { setEditModal(false); setEditId(undefined) }} footer={null} width={800}>
        <Form form={editForm} layout="vertical" onFinish={(v) => update.mutate(v)}>
          <Form.List name="dns_records">
            {(fields, { add, remove }) => (
              <>
                {fields.map(({ key, name, ...restField }) => (
                  <Space key={key} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
                    <Form.Item {...restField} name={[name, 'type']} rules={[{ required: true }]} style={{ width: 100 }}>
                      <Select options={['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS'].map(t => ({ value: t, label: t }))} />
                    </Form.Item>
                    <Form.Item {...restField} name={[name, 'name']} rules={[{ required: true }]} style={{ width: 150 }}>
                      <Input />
                    </Form.Item>
                    <Form.Item {...restField} name={[name, 'content']} rules={[{ required: true }]} style={{ width: 200 }}>
                      <Input />
                    </Form.Item>
                    <Form.Item {...restField} name={[name, 'ttl']} style={{ width: 80 }}>
                      <InputNumber min={1} />
                    </Form.Item>
                    <Form.Item {...restField} name={[name, 'proxied']} valuePropName="checked">
                      <Switch checkedChildren="Proxy" unCheckedChildren="DNS" />
                    </Form.Item>
                    <Button type="link" danger onClick={() => remove(name)}>Remove</Button>
                  </Space>
                ))}
                <Form.Item>
                  <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>Add DNS Record</Button>
                </Form.Item>
              </>
            )}
          </Form.List>
          <Form.Item><Button type="primary" htmlType="submit" loading={update.isPending}>Update Template</Button></Form.Item>
        </Form>
      </Modal>

      <Modal title="Create from Domain" open={fromDomainModal} onCancel={() => setFromDomainModal(false)} footer={null}>
        <Form form={fromForm} layout="vertical" onFinish={(v) => fromDomain.mutate(v)}>
          <Form.Item name="name" label="Template Name" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="category" label="Category"><Input /></Form.Item>
          <Form.Item name="zone_id" label="Zone" rules={[{ required: true }]}>
            <Select options={zones} placeholder="Select zone" />
          </Form.Item>
          <Form.Item><Button type="primary" htmlType="submit" loading={fromDomain.isPending}>Create</Button></Form.Item>
        </Form>
      </Modal>

      <Modal title="Apply Template" open={applyModal} onCancel={() => { setApplyModal(false); setApplyId(undefined) }} footer={null}>
        <Form form={applyForm} layout="vertical" onFinish={(v) => apply.mutate(v)}>
          <Form.Item name="zone_id" label="Target Zone" rules={[{ required: true }]}>
            <Select options={zones} placeholder="Select zone" />
          </Form.Item>
          <Form.Item><Button type="primary" htmlType="submit" loading={apply.isPending}>Apply</Button></Form.Item>
        </Form>
      </Modal>

      <Modal title="Bulk Apply Template" open={bulkApplyModal} onCancel={() => { setBulkApplyModal(false); setApplyId(undefined) }} footer={null} width={600}>
        <Form form={bulkApplyForm} layout="vertical" onFinish={(v) => bulkApply.mutate(v)}>
          <Form.Item name="zone_ids" label="Target Zones" rules={[{ required: true }]}>
            <Select mode="multiple" options={zones} placeholder="Select multiple zones" />
          </Form.Item>
          <Form.Item><Button type="primary" htmlType="submit" loading={bulkApply.isPending}>Apply to Selected Zones</Button></Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
