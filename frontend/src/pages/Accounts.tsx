import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, Table, Button, Form, Input, Modal, message, Segmented, Tag, Space, Popconfirm, Typography } from 'antd'
import { PlusOutlined, DeleteOutlined, CheckCircleOutlined, StopOutlined, CloudServerOutlined } from '@ant-design/icons'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { ColumnsType } from 'antd/es/table'
import { useTranslation } from 'react-i18next'
import { api } from '../services/api'
import { useAccountStore } from '../stores/useAccountStore'

const { Title, Text } = Typography

interface Account {
  id: string
  label?: string
  authType: 'globalApiKey' | 'apiToken'
  email?: string
  isActive: boolean
  createdAt: string
  updatedAt: string
  domainsCount: number
}

export default function Accounts() {
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const [authType, setAuthType] = useState<'globalApiKey' | 'apiToken'>('apiToken')
  const [form] = Form.useForm()
  const qc = useQueryClient()
  const activeAccountId = useAccountStore((s) => s.activeAccountId)
  const setActiveAccountId = useAccountStore((s) => s.setActiveAccountId)

  // Modal state lives in the URL so F5 restores the view
  const addOpen = searchParams.get('modal') === 'add'
  const setAddOpen = (open: boolean) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (open) next.set('modal', 'add')
        else next.delete('modal')
        return next
      },
      { replace: true },
    )
  }

  const { data: list = [], isLoading } = useQuery<Account[]>({
    queryKey: ['cf-accounts'],
    queryFn: async () => (await api.get('/cf/accounts')).data,
  })

  const create = useMutation({
    mutationFn: async (values: Record<string, string>) => {
      const payload =
        authType === 'apiToken'
          ? { authType, label: values.label, apiToken: values.apiToken }
          : { authType, label: values.label, email: values.email, globalApiKey: values.globalApiKey }
      return (await api.post('/cf/accounts', payload)).data
    },
    onSuccess: (acc) => {
      qc.invalidateQueries({ queryKey: ['cf-accounts'] })
      setAddOpen(false)
      form.resetFields()
      if (acc?.id) setActiveAccountId(acc.id)
      message.success(t('Account added'))
    },
    onError: (e: { response?: { data?: { detail?: string } } }) =>
      message.error(e?.response?.data?.detail || t('Failed')),
  })

  const toggleActive = useMutation({
    mutationFn: async (acc: Account) =>
      (await api.put(`/cf/accounts/${acc.id}`, { isActive: !acc.isActive })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cf-accounts'] })
      message.success(t('Updated'))
    },
    onError: (e: { response?: { data?: { detail?: string } } }) =>
      message.error(e?.response?.data?.detail || t('Failed')),
  })

  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/cf/accounts/${id}`),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ['cf-accounts'] })
      if (activeAccountId === id) setActiveAccountId(null)
      message.success(t('Account deleted'))
    },
    onError: (e: { response?: { data?: { detail?: string } } }) =>
      message.error(e?.response?.data?.detail || t('Failed')),
  })

  const columns: ColumnsType<Account> = [
    {
      title: t('Account'),
      dataIndex: 'label',
      render: (label: string, r) => (
        <Space>
          <CloudServerOutlined />
          <span style={{ fontWeight: 500 }}>{label || r.email || r.id.slice(0, 8)}</span>
          {r.id === activeAccountId && <Tag color="orange" bordered={false}>{t('Selected')}</Tag>}
        </Space>
      ),
    },
    {
      title: t('Auth type'),
      dataIndex: 'authType',
      render: (v: string) => (
        <Tag color={v === 'apiToken' ? 'orange' : 'default'} bordered={false}>
          {v === 'apiToken' ? 'API Token' : 'Global API Key'}
        </Tag>
      ),
    },
    { title: 'Email', dataIndex: 'email', render: (v?: string) => v || <Text type="secondary">—</Text> },
    { title: 'Domains', dataIndex: 'domainsCount', width: 100 },
    {
      title: t('Status'),
      dataIndex: 'isActive',
      render: (v: boolean) =>
        v ? <Tag color="success" bordered={false}>{t('Active')}</Tag> : <Tag color="default" bordered={false}>{t('Inactive')}</Tag>,
    },
    {
      title: t('Actions'),
      key: 'actions',
      render: (_v, r) => (
        <Space>
          <Button size="small" onClick={() => setActiveAccountId(r.id)} disabled={r.id === activeAccountId}>
            {t('Select')}
          </Button>
          <Button
            size="small"
            icon={r.isActive ? <StopOutlined /> : <CheckCircleOutlined />}
            onClick={() => toggleActive.mutate(r)}
          >
            {r.isActive ? t('Disable') : t('Enable')}
          </Button>
          <Popconfirm title={t('Delete this account?')} onConfirm={() => remove.mutate(r.id)} okText={t('Delete')} cancelText={t('Cancel')}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div style={{ padding: 24 }}>
      <div className="page-header">
        <Title level={2} style={{ fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 4 }}>
          Cloudflare Accounts
        </Title>
        <Text type="secondary">{t('Manage multiple CF accounts and switch between them')}</Text>
      </div>
      <Card>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddOpen(true)} style={{ marginBottom: 16 }}>
          {t('Add account')}
        </Button>
        <Table loading={isLoading} dataSource={list} rowKey="id" columns={columns} />
      </Card>

      <Modal
        title={t('Add Cloudflare account')}
        open={addOpen}
        onCancel={() => setAddOpen(false)}
        footer={null}
        destroyOnClose
      >
        <Segmented
          block
          value={authType}
          onChange={(v) => setAuthType(v as 'globalApiKey' | 'apiToken')}
          options={[
            { label: t('API Token (recommended)'), value: 'apiToken' },
            { label: 'Global API Key', value: 'globalApiKey' },
          ]}
          style={{ marginBottom: 16 }}
        />
        <Form form={form} layout="vertical" onFinish={(v) => create.mutate(v)}>
          <Form.Item name="label" label={t('Friendly name')}>
            <Input placeholder={t('e.g. Main account')} />
          </Form.Item>
          {authType === 'apiToken' ? (
            <Form.Item
              name="apiToken"
              label="API Token"
              rules={[{ required: true, message: t('Enter API Token') }]}
              help={t('The token will be encrypted and stored securely')}
            >
              <Input.Password placeholder="Cloudflare API Token" />
            </Form.Item>
          ) : (
            <>
              <Form.Item
                name="email"
                label={t('Cloudflare email')}
                rules={[{ required: true, type: 'email', message: t('Enter a valid email') }]}
              >
                <Input placeholder="your-email@example.com" />
              </Form.Item>
              <Form.Item
                name="globalApiKey"
                label="Global API Key"
                rules={[{ required: true, message: t('Enter Global API Key') }]}
                help={t('The key will be encrypted and stored securely')}
              >
                <Input.Password placeholder="Global API Key" />
              </Form.Item>
            </>
          )}
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={create.isPending} block>
              {t('Test & Save')}
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
