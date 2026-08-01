import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Dropdown, Modal, Table, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useTranslation } from 'react-i18next'
import { api, apiErrorDetail } from '../services/api'
import { useAuthStore, getUserIdFromToken } from '../stores/useAuthStore'
import PageHeader from '../components/PageHeader'
import ConfirmDestructive from '../components/ConfirmDestructive'
import { Banner, Dot, EmptyState, Tag } from '../components/ui'

interface AdminUser {
  id: string
  email: string
  role: 'user' | 'admin'
  isActive: boolean
  createdAt: string
  cfAccountCount: number
  templateCount: number
}

function formatDay(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export default function Users() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const myUserId = getUserIdFromToken(useAuthStore((s) => s.token))
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null)

  const { data: users = [], isLoading, isError, error, refetch, isFetching } = useQuery<AdminUser[]>({
    queryKey: ['users'],
    queryFn: async () => (await api.get('/users')).data,
  })

  const errDetail = (e: unknown) =>
    (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail

  const patchMutation = useMutation({
    mutationFn: async ({ id, ...body }: { id: string; isActive?: boolean; role?: string }) =>
      api.patch(`/users/${id}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      message.success(t('User updated'))
    },
    onError: (e: unknown) => message.error(errDetail(e) || t('Update failed')),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/users/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      setDeleteTarget(null)
      message.success(t('User deleted'))
    },
    onError: (e: unknown) => message.error(errDetail(e) || t('Delete failed')),
  })

  const adminCount = users.filter((u) => u.role === 'admin').length

  const confirmLock = (u: AdminUser) => {
    Modal.confirm({
      title: u.isActive ? t('Lock this user?') : t('Unlock this user?'),
      content: u.isActive ? t('The user will be logged out and unable to sign in.') : undefined,
      okText: u.isActive ? t('Lock') : t('Unlock'),
      cancelText: t('Cancel'),
      okButtonProps: u.isActive ? { danger: true } : undefined,
      onOk: () => patchMutation.mutate({ id: u.id, isActive: !u.isActive }),
    })
  }

  const columns: ColumnsType<AdminUser> = [
    {
      title: 'Email',
      dataIndex: 'email',
      render: (email: string, r) => (
        <span className="inline-flex items-center gap-[5px]">
          <span className="font-mono text-[12px] font-medium text-fg">{email}</span>
          {r.id === myUserId && <Tag variant="acc">{t('you')}</Tag>}
        </span>
      ),
    },
    {
      title: t('Role'),
      dataIndex: 'role',
      width: 90,
      render: (role: AdminUser['role']) => (
        <Tag variant={role === 'admin' ? 'err' : 'default'}>{role}</Tag>
      ),
    },
    {
      title: 'CF acc',
      dataIndex: 'cfAccountCount',
      width: 80,
      responsive: ['md'],
      render: (v: number) => (
        <span className={`font-mono text-[11.5px] ${v === 0 ? 'text-fg-3' : 'text-fg-2'}`}>{v}</span>
      ),
    },
    {
      title: 'Templates',
      dataIndex: 'templateCount',
      width: 90,
      responsive: ['md'],
      render: (v: number) => (
        <span className={`font-mono text-[11.5px] ${v === 0 ? 'text-fg-3' : 'text-fg-2'}`}>{v}</span>
      ),
    },
    {
      title: t('Status'),
      dataIndex: 'isActive',
      width: 110,
      render: (isActive: boolean) => (
        <span className="inline-flex items-center gap-[6px]">
          <Dot status={isActive ? 'ok' : 'off'} />
          <span className="text-[12px]">{isActive ? 'active' : t('locked')}</span>
        </span>
      ),
    },
    {
      title: t('Created at'),
      dataIndex: 'createdAt',
      width: 120,
      responsive: ['lg'],
      render: (v: string) => <span className="font-mono text-[11px] text-fg-3">{formatDay(v)}</span>,
    },
    {
      title: '',
      key: 'actions',
      width: 44,
      align: 'right',
      render: (_, r) => {
        const isSelf = r.id === myUserId
        return (
          <Dropdown
            trigger={['click']}
            disabled={isSelf}
            menu={{
              items: [
                { key: 'lock', label: r.isActive ? t('Lock account') : t('Unlock') },
                {
                  key: 'role',
                  label: r.role === 'admin' ? t('Change role to user') : t('Change role to admin'),
                },
                { type: 'divider' },
                { key: 'delete', label: t('Delete user'), danger: true },
              ],
              onClick: ({ key, domEvent }) => {
                domEvent.stopPropagation()
                if (key === 'lock') confirmLock(r)
                if (key === 'role')
                  patchMutation.mutate({ id: r.id, role: r.role === 'admin' ? 'user' : 'admin' })
                if (key === 'delete') setDeleteTarget(r)
              },
            }}
          >
            <Button size="small" type="text" disabled={isSelf} aria-label={t('User actions')}>
              ⋯
            </Button>
          </Dropdown>
        )
      },
    },
  ]

  return (
    <div className="fade-in p-[clamp(12px,3vw,24px)]">
      <PageHeader
        title={t('Users')}
        crumb={t('{{count}} accounts · {{admins}} admin', { count: users.length, admins: adminCount })}
        actions={
          <Button onClick={() => refetch()} loading={isFetching}>
            ↻ {t('Reload')}
          </Button>
        }
      />
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
          {apiErrorDetail(error) || t('Could not load users')}
        </Banner>
      )}
      <Table
        rowKey="id"
        columns={columns}
        dataSource={users}
        loading={isLoading}
        rowClassName={(r) => (r.isActive ? '' : 'opacity-50')}
        locale={{
          emptyText: <EmptyState icon="◉" title={t('No users')} desc={t('Invite users with an invite code')} />,
        }}
        pagination={{ pageSize: 20, hideOnSinglePage: true }}
        scroll={{ x: 'max-content' }}
      />

      <ConfirmDestructive
        open={!!deleteTarget}
        title={t('Delete user {{email}}?', { email: deleteTarget?.email || '' })}
        items={
          deleteTarget
            ? [{ key: deleteTarget.id, label: deleteTarget.email, meta: deleteTarget.role }]
            : []
        }
        explanation={t('All {{count}} CF accounts, domains and templates of this user will be permanently deleted.', {
          count: deleteTarget?.cfAccountCount ?? 0,
        })}
        confirmText={deleteTarget?.email || ''}
        loading={deleteMutation.isPending}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
