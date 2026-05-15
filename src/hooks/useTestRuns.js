/**
 * @fileoverview Hooks for Test Runs: list subscription and single-run execution state.
 */

import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { useProject } from '../contexts/ProjectContext'
import {
  subscribeToRunResults,
  subscribeToTestRun,
  subscribeToTestRuns,
} from '../firebase/firestore.js'

/**
 * useTestRuns — manages test run list state
 * Subscribes to Firestore `projects/{projectId}/testRuns`.
 */
export function useTestRuns() {
  const { user } = useAuth()
  const { projectId } = useProject()
  const [runs, setRuns] = useState(/** @type {Array<Record<string, unknown> & { id: string }>} */ ([]))
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(/** @type {string|null} */ (null))

  useEffect(() => {
    const uid = user?.uid
    if (!uid || !projectId) {
      setRuns([])
      setLoading(false)
      setError(null)
      return undefined
    }

    setLoading(true)
    const unsub = subscribeToTestRuns(
      projectId,
      uid,
      (data) => {
        setRuns(Array.isArray(data) ? data : [])
        setLoading(false)
        setError(null)
      },
      (msg) => {
        setError(msg || 'Failed to load test runs.')
        setLoading(false)
        setRuns([])
      },
    )
    return () => unsub()
  }, [user?.uid, projectId])

  return { runs, loading, error }
}

/**
 * useRunExecution — manages live execution state for one run
 * Subscribes to `projects/{projectId}/testRunResults` and the parent test run document.
 *
 * @param {string|null|undefined} projectId
 * @param {string|null} runId
 */
export function useRunExecution(projectId, runId) {
  const { user } = useAuth()
  const [results, setResults] = useState(
    /** @type {Array<Record<string, unknown> & { id: string }>} */ ([]),
  )
  const [run, setRun] = useState(/** @type {(Record<string, unknown> & { id: string })|null} */ (null))
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(/** @type {string|null} */ (null))

  useEffect(() => {
    const uid = user?.uid
    if (!runId || !uid || !projectId) {
      setResults([])
      setRun(null)
      setLoading(false)
      setError(null)
      return
    }

    setLoading(true)
    setError(null)

    let runDone = false
    let resultsDone = false

    const tryDone = () => {
      if (runDone && resultsDone) setLoading(false)
    }

    const unsubRun = subscribeToTestRun(
      projectId,
      uid,
      runId,
      (data) => {
        setRun(data)
        runDone = true
        tryDone()
      },
      (msg) => {
        setError(msg || 'Failed to load test run.')
        runDone = true
        tryDone()
      },
    )

    const unsubResults = subscribeToRunResults(
      projectId,
      uid,
      runId,
      (data) => {
        setResults(Array.isArray(data) ? data : [])
        resultsDone = true
        tryDone()
      },
      (msg) => {
        setError(msg || 'Failed to load run results.')
        resultsDone = true
        tryDone()
      },
    )

    return () => {
      unsubRun()
      unsubResults()
    }
  }, [runId, user?.uid, projectId])

  const computedStats = useMemo(() => {
    const total = results.length
    const passCount = results.filter((r) => r.result === 'Pass').length
    const failCount = results.filter((r) => r.result === 'Fail').length
    const blockedCount = results.filter((r) => r.result === 'Blocked').length
    const skippedCount = results.filter((r) => r.result === 'Skipped').length
    const notRunCount = results.filter((r) => r.result === 'Not Run').length
    const done = passCount + failCount + blockedCount + skippedCount
    const passRate = total === 0 ? 0 : Math.round((passCount / total) * 100)
    return {
      total,
      passCount,
      failCount,
      blockedCount,
      skippedCount,
      notRunCount,
      done,
      passRate,
    }
  }, [results])

  return { results, run, loading, error, computedStats }
}
