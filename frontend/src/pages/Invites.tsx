import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Table,
  Typography,
  Button,
  Space,
  Form,
  Input,
  InputNumber,
  DatePicker,
  Popconfirm,
  Tooltip,
} from 'antd'
import type { FormInstance } from 'antd'
import { message, modal } from '../lib/antdApp'
import type { ColumnsType } from 'antd/es/table'
import { useSearchParams } from 'react-router-dom'
import type { Dayjs } from 'dayjs'
import { useTranslation } from 'react-i18next'
import { api, apiErrorDetail } from '../services/api'
import PageHeader from '../components/PageHeader'
import { Banner, DetailPanel, EmptyState, Tag } from '../components/ui'

const { Text } = Typography

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

/** Days until expiry (ceil); negative/0 = expired. */
function daysLeft(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000)
}

function formatDay(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
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

  // Panel children stay mounted — reset the form here, not in an effect
  const closeAddPanel = () => {
    setAddOpen(false)
    form.resetFields()
  }

  const { data: invites = [], isLoading, isError, error, refetch, isFetching } = useQuery<InviteCode[]>({
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
      modal.success({
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
        <span className="inline-flex items-center gap-1">
          <span className="font-mono text-[12px] font-medium text-fg">{code}</span>
          <Tooltip title={t('Copy code')}>
            <Button
              type="text"
              size="small"
              aria-label={t('Copy code')}
              onClick={(e) => {
                e.stopPropagation()
                copy(code, t('invite code'))
              }}
            >
              ⧉
            </Button>
          </Tooltip>
          <Tooltip title={t('Copy registration link')}>
            <Button
              type="text"
              size="small"
              aria-label={t('Copy registration link')}
              onClick={(e) => {
                e.stopPropagation()
                copy(registerLink(code), t('registration link'))
              }}
            >
              ↗
            </Button>
          </Tooltip>
        </span>
      ),
    },
    {
      title: t('Note'),
      dataIndex: 'note',
      ellipsis: true,
      responsive: ['md'],
      render: (note: string | null) =>
        note ? <span className="text-[12px] text-fg-2">{note}</span> : <span className="text-fg-3">—</span>,
    },
    {
      title: t('Used'),
      key: 'usage',
      width: 90,
      render: (_, r) => {
        const exhausted = r.usedCount >= r.maxUses
        const tag = (
          <Tag variant={exhausted ? 'default' : 'ok'}>
            {r.usedCount}/{r.maxUses}
          </Tag>
        )
        return r.usedBy.length > 0 ? <Tooltip title={r.usedBy.join(', ')}>{tag}</Tooltip> : tag
      },
    },
    {
      title: t('Expires'),
      dataIndex: 'expiresAt',
      width: 130,
      render: (v: string | null) => {
        if (!v) return <span className="font-mono text-[11px] text-fg-3">{t('No expiry')}</span>
        const left = daysLeft(v)
        if (left <= 0)
          return <span className="font-mono text-[11px] text-danger">{t('expired')}</span>
        return (
          <span className="font-mono text-[11px] text-fg-2" title={new Date(v).toLocaleString(dateLocale)}>
            {t('{{count}} days left', { count: left })}
          </span>
        )
      },
    },
    {
      title: t('Created at'),
      dataIndex: 'createdAt',
      width: 110,
      responsive: ['lg'],
      render: (v: string) => <span className="font-mono text-[11px] text-fg-3">{formatDay(v)}</span>,
    },
    {
      title: '',
      key: 'actions',
      width: 60,
      align: 'right',
      render: (_, r) => (
        <Popconfirm
          title={t('Revoke this invite code?')}
          description={t('Anyone who has not registered yet will no longer be able to use it.')}
          onConfirm={() => deleteMutation.mutate(r.id)}
          okText={t('Revoke')}
          okButtonProps={{ danger: true }}
          cancelText={t('Cancel')}
        >
          <Button type="text" danger size="small">
            {t('revoke')}
          </Button>
        </Popconfirm>
      ),
    },
  ]

  const pendingCount = invites.filter(
    (i) => i.usedCount < i.maxUses && (!i.expiresAt || daysLeft(i.expiresAt) > 0),
  ).length

  return (
    // Panel is a flex sibling of the content so it pushes it left (DetailPanel pattern)
    <div className="relative flex min-h-full">
      <div className="fade-in min-w-0 flex-1 p-[clamp(12px,3vw,24px)]">
      <PageHeader
        title={t('Invite codes')}
        crumb={t('{{count}} codes · {{pending}} pending', { count: invites.length, pending: pendingCount })}
        actions={
          <>
            <Button onClick={() => refetch()} loading={isFetching}>
              ↻ {t('Reload')}
            </Button>
            <Button type="primary" onClick={() => setAddOpen(true)}>
              + {t('Create invite code')}
            </Button>
          </>
        }
      />
      <Banner tone="info" className="mb-3">
        {t('Invite codes are temporarily unused. New users register by verifying their email.')}
      </Banner>
      {isError && (
        <Banner
          tone="err"
          className="mb-3"
          actions={
            <Button size="small" onClick={() => refetch()}>
              ↻ {t('Retry')}
            </Button>
          }
        >
          {apiErrorDetail(error) || t('Could not load invite codes')}
        </Banner>
      )}
      <Table
        rowKey="id"
        columns={columns}
        dataSource={invites}
        loading={isLoading}
        rowClassName={(r) =>
          r.usedCount >= r.maxUses || (r.expiresAt && daysLeft(r.expiresAt) <= 0) ? 'opacity-50' : ''
        }
        locale={{
          emptyText: (
            <EmptyState
              icon="✉"
              title={t('No invite codes')}
              desc={t('Invite codes are temporarily unused. New users register by verifying their email.')}
              actions={
                <Button type="primary" size="small" onClick={() => setAddOpen(true)}>
                  + {t('Create invite code')}
                </Button>
              }
            />
          ),
        }}
        pagination={{ pageSize: 20, hideOnSinglePage: true }}
        scroll={{ x: 'max-content' }}
      />
      </div>

      <CreateInvitePanel
        open={addOpen}
        form={form}
        saving={createMutation.isPending}
        onClose={closeAddPanel}
        onFinish={(values) => createMutation.mutate(values)}
      />
    </div>
  )
}

interface CreateInviteValues {
  note?: string
  maxUses: number
  expiresAt?: Dayjs
}

function CreateInvitePanel({
  open,
  form,
  saving,
  onClose,
  onFinish,
}: {
  open: boolean
  form: FormInstance<CreateInviteValues>
  saving: boolean
  onClose: () => void
  onFinish: (values: CreateInviteValues) => void
}) {
  const { t } = useTranslation()
  return (
    <DetailPanel
      open={open}
      title={t('Create invite code')}
      onClose={onClose}
      footer={
        <span className="ml-auto flex gap-2">
          <Button onClick={onClose}>{t('Cancel')}</Button>
          <Button type="primary" loading={saving} onClick={() => form.submit()}>
            {t('Create')}
          </Button>
        </span>
      }
    >
      <Form form={form} layout="vertical" initialValues={{ maxUses: 1 }} onFinish={onFinish}>
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
    </DetailPanel>
  )
}

