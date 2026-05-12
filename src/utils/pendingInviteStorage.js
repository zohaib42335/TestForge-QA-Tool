/** Persists invite link params so signup/login still sees them after URL changes. */

export const PENDING_INVITE_KEY = 'testforge_pending_invite'

/**
 * Call once on app startup (before auth). Saves `invite` + `project` from the query string.
 */
export function capturePendingInviteFromUrl() {
  if (typeof window === 'undefined') return
  try {
    const sp = new URLSearchParams(window.location.search || '')
    const invite = String(sp.get('invite') ?? '').trim()
    const project = String(sp.get('project') ?? '').trim()
    if (invite && project) {
      sessionStorage.setItem(PENDING_INVITE_KEY, JSON.stringify({ invite, project }))
    }
  } catch {
    // ignore quota / private mode
  }
}

/**
 * @returns {{ invite: string, project: string } | null}
 */
export function readPendingInviteFromStorage() {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(PENDING_INVITE_KEY)
    if (!raw) return null
    const p = JSON.parse(raw)
    const invite = typeof p.invite === 'string' ? p.invite.trim() : ''
    const project = typeof p.project === 'string' ? p.project.trim() : ''
    if (!invite || !project) return null
    return { invite, project }
  } catch {
    return null
  }
}

export function clearPendingInviteFromStorage() {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.removeItem(PENDING_INVITE_KEY)
  } catch {
    // ignore
  }
}
