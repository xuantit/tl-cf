import { Routes, Route, Link, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Button, Spin, Dropdown, Avatar, Input } from 'antd'
import type { MenuProps } from 'antd'
import {
  GlobalOutlined,
  LogoutOutlined,
  CloudOutlined,
  TeamOutlined,
  BulbOutlined,
  BulbFilled,
  FileTextOutlined,
  HistoryOutlined,
  KeyOutlined,
  UserOutlined,
  FileSearchOutlined,
  TranslationOutlined,
  SearchOutlined,
  MenuOutlined,
  CloseOutlined,
} from '@ant-design/icons'
import { lazy, Suspense, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore, getRoleFromToken, getEmailFromToken } from './stores/useAuthStore'
import { useThemeStore } from './stores/useThemeStore'
import ProtectedRoute from './components/ProtectedRoute'
import AccountSwitcher from './components/AccountSwitcher'
import './App.css'

const Domains = lazy(() => import('./pages/Domains'))
const DomainDetail = lazy(() => import('./pages/DomainDetail'))
const Accounts = lazy(() => import('./pages/Accounts'))
const Templates = lazy(() => import('./pages/Templates'))
const History = lazy(() => import('./pages/History'))
const Invites = lazy(() => import('./pages/Invites'))
const Users = lazy(() => import('./pages/Users'))
const AuditLogPage = lazy(() => import('./pages/AuditLog'))
const Login = lazy(() => import('./pages/Login'))
const Register = lazy(() => import('./pages/Register'))

// Redirect legacy paths to their new location while preserving query params.
function RedirectWithQuery({ to, extraParams }: { to: string; extraParams?: Record<string, string> }) {
  const location = useLocation()
  const params = new URLSearchParams(location.search)
  for (const [key, value] of Object.entries(extraParams || {})) {
    params.set(key, value)
  }
  const search = params.toString()
  return <Navigate to={search ? `${to}?${search}` : to} replace />
}

// Redirect legacy zone-scoped pages (e.g. /dns?zone=X) into the domain hub tab.
function RedirectZonePage({ tab, extraParams }: { tab: string; extraParams?: Record<string, string> }) {
  const location = useLocation()
  const params = new URLSearchParams(location.search)
  const zone = params.get('zone')
  if (!zone) return <Navigate to="/" replace />
  params.delete('zone')
  params.set('tab', tab)
  for (const [key, value] of Object.entries(extraParams || {})) {
    params.set(key, value)
  }
  return <Navigate to={`/domains/${zone}?${params.toString()}`} replace />
}

function NavItem({ to, icon, label, active, onClick }: { to: string; icon: React.ReactNode; label: React.ReactNode; active: boolean; onClick?: () => void }) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className={`flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] transition-colors ${
        active
          ? 'bg-[rgba(246,130,31,0.12)] font-medium !text-[#f6821f]'
          : '!text-fg-secondary hover:bg-black/[0.04] hover:!text-fg dark:!text-fg-dark-secondary dark:hover:bg-white/[0.06] dark:hover:!text-fg-dark'
      }`}
    >
      <span className="text-base leading-none">{icon}</span>
      <span className="truncate">{label}</span>
    </Link>
  )
}

function MainLayout() {
  const { t, i18n } = useTranslation()
  const setToken = useAuthStore((s) => s.setToken)
  const authToken = useAuthStore((s) => s.token)
  const isAdmin = getRoleFromToken(authToken) === 'admin'
  const email = getEmailFromToken(authToken)
  const dark = useThemeStore((s) => s.dark)
  const toggleTheme = useThemeStore((s) => s.toggle)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [find, setFind] = useState('')
  const location = useLocation()
  const navigate = useNavigate()

  // Close the mobile sidebar after navigating
  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  const navItems = [
    { key: '/', icon: <GlobalOutlined />, label: 'Domains' },
    { key: '/templates', icon: <FileTextOutlined />, label: 'Templates' },
    { key: '/history', icon: <HistoryOutlined />, label: t('History') },
    { key: '/accounts', icon: <TeamOutlined />, label: t('Accounts') },
  ]

  const adminItems = [
    { key: '/users', icon: <UserOutlined />, label: t('Users') },
    { key: '/invites', icon: <KeyOutlined />, label: t('Invite codes') },
    { key: '/audit', icon: <FileSearchOutlined />, label: t('Audit log') },
  ]

  const routeKeys = (isAdmin ? [...navItems, ...adminItems] : navItems).map((m) => m.key)
  const selectedKey =
    routeKeys
      .filter((k) => (k === '/' ? location.pathname === '/' || location.pathname.startsWith('/domains') : location.pathname.startsWith(k)))
      .sort((a, b) => b.length - a.length)[0] || '/'

  const userMenuItems: MenuProps['items'] = [
    {
      key: 'lang',
      icon: <TranslationOutlined />,
      label: i18n.language === 'vi' ? 'English' : 'Tiếng Việt',
    },
    {
      key: 'theme',
      icon: dark ? <BulbFilled /> : <BulbOutlined />,
      label: dark ? t('Light mode') : t('Dark mode'),
    },
    { type: 'divider' as const },
    { key: 'logout', icon: <LogoutOutlined />, label: t('Logout'), danger: true },
  ]

  const onUserMenuClick: MenuProps['onClick'] = ({ key }) => {
    if (key === 'logout') setToken(null)
    else if (key === 'lang') i18n.changeLanguage(i18n.language === 'vi' ? 'en' : 'vi')
    else if (key === 'theme') toggleTheme()
  }

  const submitFind = () => {
    const q = find.trim()
    navigate(q ? `/?q=${encodeURIComponent(q)}` : '/')
    setFind('')
    setMobileOpen(false)
  }

  const sidebarBody = (
    <div className="flex h-full flex-col">
      {/* Account switcher (Vercel team-switcher position) */}
      <div className="flex items-center gap-2 px-3 pt-4 pb-2">
        <Link to="/" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#f6821f] text-[15px] !text-white">
          <CloudOutlined />
        </Link>
        <div className="min-w-0 flex-1">
          <AccountSwitcher />
        </div>
      </div>

      {/* Find */}
      <div className="px-3 pb-3">
        <Input
          size="small"
          prefix={<SearchOutlined className="text-fg-secondary" />}
          placeholder={t('Find domain…')}
          value={find}
          onChange={(e) => setFind(e.target.value)}
          onPressEnter={submitFind}
          allowClear
        />
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3">
        {navItems.map((item) => (
          <NavItem key={item.key} to={item.key} icon={item.icon} label={item.label} active={selectedKey === item.key} />
        ))}
        {isAdmin && (
          <>
            <div className="px-2 pt-4 pb-1 text-[11px] font-semibold tracking-wider text-fg-secondary uppercase dark:text-fg-dark-secondary">
              Admin
            </div>
            {adminItems.map((item) => (
              <NavItem key={item.key} to={item.key} icon={item.icon} label={item.label} active={selectedKey === item.key} />
            ))}
          </>
        )}
      </nav>

      {/* User footer */}
      <div className="border-t border-stroke px-3 py-3 dark:border-stroke-dark">
        <Dropdown menu={{ items: userMenuItems, onClick: onUserMenuClick }} placement="topLeft">
          <button className="flex w-full cursor-pointer items-center gap-2 rounded-md border-0 bg-transparent px-2 py-1.5 text-left hover:bg-black/[0.04] dark:hover:bg-white/[0.06]">
            <Avatar size={26} style={{ background: 'rgba(246,130,31,0.15)', color: '#f6821f', fontWeight: 600, flexShrink: 0 }}>
              {email ? email.charAt(0).toUpperCase() : <UserOutlined />}
            </Avatar>
            <span className="min-w-0 flex-1 truncate text-[13px] text-fg-secondary dark:text-fg-dark-secondary">{email}</span>
          </button>
        </Dropdown>
      </div>
    </div>
  )

  return (
    <div className="flex min-h-screen bg-bg dark:bg-bg-dark">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-[230px] shrink-0 border-r border-stroke bg-bg-secondary lg:block dark:border-stroke-dark dark:bg-bg-dark-secondary">
        {sidebarBody}
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/45 lg:hidden" onClick={() => setMobileOpen(false)} />
          <aside className="fixed inset-y-0 left-0 z-50 w-[260px] border-r border-stroke bg-bg-secondary lg:hidden dark:border-stroke-dark dark:bg-bg-dark-secondary">
            {sidebarBody}
          </aside>
        </>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-stroke bg-bg/90 px-3 py-2 backdrop-blur lg:hidden dark:border-stroke-dark dark:bg-bg-dark/90">
          <Button
            type="text"
            icon={mobileOpen ? <CloseOutlined /> : <MenuOutlined />}
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="Menu"
          />
          <Link to="/" className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[#f6821f] text-[15px] !text-white">
              <CloudOutlined />
            </span>
            <span className="text-[15px] font-bold tracking-tight !text-fg dark:!text-fg-dark">CF Tool</span>
          </Link>
          <div className="flex-1" />
          <Dropdown menu={{ items: userMenuItems, onClick: onUserMenuClick }}>
            <Avatar size={30} style={{ background: 'rgba(246,130,31,0.15)', color: '#f6821f', fontWeight: 600, cursor: 'pointer' }}>
              {email ? email.charAt(0).toUpperCase() : <UserOutlined />}
            </Avatar>
          </Dropdown>
        </header>

        <main className="min-w-0 flex-1">
          <div className="mx-auto w-full max-w-[1200px]">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}

function App() {
  return (
    <Suspense
      fallback={
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Spin size="large" />
        </div>
      }
    >
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/" element={<ProtectedRoute><Outlet /></ProtectedRoute>}>
          <Route element={<MainLayout />}>
            <Route index element={<Domains />} />
            <Route path="domains" element={<RedirectWithQuery to="/" />} />
            <Route path="domains/:zoneId" element={<DomainDetail />} />
            <Route path="modern-rules" element={<RedirectZonePage tab="rules" />} />
            <Route path="rules" element={<RedirectZonePage tab="rules" extraParams={{ sub: 'legacy' }} />} />
            <Route path="dns" element={<RedirectZonePage tab="dns" />} />
            <Route path="cache" element={<RedirectZonePage tab="cache" />} />
            <Route path="templates" element={<Templates />} />
            <Route path="history" element={<History />} />
            <Route path="jobs" element={<RedirectWithQuery to="/history" extraParams={{ tab: 'jobs' }} />} />
            <Route path="changes" element={<RedirectWithQuery to="/history" extraParams={{ tab: 'changes' }} />} />
            <Route path="accounts" element={<Accounts />} />
            <Route path="invites" element={<Invites />} />
            <Route path="users" element={<Users />} />
            <Route path="audit" element={<AuditLogPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}

export default App
