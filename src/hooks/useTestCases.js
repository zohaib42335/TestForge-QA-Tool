/**
 * @fileoverview Test case state hook (Step 3):
 * - Reads test cases from Firestore in real time via `onSnapshot`
 * - Writes new test cases to Firestore via `addTestCase()` helper
 *
 * Notes:
 * - Firestore is the source of truth; listeners automatically use cache when offline.
 */

import { useCallback, useEffect, useState } from 'react'
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore'
import { useAuth } from '../context/AuthContext.jsx'
import { DEFAULT_FORM_VALUES } from '../constants/testCaseFields.js'
import { exportToExcel } from '../utils/excelExport.js'
import { syncToGoogleSheets } from '../utils/googleSheets.js'
import { buildActivityActor } from '../utils/memberDisplay.js'
import { validateTestCase } from '../utils/validation.js'
import {
  addTestCase as addTestCaseFirestore,
  deleteAllTestCases as deleteAllTestCasesFirestore,
  deleteTestCase as deleteTestCaseFirestore,
  getDb,
  getTestCasesOnce,
  logActivity,
  updateTestCase as updateTestCaseFirestore,
} from '../firebase/firestore.js'
import { COL_TEST_CASES_ROOT } from '../firebase/schema.js'

/**
 * Computes the next `TC-###` id from existing test cases (3-digit zero padding).
 * @param {Array<{ testCaseId?: string }>} testCases
 * @returns {string}
 */
function generateNextTestCaseId(testCases) {
  let max = 0
  const list = Array.isArray(testCases) ? testCases : []
  for (const tc of list) {
    const raw = tc && tc.testCaseId != null ? String(tc.testCaseId).trim() : ''
    const m = /^TC-(\d+)$/i.exec(raw)
    if (m) {
      const n = parseInt(m[1], 10)
      if (!Number.isNaN(n)) max = Math.max(max, n)
    }
  }
  const next = max + 1
  return `TC-${String(next).padStart(3, '0')}`
}

/**
 * Shallow clone of defaults merged with partial data for a new test case.
 * @param {object} formData
 * @param {string} testCaseId
 * @returns {object}
 */
function buildNewTestCase(formData, testCaseId) {
  return {
    ...DEFAULT_FORM_VALUES,
    ...formData,
    testCaseId,
  }
}

/**
 * useTestCases — manages test case state for Step 3.
 *
 * Firestore read:
 * - Subscribes to workspace `testCases` (top-level) ordered by `updatedAt desc`.
 * - Emits `loading=true` until first snapshot arrives.
 *
 * Firestore write:
 * - `addTestCase(formData)` validates, generates next `TC-###`, and calls Firestore.
 *
 * @returns {{
 *   testCases: Array<object>,
 *   loading: boolean,
 *   error: string,
 *   isSubmitting: boolean,
 *   addTestCase: (formData: Record<string, string>) => Promise<{ success: boolean, errors?: Record<string, string>, error?: string }>,
 *   updateTestCase: (id: string, updatedData: Record<string, string>) => { success: boolean, errors: Record<string, string> },
 *   deleteTestCase: (id: string) => void,
 *   syncStatus: { loading: boolean, success: boolean, error: boolean, message: string },
 *   resetSyncStatus: () => void,
 *   syncToSheets: (accessToken: string | null) => Promise<any>,
 *   exportExcel: () => void,
 *   clearAll: () => void,
 *   importValidatedTestCases: (validMergedRows: Array<Record<string, string>>) => { success: boolean, imported: number, message: string },
 * }}
 */
export function useTestCases() {
  const { user, userProfile } = useAuth()

  const [testCases, setTestCases] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [updatingDocId, setUpdatingDocId] = useState(/** @type {string|null} */ (null))
  const [deletingDocIds, setDeletingDocIds] = useState(() => new Set())

  const [syncStatus, setSyncStatus] = useState({
    loading: false,
    success: false,
    error: false,
    message: '',
  })

  useEffect(() => {
    const uid = user?.uid
    if (!uid) {
      setTestCases([])
      setLoading(false)
      setError('')
      return
    }

    const db = getDb()
    if (!db) {
      setTestCases([])
      setLoading(false)
      setError('Firebase is not configured or Firestore failed to initialize.')
      return
    }

    setLoading(true)
    setError('')

    const col = collection(db, COL_TEST_CASES_ROOT)
    const q = query(col, orderBy('updatedAt', 'desc'))

    const unsub = onSnapshot(
      q,
      (snap) => {
        const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
        setTestCases(items)
        setLoading(false)
        setError('')
      },
      (err) => {
        console.error('[firestore] onSnapshot(testCases):', err)
        setLoading(false)
        const code = err && typeof err === 'object' && 'code' in err ? String(err.code) : ''
        const msg = err && typeof err === 'object' && 'message' in err ? String(err.message) : ''
        const offline =
          code === 'unavailable' || /client is offline/i.test(msg)
        setError(
          offline
            ? 'You are offline. Cached test cases appear when available and will refresh when you reconnect.'
            : 'Failed to load test cases from Firestore.',
        )
      },
    )

    return () => unsub()
  }, [user?.uid])

  const buildActor = useCallback(
    () => buildActivityActor(userProfile, user),
    [user, userProfile],
  )

  const addTestCase = useCallback(async (formData) => {
    const { isValid, errors } = validateTestCase(formData)
    if (!isValid) {
      return { success: false, errors }
    }

    const uid = user?.uid
    if (!uid) {
      return { success: false, error: 'You must be signed in to save test cases.' }
    }

    const testCaseId = generateNextTestCaseId(testCases)
    const row = buildNewTestCase(formData, testCaseId)

    setIsSubmitting(true)
    try {
      const result = await addTestCaseFirestore(uid, row)
      if (!result || result.success !== true) {
        return {
          success: false,
          error:
            result && typeof result.error === 'string'
              ? result.error
              : 'Failed to save test case to Firestore.',
        }
      }
      const newDocId = typeof result.id === 'string' ? result.id : ''
      const actor = buildActor()
      if (actor && newDocId) {
        const title =
          row.title != null && String(row.title).trim() !== ''
            ? String(row.title)
            : row.testTitle != null && String(row.testTitle).trim() !== ''
              ? String(row.testTitle)
              : ''
        void logActivity({
          action: 'testcase.created',
          entityType: 'testCase',
          entityId: newDocId,
          entityRef: testCaseId,
          actor,
          metadata: { title },
        })
      }
      return { success: true, errors: {}, id: newDocId, testCaseId }
    } finally {
      setIsSubmitting(false)
    }
  }, [user?.uid, testCases, buildActor])

  /**
   * Updates an existing test case in Firestore.
   * Accepts either Firestore `docId` or (fallback) a `testCaseId` string.
   *
   * @param {string} docIdOrTestCaseId
   * @param {Record<string, string>} updatedData
   * @returns {Promise<{ success: boolean, errors?: Record<string, string>, error?: string }>}
   */
  const updateTestCase = useCallback(async (docIdOrTestCaseId, updatedData) => {
    const uid = user?.uid
    if (!uid) {
      return { success: false, error: 'You must be signed in to update test cases.' }
    }

    const list = Array.isArray(testCases) ? testCases : []
    const docId =
      list.find((tc) => tc && String(tc.id) === String(docIdOrTestCaseId))?.id ??
      list.find((tc) => tc && String(tc.testCaseId) === String(docIdOrTestCaseId))
        ?.id ??
      null

    if (!docId) {
      return {
        success: false,
        errors: { testCaseId: 'Test case not found (missing Firestore document id).' },
      }
    }

    const current = list.find((tc) => tc && String(tc.id) === String(docId)) ?? null
    const merged = { ...(current || {}), ...(updatedData || {}) }
    const v = validateTestCase(merged)
    if (!v.isValid) {
      return { success: false, errors: v.errors }
    }

    setIsUpdating(true)
    setUpdatingDocId(String(docId))
    try {
      const result = await updateTestCaseFirestore(uid, String(docId), updatedData)
      if (!result || result.success !== true) {
        return {
          success: false,
          error:
            result && typeof result.error === 'string'
              ? result.error
              : 'Failed to update test case in Firestore.',
        }
      }

      const partial = updatedData && typeof updatedData === 'object' ? updatedData : {}
      const keys = Object.keys(partial)
      const differingKeys = keys.filter((k) => {
        const ov = current && current[k] != null ? String(current[k]) : ''
        const nv = partial[k] != null ? String(partial[k]) : ''
        return ov !== nv
      })

      const actor = buildActor()
      const humanRef =
        current && current.testCaseId != null && String(current.testCaseId).trim() !== ''
          ? String(current.testCaseId).trim()
          : String(docId)

      if (actor && differingKeys.length > 0) {
        const onlyStatus =
          differingKeys.length === 1 && differingKeys[0] === 'status'
        const k = differingKeys[0]
        const ov = current && current[k] != null ? String(current[k]) : ''
        const nv = partial[k] != null ? String(partial[k]) : ''

        if (onlyStatus) {
          void logActivity({
            action: 'testcase.status_changed',
            entityType: 'testCase',
            entityId: String(docId),
            entityRef: humanRef,
            actor,
            changes: { field: 'status', from: ov, to: nv },
          })
        } else {
          void logActivity({
            action: 'testcase.updated',
            entityType: 'testCase',
            entityId: String(docId),
            entityRef: humanRef,
            actor,
            changes: { field: k, from: ov, to: nv },
          })
        }
      }

      return { success: true, errors: {} }
    } finally {
      setIsUpdating(false)
      setUpdatingDocId(null)
    }
  }, [user?.uid, testCases, buildActor])

  /**
   * Deletes a test case from Firestore.
   * Accepts either Firestore `docId` or (fallback) a `testCaseId` string.
   *
   * @param {string} docIdOrTestCaseId
   * @returns {Promise<{ success: boolean, error?: string }>}
   */
  const deleteTestCase = useCallback(async (docIdOrTestCaseId) => {
    const uid = user?.uid
    if (!uid) {
      return { success: false, error: 'You must be signed in to delete test cases.' }
    }

    const list = Array.isArray(testCases) ? testCases : []
    const docId =
      list.find((tc) => tc && String(tc.id) === String(docIdOrTestCaseId))?.id ??
      list.find((tc) => tc && String(tc.testCaseId) === String(docIdOrTestCaseId))
        ?.id ??
      null

    if (!docId) {
      return { success: false, error: 'Test case not found (missing Firestore document id).' }
    }

    setIsDeleting(true)
    setDeletingDocIds((prev) => {
      const next = new Set(prev)
      next.add(String(docId))
      return next
    })

    try {
      const victim =
        list.find((tc) => tc && String(tc.id) === String(docId)) ?? null
      const result = await deleteTestCaseFirestore(uid, String(docId))
      if (!result || result.success !== true) {
        return {
          success: false,
          error:
            result && typeof result.error === 'string'
              ? result.error
              : 'Failed to delete test case from Firestore.',
        }
      }

      const actor = buildActor()
      if (actor) {
        const humanRef =
          victim && victim.testCaseId != null && String(victim.testCaseId).trim() !== ''
            ? String(victim.testCaseId).trim()
            : String(docId)
        const title =
          victim && victim.title != null && String(victim.title).trim() !== ''
            ? String(victim.title)
            : victim && victim.testTitle != null && String(victim.testTitle).trim() !== ''
              ? String(victim.testTitle)
              : ''
        void logActivity({
          action: 'testcase.deleted',
          entityType: 'testCase',
          entityId: String(docId),
          entityRef: humanRef,
          actor,
          metadata: { title },
        })
      }

      return { success: true }
    } finally {
      setDeletingDocIds((prev) => {
        const next = new Set(prev)
        next.delete(String(docId))
        return next
      })
      setIsDeleting(false)
    }
  }, [user?.uid, testCases, buildActor])

  const syncToSheets = useCallback(async (accessToken) => {
    const uid = user?.uid
    if (!uid) {
      const message = 'You must be signed in to sync with Google Sheets.'
      setSyncStatus({
        loading: false,
        success: false,
        error: true,
        message,
      })
      return { success: false, message }
    }

    setSyncStatus({
      loading: true,
      success: false,
      error: false,
      message: '',
    })

    const once = await getTestCasesOnce(uid)
    const rows = Array.isArray(once.data) ? once.data : []

    const result = await syncToGoogleSheets(rows, accessToken ?? null)

    const ok = result && result.success === true
    setSyncStatus({
      loading: false,
      success: ok,
      error: !ok,
      message:
        result && typeof result.message === 'string' ? result.message : '',
    })

    return result
  }, [user?.uid])

  const exportExcel = useCallback(async () => {
    const uid = user?.uid
    if (!uid) {
      alert('You must be signed in to export test cases.')
      return
    }
    const once = await getTestCasesOnce(uid)
    const rows = Array.isArray(once.data) ? once.data : []
    exportToExcel(rows)
  }, [user?.uid])

  const clearAll = useCallback(async () => {
    const uid = user?.uid
    if (!uid) return

    setSyncStatus({
      loading: true,
      success: false,
      error: false,
      message: 'Deleting all test cases…',
    })

    const result = await deleteAllTestCasesFirestore(uid)
    if (!result || result.success !== true) {
      setSyncStatus({
        loading: false,
        success: false,
        error: true,
        message:
          result && typeof result.error === 'string'
            ? result.error
            : 'Failed to delete all test cases.',
      })
      return
    }

    // Listener will refresh state; keep UI responsive immediately too.
    setTestCases([])
    setSyncStatus({
      loading: false,
      success: true,
      error: false,
      message: `Deleted ${typeof result.deleted === 'number' ? result.deleted : 0} test case(s).`,
    })
  }, [user?.uid])

  const resetSyncStatus = useCallback(() => {
    setSyncStatus({
      loading: false,
      success: false,
      error: false,
      message: '',
    })
  }, [])

  /**
   * Appends multiple validated test case payloads with fresh sequential TC-### IDs.
   * @param {Array<Record<string, string>>} validMergedRows - Full row objects that already pass validateTestCase
   * @returns {{ success: boolean, imported: number, message: string }}
   */
  const importValidatedTestCases = useCallback((validMergedRows) => {
    if (!Array.isArray(validMergedRows) || validMergedRows.length === 0) {
      return {
        success: false,
        imported: 0,
        message: 'No valid rows to import.',
      }
    }

    setTestCases((prev) => {
      const list = Array.isArray(prev) ? [...prev] : []
      let max = 0
      for (const tc of list) {
        const raw = tc && tc.testCaseId != null ? String(tc.testCaseId).trim() : ''
        const m = /^TC-(\d+)$/i.exec(raw)
        if (m) {
          const n = parseInt(m[1], 10)
          if (!Number.isNaN(n)) max = Math.max(max, n)
        }
      }
      for (const data of validMergedRows) {
        max += 1
        const id = `TC-${String(max).padStart(3, '0')}`
        list.push(buildNewTestCase(data, id))
      }
      return list
    })

    return {
      success: true,
      imported: validMergedRows.length,
      message: `${validMergedRows.length} test case(s) imported.`,
    }
  }, [])

  return {
    testCases,
    loading,
    error,
    addTestCase,
    updateTestCase,
    deleteTestCase,
    isSubmitting,
    isUpdating,
    isDeleting,
    updatingDocId,
    deletingDocIds,
    syncStatus,
    resetSyncStatus,
    syncToSheets,
    exportExcel,
    clearAll,
    importValidatedTestCases,
  }
}
