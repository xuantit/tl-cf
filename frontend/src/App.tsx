import { Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom'
import { Spin } from 'antd'
import { lazy, Suspense } from 'react'
import ProtectedRoute from './components/ProtectedRoute'
import AppShell from './layouts/AppShell'
import './App.css'

const Domains = lazy(() => import('./pages/Domains'))
const DomainDetail = lazy(() => import('./pages/domain-detail'))
const Overview = lazy(() => import('./pages/Overview'))
const TagsPage = lazy(() => import('./pages/Tags'))
const SettingsPage = lazy(() => import('./pages/Settings'))
const Analytics = lazy(() => import('./pages/Analytics'))
const Accounts = lazy(() => import('./pages/Accounts'))
const Templates = lazy(() => import('./pages/Templates'))
const Tunnels = lazy(() => import('./pages/Tunnels'))
const Turnstile = lazy(() => import('./pages/Turnstile'))
const WorkersPages = lazy(() => import('./pages/WorkersPages'))
const History = lazy(() => import('./pages/History'))
const Invites = lazy(() => import('./pages/Invites'))
const Users = lazy(() => import('./pages/Users'))
const AuditLogPage = lazy(() => import('./pages/AuditLog'))
const More = lazy(() => import('./pages/More'))
const Login = lazy(() => import('./pages/Login'))
const Register = lazy(() => import('./pages/Register'))
const VerifyEmail = lazy(() => import('./pages/VerifyEmail'))

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
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/" element={<ProtectedRoute><Outlet /></ProtectedRoute>}>
          <Route element={<AppShell />}>
            <Route index element={<Domains />} />
            <Route path="overview" element={<Overview />} />
            <Route path="tags" element={<TagsPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="analytics" element={<Analytics />} />
            <Route path="domains" element={<RedirectWithQuery to="/" />} />
            <Route path="domains/:zoneId" element={<DomainDetail />} />
            <Route path="modern-rules" element={<RedirectZonePage tab="rules" />} />
            <Route path="rules" element={<RedirectZonePage tab="rules" extraParams={{ sub: 'legacy' }} />} />
            <Route path="dns" element={<RedirectZonePage tab="dns" />} />
            <Route path="cache" element={<RedirectZonePage tab="cache" />} />
            <Route path="templates" element={<Templates />} />
            <Route path="workers" element={<WorkersPages />} />
            <Route path="tunnels" element={<Tunnels />} />
            <Route path="turnstile" element={<Turnstile />} />
            <Route path="history" element={<History />} />
            <Route path="jobs" element={<RedirectWithQuery to="/history" extraParams={{ tab: 'jobs' }} />} />
            <Route path="changes" element={<RedirectWithQuery to="/history" extraParams={{ tab: 'changes' }} />} />
            <Route path="accounts" element={<Accounts />} />
            <Route path="invites" element={<Invites />} />
            <Route path="users" element={<Users />} />
            <Route path="audit" element={<AuditLogPage />} />
            <Route path="more" element={<More />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}

export default App
