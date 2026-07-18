import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, Table, Button, Form, Input, Modal, message, Segmented, Tag, Space, Popconfirm, Typography, Alert } from 'antd'
import { PlusOutlined, DeleteOutlined, CheckCircleOutlined, StopOutlined, CloudServerOutlined } from '@ant-design/icons'
import { useSearchParams } from 'react-router-dom'
import type { ColumnsType } from 'antd/es/table'
import { useTranslation } from 'react-i18next'
import { api } from '../services/api'
import { useAccountStore } from '../stores/useAccountStore'

const { Text } = Typography
import PageHeader from '../components/PageHeader'

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
  const authType = searchParams.get('mode') === 'globalApiKey' ? 'globalApiKey' : 'apiToken'
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
        if (open) {
          next.set('modal', 'add')
          if (!next.has('mode')) next.set('mode', 'apiToken')
        } else {
          next.delete('modal')
          next.delete('mode')
        }
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
          {r.id === activeAccountId && <Tag color="orange" variant="filled">{t('Selected')}</Tag>}
        </Space>
      ),
    },
    {
      title: t('Auth type'),
      dataIndex: 'authType',
      render: (v: string) => (
        <Tag color={v === 'apiToken' ? 'orange' : 'default'} variant="filled">
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
        v ? <Tag color="success" variant="filled">{t('Active')}</Tag> : <Tag color="default" variant="filled">{t('Inactive')}</Tag>,
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
    <div style={{ padding: 'clamp(12px, 3vw, 24px)' }}>
      <PageHeader
        title="Cloudflare Accounts"
        description={t('Manage multiple CF accounts and switch between them')}
        actions={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>
            {t('Add account')}
          </Button>
        }
      />
      <Card>
        <Table loading={isLoading} dataSource={list} rowKey="id" columns={columns} scroll={{ x: 'max-content' }} />
      </Card>

      <Modal
        title={t('Add Cloudflare account')}
        open={addOpen}
        onCancel={() => setAddOpen(false)}
        footer={null}
        destroyOnHidden
      >
        <Segmented
          block
          value={authType}
          onChange={(value) => {
            const next = new URLSearchParams(searchParams)
            next.set('mode', value as string)
            setSearchParams(next, { replace: true })
          }}
          options={[
            { label: t('API Token (recommended)'), value: 'apiToken' },
            { label: 'Global API Key', value: 'globalApiKey' },
          ]}
          style={{ marginBottom: 16 }}
        />
        {authType === 'apiToken' ? (
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            message={t('How to get an API Token')}
            description={
              <ol style={{ paddingLeft: 18, margin: 0 }}>
                <li>
                  {t('Open')}{' '}
                  <Typography.Link href="https://dash.cloudflare.com/profile/api-tokens" target="_blank" rel="noreferrer">
                    dash.cloudflare.com/profile/api-tokens
                  </Typography.Link>
                </li>
                <li>{t('Click "Create Token" → use the "Edit zone DNS" template (or Custom token)')}</li>
                <li>{t('Grant permissions: Zone → DNS → Edit, and Zone → Zone → Read')}</li>
                <li>{t('Under "Zone Resources" choose All zones (or specific zones)')}</li>
                <li>{t('Click "Continue to summary" → "Create Token", then copy the token')}</li>
                <li>{t('Paste the token below (it is shown only once by Cloudflare)')}</li>
              </ol>
            }
          />
        ) : (
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
            message={t('How to get your Global API Key')}
            description={
              <ol style={{ paddingLeft: 18, margin: 0 }}>
                <li>
                  {t('Open')}{' '}
                  <Typography.Link href="https://dash.cloudflare.com/profile/api-tokens" target="_blank" rel="noreferrer">
                    dash.cloudflare.com/profile/api-tokens
                  </Typography.Link>
                </li>
                <li>{t('In the "API Keys" section, next to "Global API Key" click "View"')}</li>
                <li>{t('Confirm your password to reveal the key, then copy it')}</li>
                <li>{t('Enter the email of your Cloudflare account together with the key below')}</li>
                <li>{t('Note: the Global API Key has full account access — prefer an API Token when possible')}</li>
              </ol>
            }
          />
        )}
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
