/**
 * @fileoverview Template state hook:
 * - Reads templates from Firestore via `getTemplates()`
 * - Writes templates via `addTemplate()`
 * - Deletes templates via `deleteTemplate()`
 */

import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import {
  addTemplate as addTemplateFirestore,
  deleteTemplate as deleteTemplateFirestore,
  getTemplates as getTemplatesFirestore,
} from '../firebase/firestore.js'

/**
 * useTemplates manages custom template CRUD for the authenticated user.
 * Templates are user-scoped (`users/{uid}/templates`) to match existing data ownership.
 *
 * @returns {{
 *   templates: Array<object>,
 *   loading: boolean,
 *   error: string,
 *   isSavingTemplate: boolean,
 *   deletingTemplateIds: Set<string>,
 *   addTemplate: (payload: { name: string, description?: string, defaults?: Record<string, string> }) => Promise<{ success: boolean, id?: string, error?: string }>,
 *   deleteTemplate: (docId: string) => Promise<{ success: boolean, error?: string }>,
 *   reloadTemplates: () => Promise<void>,
 * }}
 */
export function useTemplates() {
  const { user } = useAuth()
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [isSavingTemplate, setIsSavingTemplate] = useState(false)
  const [deletingTemplateIds, setDeletingTemplateIds] = useState(() => new Set())

  const loadTemplates = useCallback(async () => {
    const uid = user?.uid
    if (!uid) {
      setTemplates([])
      setLoading(false)
      setError('')
      return
    }

    setLoading(true)
    setError('')
    const result = await getTemplatesFirestore(uid)
    if (!result || result.success !== true) {
      setTemplates([])
      setLoading(false)
      setError(
        result && typeof result.error === 'string'
          ? result.error
          : 'Failed to load templates from Firestore.',
      )
      return
    }

    setTemplates(Array.isArray(result.data) ? result.data : [])
    setLoading(false)
    setError('')
  }, [user?.uid])

  useEffect(() => {
    loadTemplates()
  }, [loadTemplates])

  const addTemplate = useCallback(async (payload) => {
    const uid = user?.uid
    if (!uid) {
      return { success: false, error: 'You must be signed in to save templates.' }
    }

    setIsSavingTemplate(true)
    try {
      const result = await addTemplateFirestore(uid, payload)
      if (!result || result.success !== true) {
        return {
          success: false,
          error:
            result && typeof result.error === 'string'
              ? result.error
              : 'Failed to save template to Firestore.',
        }
      }
      await loadTemplates()
      return { success: true, id: result.id }
    } finally {
      setIsSavingTemplate(false)
    }
  }, [user?.uid, loadTemplates])

  const deleteTemplate = useCallback(async (docId) => {
    const uid = user?.uid
    if (!uid) {
      return { success: false, error: 'You must be signed in to delete templates.' }
    }
    if (typeof docId !== 'string' || docId.trim() === '') {
      return { success: false, error: 'Template document id is required.' }
    }

    const id = String(docId)
    setDeletingTemplateIds((prev) => {
      const next = new Set(prev)
      next.add(id)
      return next
    })

    try {
      const result = await deleteTemplateFirestore(uid, id)
      if (!result || result.success !== true) {
        return {
          success: false,
          error:
            result && typeof result.error === 'string'
              ? result.error
              : 'Failed to delete template from Firestore.',
        }
      }
      await loadTemplates()
      return { success: true }
    } finally {
      setDeletingTemplateIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }, [user?.uid, loadTemplates])

  return {
    templates,
    loading,
    error,
    isSavingTemplate,
    deletingTemplateIds,
    addTemplate,
    deleteTemplate,
    reloadTemplates: loadTemplates,
  }
}
