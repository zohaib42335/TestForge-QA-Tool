/**
 * @fileoverview CRUD hook for bugs stored in Firestore.
 * Collection: projects/{projectId}/bugs
 * Subcollection: projects/{projectId}/bugs/{bugId}/comments
 */

import { useCallback, useState } from 'react'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore'
import { useAuth } from '../context/AuthContext.jsx'
import { getDb } from '../firebase/firestore.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extracts a user-facing error message.
 * @param {unknown} err
 * @returns {string}
 */
function extractError(err) {
  if (err instanceof Error) return err.message
  return 'An unexpected error occurred.'
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Provides CRUD operations for the Bug Tracker Firestore collection.
 *
 * @returns {{
 *   bugs: import('../types/bug.types.js').Bug[],
 *   loading: boolean,
 *   error: string|null,
 *   fetchBugs: (projectId: string) => Promise<void>,
 *   fetchBugById: (projectId: string, bugId: string) => Promise<import('../types/bug.types.js').Bug|null>,
 *   createBug: (projectId: string, bugData: Record<string, unknown>) => Promise<string>,
 *   updateBug: (projectId: string, bugId: string, changes: Record<string, unknown>) => Promise<void>,
 *   deleteBug: (projectId: string, bugId: string) => Promise<void>,
 *   addComment: (projectId: string, bugId: string, text: string, uid: string) => Promise<string>,
 *   fetchComments: (projectId: string, bugId: string) => Promise<import('../types/bug.types.js').BugComment[]>,
 * }}
 */
export function useBugs() {
  const { user } = useAuth()

  /** @type {[import('../types/bug.types.js').Bug[], React.Dispatch<any>]} */
  const [bugs, setBugs] = useState([])
  const [loading, setLoading] = useState(false)
  /** @type {[string|null, React.Dispatch<any>]} */
  const [error, setError] = useState(null)

  // -------------------------------------------------------------------------
  // fetchBugs
  // -------------------------------------------------------------------------

  const fetchBugs = useCallback(
    async (/** @type {string} */ projectId) => {
      if (!user?.uid || !projectId) return
      setLoading(true)
      setError(null)
      try {
        const db = getDb()
        if (!db) throw new Error('Firestore is not available.')
        const col = collection(db, `projects/${projectId}/bugs`)
        const q = query(col, orderBy('createdAt', 'desc'))
        const snap = await getDocs(q)
        setBugs(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      } catch (err) {
        setError(extractError(err))
      } finally {
        setLoading(false)
      }
    },
    [user?.uid],
  )

  // -------------------------------------------------------------------------
  // fetchBugById
  // -------------------------------------------------------------------------

  const fetchBugById = useCallback(
    /**
     * @param {string} projectId
     * @param {string} bugDocId - Firestore document ID
     * @returns {Promise<import('../types/bug.types.js').Bug|null>}
     */
    async (projectId, bugDocId) => {
      const db = getDb()
      if (!db) throw new Error('Firestore is not available.')
      const ref = doc(db, `projects/${projectId}/bugs`, bugDocId)
      const snap = await getDoc(ref)
      if (!snap.exists()) return null
      return /** @type {any} */ ({ id: snap.id, ...snap.data() })
    },
    [],
  )

  // -------------------------------------------------------------------------
  // createBug
  // -------------------------------------------------------------------------

  const createBug = useCallback(
    /**
     * Creates a bug with an auto-generated BUG-XXX id via a Firestore transaction.
     * @param {string} projectId
     * @param {Record<string, unknown>} bugData
     * @returns {Promise<{docId: string, bugId: string}>}
     */
    async (projectId, bugData) => {
      const uid = user?.uid
      if (!uid) throw new Error('Not signed in.')
      const db = getDb()
      if (!db) throw new Error('Firestore is not available.')

      const counterRef = doc(db, `projects/${projectId}/meta/bugCounter`)
      const bugsCol    = collection(db, `projects/${projectId}/bugs`)
      const bugDocRef  = doc(bugsCol)
      let assignedBugId = ''

      await runTransaction(db, async (tx) => {
        const counterSnap = await tx.get(counterRef)
        const next = (counterSnap.exists() ? (Number(counterSnap.data().count) || 0) : 0) + 1
        assignedBugId = `BUG-${String(next).padStart(3, '0')}`
        tx.set(counterRef, { count: next })
        tx.set(bugDocRef, {
          ...bugData,
          bugId: assignedBugId,
          reportedBy: uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          resolvedAt: null,
        })
      })

      return { docId: bugDocRef.id, bugId: assignedBugId }
    },
    [user?.uid],
  )

  // -------------------------------------------------------------------------
  // updateBug
  // -------------------------------------------------------------------------

  const updateBug = useCallback(
    /**
     * @param {string} projectId
     * @param {string} bugDocId - Firestore document ID
     * @param {Record<string, unknown>} changes
     */
    async (projectId, bugDocId, changes) => {
      const db = getDb()
      if (!db) throw new Error('Firestore is not available.')
      const ref = doc(db, `projects/${projectId}/bugs`, bugDocId)
      await updateDoc(ref, {
        ...changes,
        updatedAt: serverTimestamp(),
      })
    },
    [],
  )

  // -------------------------------------------------------------------------
  // deleteBug
  // -------------------------------------------------------------------------

  const deleteBug = useCallback(
    /**
     * @param {string} projectId
     * @param {string} bugDocId - Firestore document ID
     */
    async (projectId, bugDocId) => {
      const db = getDb()
      if (!db) throw new Error('Firestore is not available.')
      await deleteDoc(doc(db, `projects/${projectId}/bugs`, bugDocId))
    },
    [],
  )

  // -------------------------------------------------------------------------
  // addComment
  // -------------------------------------------------------------------------

  const addComment = useCallback(
    /**
     * @param {string} projectId
     * @param {string} bugDocId - Firestore document ID of the bug
     * @param {string} text
     * @param {string} uid - Firebase Auth UID of commenter
     * @returns {Promise<string>} Firestore document ID of the new comment
     */
    async (projectId, bugDocId, text, uid) => {
      const db = getDb()
      if (!db) throw new Error('Firestore is not available.')
      if (!text.trim()) throw new Error('Comment text cannot be empty.')
      const col = collection(db, `projects/${projectId}/bugs/${bugDocId}/comments`)
      const ref = await addDoc(col, {
        text: text.trim(),
        createdBy: uid,
        createdAt: serverTimestamp(),
      })
      return ref.id
    },
    [],
  )

  // -------------------------------------------------------------------------
  // fetchComments
  // -------------------------------------------------------------------------

  const fetchComments = useCallback(
    /**
     * @param {string} projectId
     * @param {string} bugDocId - Firestore document ID of the bug
     * @returns {Promise<import('../types/bug.types.js').BugComment[]>}
     */
    async (projectId, bugDocId) => {
      const db = getDb()
      if (!db) throw new Error('Firestore is not available.')
      const col = collection(db, `projects/${projectId}/bugs/${bugDocId}/comments`)
      const q = query(col, orderBy('createdAt', 'asc'))
      const snap = await getDocs(q)
      return snap.docs.map((d) => /** @type {any} */ ({ id: d.id, ...d.data() }))
    },
    [],
  )

  // -------------------------------------------------------------------------
  // Return
  // -------------------------------------------------------------------------

  return {
    bugs,
    loading,
    error,
    fetchBugs,
    fetchBugById,
    createBug,
    updateBug,
    deleteBug,
    addComment,
    fetchComments,
  }
}
