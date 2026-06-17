import { Routes, Route, Link, Navigate, Outlet } from 'react-router-dom'
import { Layout, Menu, Button } from 'antd'
import { DashboardOutlined, GlobalOutlined, DatabaseOutlined, ThunderboltOutlined, SafetyOutlined, FileTextOutlined, UserOutlined, LogoutOutlined, SettingOutlined, CloudOutlined } from '@ant-design/icons'
import { useAuthStore } from './stores/useAuthStore'
import ProtectedRoute from './components/ProtectedRoute'
import Dashboard from './pages/Dashboard'
import Domains from './pages/Domains'
import DomainDetail from './pages/DomainDetail'
import CloudflareCredentials from './pages/CloudflareCredentials'
import DNS from './pages/DNS'
import Cache from './pages/Cache'
import Rules from './pages/Rules'
import Templates from './pages/Templates'
import Accounts from './pages/Accounts'
import Login from './pages/Login'
import Register from './pages/Register'
import './App.css'

const { Header, Content } = Layout

function MainLayout() {
  const setToken = useAuthStore((s) => s.setToken)
  const menuItems = [
    { key: '/', icon: <DashboardOutlined />, label: <Link to="/">Dashboard</Link> },
    { key: '/domains', icon: <GlobalOutlined />, label: <Link to="/domains">Domains</Link> },
    { key: '/cf-credentials', icon: <SettingOutlined />, label: <Link to="/cf-credentials">CF Credentials</Link> },
  ]

  return (
    <Layout style={{ minHeight: '100vh', background: '#f5f5f5' }}>
      <Header
        style={{
          display: 'flex',
          alignItems: 'center',
          background: '#001529',
          padding: '0 24px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        }}
      >
        <div style={{ color: '#fff', marginRight: 32, fontWeight: 600, fontSize: 18 }}>
          <CloudOutlined style={{ marginRight: 8 }} />
          Cloudflare Tool
        </div>
        <Menu
          theme="dark"
          mode="horizontal"
          items={menuItems}
          style={{ flex: 1, minWidth: 0 }}
        />
        <Button
          type="text"
          icon={<LogoutOutlined />}
          onClick={() => setToken(null)}
          style={{ color: '#fff' }}
        >
          Logout
        </Button>
      </Header>
      <Content style={{ padding: 0, background: '#f5f5f5' }}>
        <Outlet />
      </Content>
    </Layout>
  )
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/" element={<ProtectedRoute><Outlet /></ProtectedRoute>}>
        <Route element={<MainLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="domains" element={<Domains />} />
          <Route path="domains/:zoneId" element={<DomainDetail />} />
          <Route path="cf-credentials" element={<CloudflareCredentials />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
