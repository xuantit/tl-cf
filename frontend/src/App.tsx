import { Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import { Spin } from 'antd'
import ProtectedRoute from './components/ProtectedRoute'
import AppShell from './components/nav/AppShell'

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
          <Route element={<AppShell />}>
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
