/**
 * User-facing message from Firebase callable / HTTPS errors.
 * @param {unknown} err
 * @param {string} [fallback]
 * @returns {string}
 */
export function callableErrorMessage(err, fallback = 'Request failed.') {
  if (err && typeof err === 'object') {
    const code = 'code' in err ? String(err.code) : ''
    const message = 'message' in err ? String(err.message) : ''
    const details =
      'details' in err && err.details != null ? String(err.details) : ''

    if (message && message !== 'internal' && message !== 'INTERNAL') {
      return message
    }
    if (details) return details

    if (code.includes('unauthenticated')) {
      return 'Sign in required.'
    }
    if (code.includes('permission-denied')) {
      return 'You do not have permission to perform this action.'
    }
    if (code.includes('not-found')) {
      return 'The requested resource was not found.'
    }
    if (code.includes('failed-precondition')) {
      return 'Operation could not run. Check your workspace setup and try again.'
    }
    if (code.includes('unavailable') || code.includes('deadline-exceeded')) {
      return 'Cloud Functions are unavailable. Deploy functions or start the local emulator.'
    }
    if (code.includes('internal')) {
      return 'Server error. Deploy the latest Cloud Functions (deleteProject) or start the Functions emulator on port 5001.'
    }
  }
  if (err instanceof Error && err.message) {
    return err.message
  }
  return fallback
}
