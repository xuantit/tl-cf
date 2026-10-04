import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Card,
  Table,
  Tag,
  Typography,
  Button,
  Space,
  Modal,
  Form,
  Input,
  InputNumber,
  DatePicker,
  Popconfirm,
  Tooltip,
  message,
} from 'antd'
import { PlusOutlined, CopyOutlined, DeleteOutlined, LinkOutlined, ReloadOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { useSearchParams } from 'react-router-dom'
import type { Dayjs } from 'dayjs'
import { useTranslation } from 'react-i18next'
import { api } from '../services/api'

const { Title, Text } = Typography

interface InviteCode {
  id: string
  code: string
  note: string | null
  maxUses: number
  usedCount: number
  usedBy: string[]
  expiresAt: string | null
  createdAt: string
}

export default function Invites() {
  const { t, i18n } = useTranslation()
  const dateLocale = i18n.language === 'vi' ? 'vi-VN' : 'en-US'
  const [searchParams, setSearchParams] = useSearchParams()
  const addOpen = searchParams.get('modal') === 'add'
  const [form] = Form.useForm()
  const queryClient = useQueryClient()

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

  const { data: invites = [], isLoading, refetch, isFetching } = useQuery<InviteCode[]>({
    queryKey: ['invites'],
    queryFn: async () => (await api.get('/invites')).data,
  })

  const createMutation = useMutation({
    mutationFn: async (values: { note?: string; maxUses: number; expiresAt?: Dayjs }) =>
      (
        await api.post('/invites', {
          note: values.note || undefined,
          maxUses: values.maxUses,
          expiresAt: values.expiresAt ? values.expiresAt.toISOString() : undefined,
        })
      ).data as InviteCode,
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['invites'] })
      setAddOpen(false)
      form.resetFields()
      Modal.success({
        title: t('Invite code created'),
        content: (
          <Space orientation="vertical" style={{ width: '100%' }}>
            <Text copyable={{ text: created.code }} strong style={{ fontSize: 18 }}>
              {created.code}
            </Text>
            <Text type="secondary" copyable={{ text: registerLink(created.code) }}>
              {t('Registration link: {{link}}', { link: registerLink(created.code) })}
            </Text>
          </Space>
        ),
      })
    },
    onError: (e: unknown) => {
      message.error((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || t('Could not create invite code'))
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/invites/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invites'] })
      message.success(t('Invite code revoked'))
    },
    onError: () => message.error(t('Could not revoke')),
  })

  const registerLink = (code: string) => `${window.location.origin}/register?invite=${encodeURIComponent(code)}`

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    message.success(t('Copied {{label}}', { label }))
  }

  const columns: ColumnsType<InviteCode> = [
    {
      title: t('Code'),
      dataIndex: 'code',
      render: (code: string) => (
        <Space>
          <Text strong style={{ fontFamily: 'monospace' }}>{code}</Text>
          <Tooltip title={t('Copy code')}>
            <Button type="text" size="small" icon={<CopyOutlined />} onClick={() => copy(code, t('invite code'))} />
          </Tooltip>
          <Tooltip title={t('Copy registration link')}>
            <Button type="text" size="small" icon={<LinkOutlined />} onClick={() => copy(registerLink(code), t('registration link'))} />
          </Tooltip>
        </Space>
      ),
    },
    {
      title: t('Note'),
      dataIndex: 'note',
      ellipsis: true,
      render: (note: string | null) => note || <Text type="secondary">—</Text>,
    },
    {
      title: t('Used'),
      key: 'usage',
      width: 120,
      render: (_, r) => {
        const exhausted = r.usedCount >= r.maxUses
        const tag = <Tag color={exhausted ? 'default' : 'green'} variant="filled">{r.usedCount}/{r.maxUses}</Tag>
        return r.usedBy.length > 0 ? (
          <Tooltip title={r.usedBy.join(', ')}>{tag}</Tooltip>
        ) : (
          tag
        )
      },
    },
    {
      title: t('Expires'),
      dataIndex: 'expiresAt',
      width: 170,
      render: (v: string | null) => {
        if (!v) return <Text type="secondary">{t('No expiry')}</Text>
        const expired = new Date(v) < new Date()
        return <Tag color={expired ? 'red' : 'blue'} variant="filled">{new Date(v).toLocaleString(dateLocale)}</Tag>
      },
    },
    {
      title: t('Created at'),
      dataIndex: 'createdAt',
      width: 170,
      render: (v: string) => new Date(v).toLocaleString(dateLocale),
    },
    {
      title: '',
      key: 'actions',
      width: 60,
      render: (_, r) => (
        <Popconfirm
          title={t('Revoke this invite code?')}
          description={t('Anyone who has not registered yet will no longer be able to use it.')}
          onConfirm={() => deleteMutation.mutate(r.id)}
          okText={t('Revoke')}
          cancelText={t('Cancel')}
        >
          <Button type="text" danger size="small" icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ]

  return (
    <div style={{ padding: 'clamp(12px, 3vw, 24px)' }}>
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <Title level={2} style={{ fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 4 }}>
            {t('Invite codes')}
          </Title>
          <Text type="secondary">
            {t('Users need an invite code to register. Send the code or the registration link to the invitee.')}
          </Text>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => refetch()} loading={isFetching}>
            {t('Reload')}
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>
            {t('Create invite code')}
          </Button>
        </Space>
      </div>
      <Card>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={invites}
          loading={isLoading}
          pagination={{ pageSize: 20, hideOnSinglePage: true }}
          scroll={{ x: 'max-content' }}
        />
      </Card>

      <Modal
        title={t('Create invite code')}
        open={addOpen}
        onCancel={() => setAddOpen(false)}
        onOk={() => form.submit()}
        okText={t('Create')}
        cancelText={t('Cancel')}
        confirmLoading={createMutation.isPending}
        destroyOnHidden
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{ maxUses: 1 }}
          onFinish={(values) => createMutation.mutate(values)}
        >
          <Form.Item name="note" label={t('Note')} extra={t('e.g. invite for Mr. A, marketing team')}>
            <Input maxLength={200} placeholder={t('Not required')} />
          </Form.Item>
          <Form.Item
            name="maxUses"
            label={t('Max uses')}
            rules={[{ required: true, message: t('Enter max uses') }]}
          >
            <InputNumber min={1} max={1000} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="expiresAt" label={t('Expires')} extra={t('Leave empty for no time limit')}>
            <DatePicker showTime style={{ width: '100%' }} placeholder={t('Pick an expiry time')} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
