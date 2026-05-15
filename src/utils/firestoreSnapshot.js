/**
 * Firestore DocumentSnapshot helpers (v9+ uses boolean `exists`; some mocks use `exists()`).
 * @param {{ exists?: boolean | (() => boolean) }} snap
 * @returns {boolean}
 */
export function snapshotExists(snap) {
  if (snap == null) return false
  if (typeof snap.exists === 'function') return snap.exists()
  return Boolean(snap.exists)
}
