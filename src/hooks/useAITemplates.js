/**
 * @fileoverview CRUD hook for AI prompt templates stored in Firestore.
 * Collection: projects/{projectId}/aiPromptTemplates
 */

import { useCallback, useState } from 'react'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  where,
} from 'firebase/firestore'
import { useAuth } from '../context/AuthContext.jsx'
import { getDb } from '../firebase/firestore.js'

/**
 * @typedef {Object} AIPromptTemplate
 * @property {string} id
 * @property {string} name
 * @property {string} featureDescription
 * @property {string} moduleName
 * @property {string} extraContext
 * @property {number} count
 * @property {string} createdBy
 */

export function useAITemplates() {
  const { user } = useAuth()
  const [templates, setTemplates] = useState(/** @type {AIPromptTemplate[]} */ ([]))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(/** @type {string|null} */ (null))

  const fetchTemplates = useCallback(
    async (/** @type {string} */ projectId) => {
      const uid = user?.uid
      if (!uid || !projectId) return
      setLoading(true)
      setError(null)
      try {
        const db = getDb()
        if (!db) throw new Error('Firestore is not available.')
        const col = collection(db, `projects/${projectId}/aiPromptTemplates`)
        const q = query(col, where('createdBy', '==', uid), orderBy('createdAt', 'desc'))
        const snap = await getDocs(q)
        setTemplates(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load templates.')
      } finally {
        setLoading(false)
      }
    },
    [user?.uid],
  )

  /**
   * @param {string} projectId
   * @param {string} name
   * @param {{ featureDescription: string, moduleName: string, extraContext: string, count: number }} formValues
   */
  const saveTemplate = useCallback(
    async (projectId, name, formValues) => {
      const uid = user?.uid
      if (!uid) throw new Error('Not signed in.')
      const db = getDb()
      if (!db) throw new Error('Firestore is not available.')
      const col = collection(db, `projects/${projectId}/aiPromptTemplates`)
      const ref = await addDoc(col, {
        name: name.trim(),
        featureDescription: formValues.featureDescription ?? '',
        moduleName: formValues.moduleName ?? '',
        extraContext: formValues.extraContext ?? '',
        count: typeof formValues.count === 'number' ? formValues.count : 5,
        createdBy: uid,
        createdAt: serverTimestamp(),
      })
      return ref.id
    },
    [user?.uid],
  )

  const deleteTemplate = useCallback(
    async (/** @type {string} */ projectId, /** @type {string} */ templateId) => {
      const db = getDb()
      if (!db) throw new Error('Firestore is not available.')
      await deleteDoc(doc(db, `projects/${projectId}/aiPromptTemplates`, templateId))
    },
    [],
  )

  return { templates, setTemplates, fetchTemplates, saveTemplate, deleteTemplate, loading, error }
}
