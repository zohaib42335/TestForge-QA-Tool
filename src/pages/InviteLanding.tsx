import { useEffect } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { PENDING_INVITE_KEY } from '../utils/pendingInviteStorage.js'

/**
 * Public invite entry: `/invite/:token?project=...` persists params then opens onboarding.
 */
export default function InviteLanding() {
  const { token = '' } = useParams<{ token: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  useEffect(() => {
    const project = String(searchParams.get('project') ?? '').trim()
    const invite = String(token ?? '').trim()
    if (!invite) {
      navigate('/login', { replace: true })
      return
    }
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.setItem(
          PENDING_INVITE_KEY,
          JSON.stringify({ invite, project: project || '' }),
        )
      } catch {
        // ignore
      }
    }
    if (project) {
      navigate(
        `/onboarding?invite=${encodeURIComponent(invite)}&project=${encodeURIComponent(project)}`,
        { replace: true },
      )
    } else {
      navigate(`/onboarding?invite=${encodeURIComponent(invite)}`, { replace: true })
    }
  }, [token, searchParams, navigate])

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0F0F0F] text-neutral-400">
      <p className="text-sm">Redirecting…</p>
    </div>
  )
}
