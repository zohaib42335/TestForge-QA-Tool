/**
 * @fileoverview Hook for triggering the autoCreateBug Firebase callable function.
 * Wraps the Cloud Function call with loading/error state management.
 */

import { useState, useCallback } from 'react'
import { httpsCallable } from 'firebase/functions'
import { getFirebaseFunctions } from '../firebase/config.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extracts a user-facing error message from a Firebase HttpsError or generic Error.
 * @param {unknown} err
 * @returns {string}
 */
function extractErrorMessage(err) {
  if (!err || typeof err !== 'object') return 'An unexpected error occurred.'
  const msg = /** @type {any} */ (err).message
  if (typeof msg === 'string' && msg.trim()) return msg.trim()
  return 'An unexpected error occurred. Please try again.'
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} AutoCreateBugOptions
 * @property {string} projectId
 * @property {string} testCaseId
 * @property {string} testRunId
 * @property {string} [title]              - Optional title override
 * @property {'Critical'|'High'|'Medium'|'Low'} [severity] - Optional severity override
 */

/**
 * @typedef {Object} AutoCreateBugResult
 * @property {string} bugId   - Human-readable ID e.g. "BUG-003"
 * @property {string} docId   - Firestore document ID
 */

/**
 * Hook for calling the `autoCreateBug` Cloud Function.
 *
 * Usage:
 * ```jsx
 * const { trigger, loading, error, result } = useAutoCreateBug()
 *
 * await trigger({
 *   projectId: 'proj-abc',
 *   testCaseId: 'tc-doc-id',
 *   testRunId:  'run-doc-id',
 *   severity:   'High',       // optional
 *   title:      'Login fails' // optional
 * })
 * ```
 *
 * @returns {{
 *   trigger: (options: AutoCreateBugOptions) => Promise<AutoCreateBugResult|null>,
 *   loading: boolean,
 *   error: string|null,
 *   result: AutoCreateBugResult|null,
 *   reset: () => void,
 * }}
 */
export function useAutoCreateBug() {
  const [loading, setLoading] = useState(false)
  /** @type {[string|null, React.Dispatch<any>]} */
  const [error, setError] = useState(null)
  /** @type {[AutoCreateBugResult|null, React.Dispatch<any>]} */
  const [result, setResult] = useState(null)

  const trigger = useCallback(
    /**
     * @param {AutoCreateBugOptions} options
     * @returns {Promise<AutoCreateBugResult|null>}
     */
    async ({ projectId, testCaseId, testRunId, title, severity }) => {
      setLoading(true)
      setError(null)
      setResult(null)

      try {
        const fns = getFirebaseFunctions()
        if (!fns) throw new Error('Firebase Functions is not available.')

        const fn = httpsCallable(fns, 'autoCreateBug')

        /** @type {Record<string, unknown>} */
        const payload = {
          projectId,
          testCaseId,
          testRunId,
        }
        if (title) payload.title = title
        if (severity) payload.severity = severity

        const response = await fn(payload)
        const data = /** @type {AutoCreateBugResult} */ (response.data)

        setResult(data)
        return data
      } catch (err) {
        const message = extractErrorMessage(err)
        setError(message)
        return null
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  const reset = useCallback(() => {
    setLoading(false)
    setError(null)
    setResult(null)
  }, [])

  return { trigger, loading, error, result, reset }
}
