import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Card,
  Table,
  Tag,
  Typography,
  Button,
  Space,
  Popconfirm,
  Tooltip,
  Select,
} from 'antd'
import {
  ReloadOutlined,
  DeleteOutlined,
  LockOutlined,
  UnlockOutlined,
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { useTranslation } from 'react-i18next'
import { api } from '../services/api'
import { message } from '../lib/antdApp'
import { useAuthStore, getUserIdFromToken } from '../stores/useAuthStore'

const { Title, Text } = Typography

interface AdminUser {
  id: string
  email: string
  role: 'user' | 'admin'
  isActive: boolean
  createdAt: string
  cfAccountCount: number
  templateCount: number
}

export default function Users() {
  const { t, i18n } = useTranslation()
  const dateLocale = i18n.language === 'vi' ? 'vi-VN' : 'en-US'
  const queryClient = useQueryClient()
  const myUserId = getUserIdFromToken(useAuthStore((s) => s.token))

  const { data: users = [], isLoading, refetch, isFetching } = useQuery<AdminUser[]>({
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
      message.success(t('User deleted'))
    },
    onError: (e: unknown) => message.error(errDetail(e) || t('Delete failed')),
  })

  const columns: ColumnsType<AdminUser> = [
    {
      title: 'Email',
      dataIndex: 'email',
      render: (email: string, r) => (
        <Space>
          <Text strong={r.id === myUserId}>{email}</Text>
          {r.id === myUserId && <Tag color="orange" variant="filled">{t('You')}</Tag>}
        </Space>
      ),
    },
    {
      title: t('Role'),
      dataIndex: 'role',
      width: 130,
      render: (role: AdminUser['role'], r) => (
        <Select
          aria-label={`${t('Role')}: ${r.email}`}
          size="small"
          value={role}
          disabled={r.id === myUserId || patchMutation.isPending}
          onChange={(v) => patchMutation.mutate({ id: r.id, role: v })}
          options={[
            { value: 'user', label: 'User' },
            { value: 'admin', label: 'Admin' },
          ]}
          style={{ width: 100 }}
        />
      ),
    },
    {
      title: t('Status'),
      dataIndex: 'isActive',
      width: 120,
      render: (isActive: boolean) =>
        isActive ? <Tag color="green" variant="filled">{t('Active')}</Tag> : <Tag color="red" variant="filled">{t('Locked')}</Tag>,
    },
    {
      title: t('CF accounts'),
      dataIndex: 'cfAccountCount',
      width: 110,
      align: 'center',
    },
    {
      title: 'Templates',
      dataIndex: 'templateCount',
      width: 100,
      align: 'center',
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
      width: 100,
      render: (_, r) => {
        const isSelf = r.id === myUserId
        return (
          <Space>
            <Tooltip title={r.isActive ? t('Lock account') : t('Unlock')}>
              <Popconfirm
                title={r.isActive ? t('Lock this user?') : t('Unlock this user?')}
                description={r.isActive ? t('The user will be logged out and unable to sign in.') : undefined}
                onConfirm={() => patchMutation.mutate({ id: r.id, isActive: !r.isActive })}
                okText={r.isActive ? t('Lock') : t('Unlock')}
                cancelText={t('Cancel')}
                disabled={isSelf}
              >
                <Button
                  type="text"
                  size="small"
                  disabled={isSelf}
                  icon={r.isActive ? <LockOutlined /> : <UnlockOutlined />}
                />
              </Popconfirm>
            </Tooltip>
            <Tooltip title={t('Delete user')}>
              <Popconfirm
                title={t('Delete this user?')}
                description={t('All {{count}} CF accounts, domains and templates of this user will be permanently deleted.', { count: r.cfAccountCount })}
                onConfirm={() => deleteMutation.mutate(r.id)}
                okText={t('Delete')}
                okButtonProps={{ danger: true }}
                cancelText={t('Cancel')}
                disabled={isSelf}
              >
                <Button type="text" danger size="small" disabled={isSelf} icon={<DeleteOutlined />} />
              </Popconfirm>
            </Tooltip>
          </Space>
        )
      },
    },
  ]

  return (
    <div style={{ padding: 'clamp(12px, 3vw, 24px)' }}>
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <Title level={2} style={{ fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 4 }}>
            {t('Users')}
          </Title>
          <Text type="secondary">
            {t('Locking an account immediately invalidates its token. Deleting a user removes all their data.')}
          </Text>
        </div>
        <Button icon={<ReloadOutlined />} onClick={() => refetch()} loading={isFetching}>
          {t('Reload')}
        </Button>
      </div>
      <Card>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={users}
          loading={isLoading}
          pagination={{ pageSize: 20, hideOnSinglePage: true }}
          scroll={{ x: 'max-content' }}
        />
      </Card>
    </div>
  )
}
