/**
 * @fileoverview Hook for the AI Test Case Generator feature.
 * Manages two-phase flow: generate via Cloud Function → preview & select → save via Cloud Function.
 */

import { useState, useCallback } from 'react'
import { httpsCallable } from 'firebase/functions'
import { getFirebaseFunctions } from '../firebase/config.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generates a stable local id for selection tracking before Firestore save. */
function genLocalId() {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

/**
 * Extracts a user-facing error message from a Firebase HttpsError or generic Error.
 * @param {unknown} err
 * @returns {string}
 */
function extractErrorMessage(err) {
  if (!err || typeof err !== 'object') return 'An unexpected error occurred.'
  // Firebase HttpsError surfaces the message via .message
  const msg = /** @type {any} */ (err).message
  if (typeof msg === 'string' && msg.trim()) return msg.trim()
  return 'An unexpected error occurred. Please try again.'
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} GeneratedCase
 * @property {string} _localId     - Temporary client-side id for selection tracking
 * @property {string} title
 * @property {string} description
 * @property {string} preconditions
 * @property {string[]} steps
 * @property {string} expectedResult
 * @property {'Critical'|'High'|'Medium'|'Low'} priority
 * @property {'Functional'|'UI'|'API'|'Performance'|'Security'|'Regression'} type
 * @property {string[]} tags
 */

/**
 * @param {string} projectId - Firestore project id to save cases into
 * @param {{ onSuccess?: (count: number) => void, suiteId?: string }} [options]
 */
export function useAIGenerator(projectId, options = {}) {
  const { onSuccess, suiteId } = options

  // Form state
  const [featureDescription, setFeatureDescription] = useState('')
  const [moduleName, setModuleName] = useState('')
  const [extraContext, setExtraContext] = useState('')
  const [count, setCount] = useState(5)

  // Result state
  /** @type {[GeneratedCase[], React.Dispatch<React.SetStateAction<GeneratedCase[]>>]} */
  const [generatedCases, setGeneratedCases] = useState([])
  /** @type {[Set<string>, React.Dispatch<React.SetStateAction<Set<string>>>]} */
  const [selectedIds, setSelectedIds] = useState(new Set())

  // UI state
  /** @type {['input'|'preview', React.Dispatch<React.SetStateAction<'input'|'preview'>>]} */
  const [view, setView] = useState(/** @type {'input'|'preview'} */ ('input'))
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  /** @type {[string|null, React.Dispatch<React.SetStateAction<string|null>>]} */
  const [error, setError] = useState(null)

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  const generate = useCallback(async () => {
    if (!featureDescription.trim()) {
      setError('Feature description is required.')
      return
    }
    setError(null)
    setLoading(true)
    try {
      const fns = getFirebaseFunctions()
      if (!fns) throw new Error('Firebase Functions is not available.')

      const fn = httpsCallable(fns, 'generateTestCases')
      /** @type {Record<string, unknown>} */
      const payload = {
        featureDescription: featureDescription.trim(),
        count: Number(count),
      }
      if (moduleName.trim()) payload.moduleName = moduleName.trim()
      if (extraContext.trim()) payload.extraContext = extraContext.trim()

      const result = await fn(payload)
      const raw = /** @type {any[]} */ (result.data) || []
      const cases = raw.map((tc) => ({ ...tc, _localId: genLocalId() }))

      setGeneratedCases(cases)
      setSelectedIds(new Set(cases.map((c) => c._localId)))
      setView('preview')
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [featureDescription, moduleName, extraContext, count])

  const toggleSelect = useCallback((/** @type {string} */ id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(generatedCases.map((c) => c._localId)))
  }, [generatedCases])

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set())
  }, [])

  const saveSelected = useCallback(async () => {
    const toSave = generatedCases
      .filter((c) => selectedIds.has(c._localId))
      .map(({ _localId, ...rest }) => rest) // strip local tracking id before sending

    if (toSave.length === 0) return
    setError(null)
    setSaving(true)
    try {
      const fns = getFirebaseFunctions()
      if (!fns) throw new Error('Firebase Functions is not available.')

      const fn = httpsCallable(fns, 'saveGeneratedCases')
      await fn({
        projectId,
        cases: toSave,
        featureDescription: featureDescription.trim().slice(0, 200),
        ...(suiteId ? { suiteId } : {}),
      })
      onSuccess?.(toSave.length)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }, [generatedCases, selectedIds, projectId, featureDescription, suiteId, onSuccess])

  const goBack = useCallback(() => {
    setView('input')
    setError(null)
  }, [])

  const reset = useCallback(() => {
    setFeatureDescription('')
    setModuleName('')
    setExtraContext('')
    setCount(5)
    setGeneratedCases([])
    setSelectedIds(new Set())
    setView('input')
    setLoading(false)
    setSaving(false)
    setError(null)
  }, [])

  return {
    // Form state
    featureDescription,
    setFeatureDescription,
    moduleName,
    setModuleName,
    extraContext,
    setExtraContext,
    count,
    setCount,
    // Result state
    generatedCases,
    selectedIds,
    view,
    loading,
    saving,
    error,
    // Actions
    generate,
    toggleSelect,
    selectAll,
    deselectAll,
    saveSelected,
    goBack,
    reset,
  }
}
