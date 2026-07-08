import { Routes, Route, Link, Navigate, Outlet, useLocation } from 'react-router-dom'
import { Layout, Menu, Button, theme, Tooltip, Spin, Dropdown, Avatar } from 'antd'
import type { MenuProps } from 'antd'
import {
  DashboardOutlined,
  GlobalOutlined,
  LogoutOutlined,
  CloudOutlined,
  TeamOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  BulbOutlined,
  BulbFilled,
  FileTextOutlined,
  HistoryOutlined,
  KeyOutlined,
  UserOutlined,
  FileSearchOutlined,
  TranslationOutlined,
} from '@ant-design/icons'
import { lazy, Suspense, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore, getRoleFromToken, getEmailFromToken } from './stores/useAuthStore'
import { useThemeStore } from './stores/useThemeStore'
import ProtectedRoute from './components/ProtectedRoute'
import AccountSwitcher from './components/AccountSwitcher'
import './App.css'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const Domains = lazy(() => import('./pages/Domains'))
const DomainDetail = lazy(() => import('./pages/DomainDetail'))
const Accounts = lazy(() => import('./pages/Accounts'))
const Templates = lazy(() => import('./pages/Templates'))
const Jobs = lazy(() => import('./pages/Jobs'))
const Invites = lazy(() => import('./pages/Invites'))
const Users = lazy(() => import('./pages/Users'))
const AuditLogPage = lazy(() => import('./pages/AuditLog'))
const Login = lazy(() => import('./pages/Login'))
const Register = lazy(() => import('./pages/Register'))

const { Header, Content, Sider } = Layout

function MainLayout() {
  const { t, i18n } = useTranslation()
  const setToken = useAuthStore((s) => s.setToken)
  const authToken = useAuthStore((s) => s.token)
  const isAdmin = getRoleFromToken(authToken) === 'admin'
  const email = getEmailFromToken(authToken)
  const dark = useThemeStore((s) => s.dark)
  const toggleTheme = useThemeStore((s) => s.toggle)
  const [collapsed, setCollapsed] = useState(false)
  const location = useLocation()
  const { token } = theme.useToken()

  const menuItems = [
    { key: '/', icon: <DashboardOutlined />, label: <Link to="/">Dashboard</Link> },
    { key: '/domains', icon: <GlobalOutlined />, label: <Link to="/domains">Domains</Link> },
    { key: '/templates', icon: <FileTextOutlined />, label: <Link to="/templates">Templates</Link> },
    { key: '/jobs', icon: <HistoryOutlined />, label: <Link to="/jobs">{t('Jobs history')}</Link> },
    { key: '/accounts', icon: <TeamOutlined />, label: <Link to="/accounts">{t('Accounts')}</Link> },
  ]

  const adminMenuItems = [
    { key: '/users', icon: <UserOutlined />, label: <Link to="/users">{t('Users')}</Link> },
    { key: '/invites', icon: <KeyOutlined />, label: <Link to="/invites">{t('Invite codes')}</Link> },
    { key: '/audit', icon: <FileSearchOutlined />, label: <Link to="/audit">{t('Audit log')}</Link> },
  ]

  const visibleMenuItems: MenuProps['items'] = isAdmin
    ? [...menuItems, { type: 'group' as const, label: t('Admin'), children: adminMenuItems }]
    : menuItems

  const routeKeys = (isAdmin ? [...menuItems, ...adminMenuItems] : menuItems).map((m) => m.key)

  const selectedKey =
    routeKeys
      .filter((k) => (k === '/' ? location.pathname === '/' : location.pathname.startsWith(k)))
      .sort((a, b) => b.length - a.length)[0] || '/'

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        trigger={null}
        theme={dark ? 'dark' : 'light'}
        width={220}
        style={{ borderRight: `1px solid ${token.colorBorderSecondary}` }}
      >
        <div
          style={{
            height: 64,
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'flex-start',
            gap: 10,
            padding: '0 16px',
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 10,
              background: '#f6821f',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontSize: 18,
              flexShrink: 0,
            }}
          >
            <CloudOutlined />
          </div>
          {!collapsed && (
            <span style={{ fontWeight: 800, fontSize: 16, letterSpacing: '-0.02em', color: token.colorText }}>
              CF Tool
            </span>
          )}
        </div>
        <Menu
          theme={dark ? 'dark' : 'light'}
          mode="inline"
          selectedKeys={[selectedKey]}
          items={visibleMenuItems}
          style={{ borderInlineEnd: 'none' }}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '0 16px',
            height: 56,
            lineHeight: 'normal',
            position: 'sticky',
            top: 0,
            zIndex: 10,
            backdropFilter: 'blur(12px)',
            background: dark ? 'rgba(23,23,28,0.8)' : 'rgba(255,255,255,0.8)',
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
          }}
        >
          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed(!collapsed)}
          />
          <div style={{ flex: 1 }} />
          <AccountSwitcher />
          <Dropdown
            menu={{
              items: [
                { key: 'vi', label: 'Tiếng Việt' },
                { key: 'en', label: 'English' },
              ],
              selectedKeys: [i18n.language === 'vi' ? 'vi' : 'en'],
              onClick: ({ key }) => i18n.changeLanguage(key),
            }}
          >
            <Button type="text" icon={<TranslationOutlined />} style={{ marginLeft: 8 }}>
              {i18n.language === 'vi' ? 'VI' : 'EN'}
            </Button>
          </Dropdown>
          <Tooltip title={dark ? t('Light mode') : t('Dark mode')}>
            <Button
              type="text"
              icon={dark ? <BulbFilled /> : <BulbOutlined />}
              onClick={toggleTheme}
              style={{ marginLeft: 4 }}
            />
          </Tooltip>
          <Dropdown
            menu={{
              items: [{ key: 'logout', icon: <LogoutOutlined />, label: t('Logout'), danger: true }],
              onClick: ({ key }) => key === 'logout' && setToken(null),
            }}
          >
            <Avatar
              size={32}
              style={{
                background: 'rgba(246,130,31,0.15)',
                color: '#f6821f',
                fontWeight: 600,
                cursor: 'pointer',
                marginLeft: 8,
              }}
            >
              {email ? email.charAt(0).toUpperCase() : <UserOutlined />}
            </Avatar>
          </Dropdown>
        </Header>
        <Content style={{ background: token.colorBgLayout, overflow: 'auto' }}>
          <div style={{ maxWidth: 1400, margin: '0 auto', width: '100%' }}>
            <Outlet />
          </div>
        </Content>
      </Layout>
    </Layout>
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
            <Route index element={<Dashboard />} />
            <Route path="domains" element={<Domains />} />
            <Route path="domains/:zoneId" element={<DomainDetail />} />
            <Route path="templates" element={<Templates />} />
            <Route path="jobs" element={<Jobs />} />
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
