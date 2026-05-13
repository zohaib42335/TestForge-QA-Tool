/**
 * Route guards: auth, onboarding, and project-ready shell access.
 */

import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useProject } from '../contexts/ProjectContext'

function FullScreenSpinner({ label }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#EEF2FB] text-[#5A6E9A] gap-4">
      <span
        className="inline-block h-10 w-10 animate-spin rounded-full border-2 border-[#1A3263] border-t-transparent"
        aria-hidden
      />
      <p className="font-mono text-sm">{label}</p>
    </div>
  )
}

/** Requires Firebase user; sends anonymous visitors to /login. */
export function PrivateRoute() {
  const { user, loading, configError } = useAuth()
  const location = useLocation()

  if (loading) {
    return <FullScreenSpinner label="Checking authentication…" />
  }

  if (configError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-white px-6 text-center">
        <p className="max-w-md text-sm text-red-700">{configError}</p>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return <Outlet />
}

/**
 * Requires an assigned project and completed onboarding (or legacy profile with projectId).
 */
export function ProjectRoute() {
  const { user, userProfile, roleLoading, workspaceError, retryWorkspaceProfile } = useAuth()
  const { loading: projectCtxLoading } = useProject()
  const location = useLocation()

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (roleLoading || !userProfile || projectCtxLoading) {
    return <FullScreenSpinner label="Loading your workspace…" />
  }

  if (workspaceError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-white px-6 text-center gap-4">
        <p className="max-w-md text-sm text-red-700">{workspaceError}</p>
        <button
          type="button"
          onClick={() => {
            void retryWorkspaceProfile()
          }}
          className="rounded-lg bg-[#1A3263] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#122247]"
        >
          Retry
        </button>
      </div>
    )
  }

  const pid =
    userProfile.projectId != null && String(userProfile.projectId).trim() !== ''
      ? String(userProfile.projectId).trim()
      : null
  const oc = userProfile.onboardingComplete

  if (oc === false || !pid) {
    return <Navigate to="/onboarding" replace state={{ from: location.pathname }} />
  }

  return <Outlet />
}

/**
 * Sends users who already have a project away from onboarding.
 * @param {{ children: import('react').ReactNode }} props
 */
export function OnboardingRoute({ children }) {
  const { user, userProfile, roleLoading } = useAuth()
  const location = useLocation()

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (roleLoading || !userProfile) {
    return <FullScreenSpinner label="Loading your profile…" />
  }

  const pid =
    userProfile.projectId != null && String(userProfile.projectId).trim() !== ''
      ? String(userProfile.projectId).trim()
      : null
  const oc = userProfile.onboardingComplete

  if (pid && oc !== false) {
    return <Navigate to="/dashboard" replace state={{ from: location.pathname }} />
  }

  return children
}
