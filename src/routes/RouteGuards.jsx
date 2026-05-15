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

function SuspendedWorkspaceScreen({ projectName, onSignOut }) {
  const pname =
    projectName != null && String(projectName).trim() !== '' ? String(projectName).trim() : 'this workspace'
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#EEF2FB] px-6 text-center">
      <div className="max-w-md rounded-xl border border-red-200 bg-white px-8 py-10 shadow-sm">
        <h1 className="text-lg font-semibold text-[#1A3263]">Your account has been suspended</h1>
        <p className="mt-3 text-sm text-[#5A6E9A]">
          <span className="font-medium text-[#1A3263]">{pname}</span>
          <br />
          Contact your workspace admin for help.
        </p>
        <button
          type="button"
          onClick={() => {
            void onSignOut()
          }}
          className="mt-8 w-full rounded-lg bg-[#1A3263] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#122247]"
        >
          Sign Out
        </button>
      </div>
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
  const { user, userProfile, roleLoading, workspaceError, retryWorkspaceProfile, signOutUser } =
    useAuth()
  const { loading: projectCtxLoading, memberData, project } = useProject()
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

  const memberStatus =
    memberData && typeof memberData.status === 'string' ? memberData.status.trim().toLowerCase() : ''
  if (memberStatus === 'suspended') {
    const projectName =
      project && typeof project.name === 'string' && project.name.trim() !== '' ? project.name.trim() : ''
    return <SuspendedWorkspaceScreen projectName={projectName} onSignOut={signOutUser} />
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
