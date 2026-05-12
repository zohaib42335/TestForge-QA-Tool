/**
 * @fileoverview Read-only hook for AI generation history.
 * Collection: projects/{projectId}/aiGenerationLogs (written by Cloud Function)
 */

import { useCallback, useState } from 'react'
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore'
import { getDb } from '../firebase/firestore.js'

/**
 * @typedef {Object} AIHistoryItem
 * @property {string}  id
 * @property {string}  featureDescription      - truncated to 80 chars with ellipsis
 * @property {string}  featureDescriptionFull  - original, used to re-fill the form
 * @property {string}  moduleName
 * @property {string}  extraContext
 * @property {number}  count
 * @property {number}  generatedCount
 * @property {number}  savedCount
 * @property {string}  createdBy               - uid
 * @property {import('firebase/firestore').Timestamp|null} createdAt
 */

/** @param {string} s @returns {string} */
function truncate80(s) {
  return s.length > 80 ? s.slice(0, 80) + '…' : s
}

export function useAIHistory() {
  const [history, setHistory] = useState(/** @type {AIHistoryItem[]} */ ([]))
  const [loading, setLoading] = useState(false)

  const fetchHistory = useCallback(async (/** @type {string} */ projectId) => {
    if (!projectId) return
    setLoading(true)
    try {
      const db = getDb()
      if (!db) return
      const col = collection(db, `projects/${projectId}/aiGenerationLogs`)
      const q = query(col, orderBy('createdAt', 'desc'), limit(10))
      const snap = await getDocs(q)
      setHistory(
        snap.docs.map((d) => {
          const data = d.data()
          const full = String(data.featureDescription ?? '')
          return {
            id: d.id,
            featureDescription: truncate80(full),
            featureDescriptionFull: full,
            moduleName: data.moduleName ?? '',
            extraContext: data.extraContext ?? '',
            count: data.count ?? data.generatedCount ?? 5,
            generatedCount: data.generatedCount ?? 0,
            savedCount: data.savedCount ?? 0,
            createdBy: data.createdBy ?? '',
            createdAt: data.createdAt ?? null,
          }
        }),
      )
    } catch (err) {
      console.error('[useAIHistory]', err)
    } finally {
      setLoading(false)
    }
  }, [])

  return { history, fetchHistory, loading }
}
