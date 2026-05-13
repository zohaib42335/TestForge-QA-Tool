import { Routes, Route, Navigate } from 'react-router-dom'
import Login from '../components/Login.jsx'
import Signup from '../pages/Signup.tsx'
import InviteLanding from '../pages/InviteLanding.tsx'
import Onboarding from '../pages/Onboarding.tsx'
import Unauthorized from '../pages/Unauthorized'
import AppShell from '../layout/AppShell.jsx'
import { PrivateRoute, ProjectRoute } from './RouteGuards.jsx'
import { useAuth } from '../context/AuthContext.jsx'

function RootRedirect() {
  const { user, loading } = useAuth()
  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#EEF2FB] text-[#5A6E9A] gap-4">
        <span
          className="inline-block h-10 w-10 animate-spin rounded-full border-2 border-[#1A3263] border-t-transparent"
          aria-hidden
        />
        <p className="text-sm font-mono">Loading…</p>
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace />
  return <Navigate to="/dashboard" replace />
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/invite/:token" element={<InviteLanding />} />
      <Route path="/onboarding" element={<Onboarding />} />
      <Route element={<PrivateRoute />}>
        <Route element={<ProjectRoute />}>
          <Route path="/unauthorized" element={<Unauthorized />} />
          <Route path="*" element={<AppShell />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
