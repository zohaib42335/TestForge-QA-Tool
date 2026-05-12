/**
 * @fileoverview Relative time helpers for TestForge (e.g. run list meta lines).
 */

/**
 * @param {string|null|undefined} dateString - ISO date string
 * @returns {string}
 */
export function getRelativeTime(dateString) {
  if (!dateString) return 'unknown'
  const t = new Date(dateString).getTime()
  if (Number.isNaN(t)) return 'unknown'
  const diff = Date.now() - t
  const mins = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${Math.round(mins)} min ago`
  if (hours < 24) return `${Math.round(hours)} hr ago`
  const d = Math.round(days)
  return `${d} day${d > 1 ? 's' : ''} ago`
}
