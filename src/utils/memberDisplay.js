/**
 * Display names for members without exposing email in shared UI or audit metadata.
 */

/**
 * True if the string looks like an email address (simple check).
 * @param {string} s
 * @returns {boolean}
 */
function looksLikeEmail(s) {
  const t = String(s ?? '').trim()
  return t.includes('@') && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)
}

/**
 * Label for activity logs / actor dropdown: never use raw email as the visible name.
 * @param {string|null|undefined} storedActorName - Value from Firestore `actorName`
 * @returns {string}
 */
export function publicActorNameFromLog(storedActorName) {
  const s = String(storedActorName ?? '').trim()
  if (!s || looksLikeEmail(s)) return 'Team member'
  return s
}

/**
 * Name stored on activity log documents — never persist a raw email as the visible actor name.
 * @param {string|null|undefined} displayName
 * @returns {string}
 */
export function sanitizeActorNameForStorage(displayName) {
  const d = String(displayName ?? '').trim()
  if (d && !looksLikeEmail(d)) return d
  return 'Team member'
}

/**
 * Preferred display label for the signed-in user when writing activity (no email fallback).
 * @param {Record<string, unknown>|null|undefined} userProfile
 * @param {{ displayName?: string|null, email?: string|null }|null|undefined} user
 * @returns {string}
 */
export function getActorDisplayLabel(userProfile, user) {
  const fromProfile =
    userProfile && typeof userProfile.displayName === 'string' && userProfile.displayName.trim() !== ''
      ? userProfile.displayName.trim()
      : ''
  if (fromProfile && !looksLikeEmail(fromProfile)) return fromProfile
  const fromAuth =
    user && typeof user.displayName === 'string' && user.displayName.trim() !== ''
      ? user.displayName.trim()
      : ''
  if (fromAuth && !looksLikeEmail(fromAuth)) return fromAuth
  return 'Team member'
}

/**
 * @param {Record<string, unknown>|null|undefined} userProfile
 * @param {{ uid?: string, displayName?: string|null, email?: string|null }|null|undefined} user
 * @returns {{ uid: string, displayName: string, email: string, role: string }|null}
 */
export function buildActivityActor(userProfile, user) {
  const uid = user?.uid
  if (!uid || typeof uid !== 'string') return null
  const role =
    userProfile && typeof userProfile.role === 'string' && userProfile.role.trim() !== ''
      ? (String(userProfile.role).trim() === 'Tester'
          ? 'Member'
          : String(userProfile.role).trim())
      : 'Member'
  return {
    uid,
    displayName: getActorDisplayLabel(userProfile, user),
    email: user?.email ?? '',
    role,
  }
}

/**
 * Public name for a team row (Firestore user doc); never fall back to email for visible label.
 * @param {Record<string, unknown>} row
 * @returns {string}
 */
export function publicTeamMemberName(row) {
  const d = row.displayName != null ? String(row.displayName).trim() : ''
  if (d && !looksLikeEmail(d)) return d
  return 'Team member'
}
