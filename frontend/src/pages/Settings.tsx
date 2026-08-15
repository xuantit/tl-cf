import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Input, Popconfirm, Segmented, Select, Switch } from 'antd'
import { message } from '../lib/antdApp'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api, apiErrorDetail } from '../services/api'
import { useThemeStore } from '../stores/useThemeStore'
import { useUiPrefStore, type TableDensity } from '../stores/useUiPrefStore'
import PageHeader from '../components/PageHeader'
import { Banner, KvRow, Lbl, SectionHeader, SkeletonLine, StrengthMeter, Tag } from '../components/ui'
import { describeUserAgent, formatAgo } from '../utils/format'

interface Me {
  userId: string
  email: string
  role: string
  displayName: string | null
  createdAt: string
}

interface SessionInfo {
  id: string
  userAgent: string | null
  ip: string | null
  createdAt: string
  lastSeenAt: string
  current: boolean
}



function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-[5px] block font-mono text-[11px] uppercase tracking-[.09em] text-fg-3">
      {children}
    </label>
  )
}

function ProfileTab({ me }: { me: Me }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  // null = "not edited yet" so we never need a sync-state effect
  const [displayNameDraft, setDisplayNameDraft] = useState<string | null>(null)
  const displayName = displayNameDraft ?? me.displayName ?? ''

  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const mismatch = confirmPw !== '' && confirmPw !== newPw
  const canSubmitPassword = currentPw !== '' && newPw.length >= 8 && confirmPw === newPw

  const saveProfileMutation = useMutation({
    mutationFn: async () => (await api.patch('/auth/me', { displayName: displayName.trim() })).data,
    onSuccess: () => {
      message.success(t('Profile saved'))
      setDisplayNameDraft(null)
      queryClient.invalidateQueries({ queryKey: ['me'] })
    },
    onError: (error) => {
      message.error(apiErrorDetail(error) || t('Could not save the profile'))
    },
  })

  const changePasswordMutation = useMutation({
    mutationFn: async () =>
      (await api.post('/auth/change-password', { currentPassword: currentPw, newPassword: newPw })).data,
    onSuccess: () => {
      message.success(t('Password changed'))
      setCurrentPw('')
      setNewPw('')
      setConfirmPw('')
    },
    onError: (error) => {
      message.error(apiErrorDetail(error) || t('Could not change the password'))
    },
  })

  return (
    <div className="grid grid-cols-1 border-b border-stroke md:grid-cols-2">
      <div className="border-b border-stroke p-[13px_16px] md:border-b-0">
        <Lbl className="mb-[11px] block">{t('Profile')}</Lbl>
        <div className="mb-3">
          <FieldLabel>Email</FieldLabel>
          <Input value={me.email} disabled className="font-mono" />
          <div className="mt-1 font-mono text-[11px] text-fg-3">
            {t('Cannot be changed. Contact an admin if needed.')}
          </div>
        </div>
        <div className="mb-3">
          <FieldLabel>{t('Display name')}</FieldLabel>
          <Input
            value={displayName}
            maxLength={60}
            placeholder={t('Display name')}
            onChange={(e) => setDisplayNameDraft(e.target.value)}
          />
        </div>
        <div className="mb-3">
          <FieldLabel>{t('Role')}</FieldLabel>
          <Input value={me.role} disabled className="font-mono" />
        </div>
        <Button
          type="primary"
          loading={saveProfileMutation.isPending}
          disabled={displayNameDraft === null || displayNameDraft === (me.displayName ?? '')}
          onClick={() => saveProfileMutation.mutate()}
        >
          {t('Save profile')}
        </Button>
      </div>

      <div className="p-[13px_16px] md:border-l md:border-l-stroke">
        <Lbl className="mb-[11px] block">{t('Change password')}</Lbl>
        <div className="mb-3">
          <FieldLabel>{t('Current password')}</FieldLabel>
          <Input.Password
            value={currentPw}
            autoComplete="current-password"
            aria-label={t('Current password')}
            onChange={(e) => setCurrentPw(e.target.value)}
          />
        </div>
        <div className="mb-3">
          <FieldLabel>{t('New password')}</FieldLabel>
          <Input.Password
            value={newPw}
            autoComplete="new-password"
            aria-label={t('New password')}
            onChange={(e) => setNewPw(e.target.value)}
          />
          <StrengthMeter password={newPw} />
        </div>
        <div className="mb-3">
          <FieldLabel>{t('Confirm new password')}</FieldLabel>
          <Input.Password
            value={confirmPw}
            autoComplete="new-password"
            aria-label={t('Confirm new password')}
            status={mismatch ? 'error' : undefined}
            onChange={(e) => setConfirmPw(e.target.value)}
          />
          {mismatch && (
            <div className="mt-1 font-mono text-[11px] text-danger">
              ✕ {t('Passwords do not match')}
            </div>
          )}
        </div>
        <Button
          type="primary"
          disabled={!canSubmitPassword}
          loading={changePasswordMutation.isPending}
          onClick={() => changePasswordMutation.mutate()}
        >
          {t('Change password')}
        </Button>
        <div className="mt-[9px] font-mono text-[11px] text-fg-2">
          ⓘ {t('Other signed-in sessions stay active after a password change.')}
        </div>
      </div>
    </div>
  )
}

function AppearanceTab() {
  const { t, i18n } = useTranslation()
  const dark = useThemeStore((s) => s.dark)
  const toggleTheme = useThemeStore((s) => s.toggle)
  const density = useUiPrefStore((s) => s.density)
  const setDensity = useUiPrefStore((s) => s.setDensity)

  return (
    <div className="border-b border-stroke p-[13px_16px] md:max-w-[520px]">
      <Lbl className="mb-[9px] block">{t('Appearance & behavior')}</Lbl>
      <KvRow
        k={t('Dark theme')}
        v={<Switch size="small" checked={dark} onChange={toggleTheme} aria-label={t('Dark theme')} />}
      />
      <KvRow
        k={t('Language')}
        v={
          <Select
            size="small"
            value={i18n.language.startsWith('vi') ? 'vi' : 'en'}
            onChange={(lang) => i18n.changeLanguage(lang)}
            options={[
              { value: 'vi', label: 'Tiếng Việt' },
              { value: 'en', label: 'English' },
            ]}
            className="min-w-[120px]"
          />
        }
      />
      <div className="flex min-h-[34px] items-center justify-between border-b border-stroke-2 py-1 text-[12.5px] last:border-b-0">
        <span className="text-fg-2">{t('Table density')}</span>
        <Segmented
          size="small"
          value={density}
          onChange={(value) => setDensity(value as TableDensity)}
          options={[
            { value: 'compact', label: t('Dense') },
            { value: 'comfortable', label: t('Comfortable') },
            { value: 'spacious', label: t('Spacious') },
          ]}
        />
      </div>
    </div>
  )
}

function SessionsSection() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const {
    data: sessions = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<SessionInfo[]>({
    queryKey: ['sessions'],
    queryFn: async () => (await api.get('/auth/sessions')).data,
  })

  const revokeOne = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/auth/sessions/${id}`)).data,
    onSuccess: () => {
      message.success(t('Session revoked'))
      queryClient.invalidateQueries({ queryKey: ['sessions'] })
    },
    onError: (err) => {
      message.error(apiErrorDetail(err) || t('Could not revoke the session'))
    },
  })

  const revokeAll = useMutation({
    mutationFn: async (): Promise<{ revoked: number }> => (await api.delete('/auth/sessions')).data,
    onSuccess: (data: { revoked: number }) => {
      message.success(
        t('Revoked {{count}} other sessions. This session stays signed in.', { count: data.revoked }),
      )
      queryClient.invalidateQueries({ queryKey: ['sessions'] })
    },
    onError: (err) => {
      message.error(apiErrorDetail(err) || t('Could not revoke the sessions'))
    },
  })

  return (
    <div>
      <SectionHeader
        title={`${t('Sessions')} · ${sessions.length} ${t('devices')}`}
        actions={
          <Popconfirm
            title={t('Sign out all other sessions?')}
            description={t('This session stays signed in.')}
            okText={t('Sign out all')}
            okButtonProps={{ danger: true }}
            onConfirm={() => revokeAll.mutate()}
          >
            <Button size="small" danger loading={revokeAll.isPending} disabled={sessions.length < 2}>
              {t('Sign out all')}
            </Button>
          </Popconfirm>
        }
      />
      {isError ? (
        <Banner
          tone="err"
          actions={
            <Button size="small" onClick={() => refetch()}>
              ↻ {t('Retry')}
            </Button>
          }
        >
          {apiErrorDetail(error) || t('Could not load sessions')}
        </Banner>
      ) : isLoading ? (
        <div className="flex flex-col gap-[12px] p-4" data-testid="sessions-skeleton">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonLine key={i} width={`${80 - i * 14}%`} />
          ))}
        </div>
      ) : (
        <div className="border-b border-stroke">
          {sessions.map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-3 border-0 border-b border-solid border-stroke-2 px-4 py-[8px] last:border-b-0"
            >
              <div className="min-w-0 flex-1">
                <span className="font-mono text-[12px] text-fg">{describeUserAgent(s.userAgent)}</span>
                {s.current && (
                  <Tag variant="acc" className="ml-[6px]">
                    {t('current')}
                  </Tag>
                )}
              </div>
              <span className="hidden font-mono text-[12px] text-fg-2 sm:inline">{s.ip || '—'}</span>
              <span className="w-[44px] text-right font-mono text-[11.5px] text-fg-3">
                {formatAgo(s.lastSeenAt)}
              </span>
              {s.current ? (
                <span className="w-[52px] text-right font-mono text-[11px] text-fg-3">—</span>
              ) : (
                <Popconfirm
                  title={t('Revoke this session?')}
                  okText={t('Revoke')}
                  okButtonProps={{ danger: true }}
                  onConfirm={() => revokeOne.mutate(s.id)}
                >
                  <button
                    type="button"
                    className="w-[52px] cursor-pointer border-0 bg-transparent p-0 text-right font-mono text-[11px] text-danger hover:underline"
                  >
                    {t('revoke')}
                  </button>
                </Popconfirm>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="px-4 py-[9px] font-mono text-[11px] text-fg-2">
        ⓘ {t('Revoking a session signs that device out immediately.')}
      </div>
    </div>
  )
}

function SecurityTab() {
  const { t } = useTranslation()
  const confirmDanger = useUiPrefStore((s) => s.confirmDanger)
  const setConfirmDanger = useUiPrefStore((s) => s.setConfirmDanger)

  return (
    <div className="border-b border-stroke">
      <div className="p-[13px_16px] md:max-w-[520px]">
        <Lbl className="mb-[9px] block">{t('Safety')}</Lbl>
        <KvRow
          k={t('Confirm dangerous actions')}
          v={
            <Switch
              size="small"
              checked={confirmDanger}
              onChange={setConfirmDanger}
              aria-label={t('Confirm dangerous actions')}
            />
          }
        />
        <div className="mt-[9px] font-mono text-[11px] text-fg-3">
          {t('When off, destructive confirms no longer require typing the confirmation text.')}
        </div>
      </div>
      <SessionsSection />
    </div>
  )
}

/** Settings (route /settings) — 2.html "settings" view: Hồ sơ / Giao diện / Bảo mật. */
export default function Settings() {
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = searchParams.get('tab') || 'profile'

  const { data: me, isLoading } = useQuery<Me>({
    queryKey: ['me'],
    queryFn: async () => (await api.get('/auth/me')).data,
  })

  return (
    <div className="fade-in p-[clamp(12px,3vw,24px)]">
      <PageHeader
        title={t('Settings')}
        crumb={me ? `${me.email} · ${me.role}` : undefined}
        tabs={[
          { key: 'profile', label: t('Profile') },
          { key: 'appearance', label: t('Appearance') },
          { key: 'security', label: t('Security') },
        ]}
        activeTab={tab}
        onTabChange={(key) =>
          setSearchParams(key === 'profile' ? {} : { tab: key }, { replace: true })
        }
      />

      {tab === 'profile' &&
        (isLoading || !me ? (
          <div className="flex flex-col gap-[14px] p-4" data-testid="settings-skeleton">
            {Array.from({ length: 5 }).map((_, i) => (
              <SkeletonLine key={i} width={`${84 - i * 10}%`} />
            ))}
          </div>
        ) : (
          <ProfileTab me={me} />
        ))}
      {tab === 'appearance' && <AppearanceTab />}
      {tab === 'security' && <SecurityTab />}
    </div>
  )
}
