/**
 * @fileoverview ExecutionMode — full-screen execution view for a single test run.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { collection, getDocs, limit, query, where } from 'firebase/firestore'
import { useAuth } from '../../context/AuthContext.jsx'
import { useProject } from '../../contexts/ProjectContext'
import { useRole } from '../../hooks/useRole'
import { buildActivityActor, getActorDisplayLabel } from '../../utils/memberDisplay.js'
import { getDb, logActivity, updateRunStats, updateTestResult } from '../../firebase/firestore.js'
import { COL_PROJECTS } from '../../firebase/schema.js'
import { useRunExecution } from '../../hooks/useTestRuns.js'
import { useAutoCreateBug } from '../../hooks/useAutoCreateBug.js'
import ReportBugModal from '../modals/ReportBugModal.jsx'
import { PRIORITY_MAP } from '../../constants/bugConstants.js'
import { getRelativeTime } from '../../utils/relativeTime.js'
import { useToast } from '../Toast.jsx'

/**
 * @param {Array<Record<string, unknown> & { id: string }>} results
 */
function orderResults(results) {
  const notRun = results.filter((r) => r.result === 'Not Run')
  const done = results.filter((r) => r.result !== 'Not Run')
  const bySort = (a, b) => {
    const ai = typeof a.sortIndex === 'number' ? a.sortIndex : 0
    const bi = typeof b.sortIndex === 'number' ? b.sortIndex : 0
    return ai - bi
  }
  notRun.sort(bySort)
  done.sort(bySort)
  return [...notRun, ...done]
}

/**
 * @param {Object} props
 * @param {string|null|undefined} props.projectId
 * @param {string} props.runId
 * @param {() => void} props.onExit
 * @param {(bugDocId: string) => void} [props.onOpenBug]
 */
export default function ExecutionMode({ projectId: projectIdProp, runId, onExit, onOpenBug }) {
  const { projectId: ctxProjectId } = useProject()
  const workspaceProjectId =
    projectIdProp != null && String(projectIdProp).trim() !== ''
      ? String(projectIdProp).trim()
      : ctxProjectId != null && String(ctxProjectId).trim() !== ''
        ? String(ctxProjectId).trim()
        : ''
  const { user, userProfile } = useAuth()
  const { hasPermission, isViewer } = useRole()
  const canExecuteRun = hasPermission('run_execute')
  const canApproveRun = hasPermission('run_approve')
  const canCreateBug = hasPermission('bug_create')
  const showToast = useToast()
  const { results, run, loading, error, computedStats } = useRunExecution(workspaceProjectId, runId)

  const [cardFlash, setCardFlash] = useState(
    /** @type {{ id: string, kind: 'pass' | 'fail' } | null} */ (null),
  )
  const prevNotRunRef = useRef(/** @type {number|null} */ (null))

  // Bug reporting state
  const [autoReportBugs, setAutoReportBugs] = useState(false)
  /** @type {[Record<string, string[]>, React.Dispatch<any>]} Keyed by result row id */
  const [rowBugIds, setRowBugIds] = useState({})
  /**
   * @type {[{testCaseId:string,title:string,steps:string[],priority:string}|null, React.Dispatch<any>]}
   */
  const [reportBugPrefill, setReportBugPrefill] = useState(null)
  const [fetchingPrefill, setFetchingPrefill] = useState(false)
  const { trigger: autoCreateBug } = useAutoCreateBug()

  /** Open the Report Bug modal, fetching full test case steps from Firestore. */
  const openReportBug = async (row) => {
    const tcId     = String(row?.testCaseId ?? '')
    const title    = String(row?.testCaseTitle ?? row?.title ?? '')
    const priority = String(row?.priority ?? 'Medium')
    const resultRowId = String(row?.id ?? '')

    // Open modal immediately with whatever we have
    setReportBugPrefill({ testCaseId: tcId, title, steps: [], priority, _resultRowId: resultRowId })
    setFetchingPrefill(true)

    try {
      const db = getDb()
      if (db && tcId && workspaceProjectId) {
        const snap = await getDocs(
          query(
            collection(db, COL_PROJECTS, workspaceProjectId, 'testCases'),
            where('testCaseId', '==', tcId),
            limit(1),
          ),
        )
        if (!snap.empty) {
          const tcData = snap.docs[0].data()
          const rawSteps = String(tcData.testSteps ?? '')
          const stepsArr = rawSteps.split('\n').map((s) => s.trim()).filter(Boolean)
          setReportBugPrefill((prev) => ({
            ...prev,
            steps: stepsArr,
            priority: String(tcData.priority ?? priority),
          }))
        }
      }
    } catch { /* non-critical — modal already open with basic info */ }
    finally { setFetchingPrefill(false) }
  }

  const viewOnly = String(run?.status ?? '') === 'Completed'

  const uid = user?.uid ?? ''

  const executedByLabel = getActorDisplayLabel(userProfile, user)

  const orderedResults = useMemo(() => orderResults(results), [results])

  const totalCases =
    run && typeof run.totalCases === 'number'
      ? Math.max(0, Math.round(Number(run.totalCases)) || 0)
      : Math.max(0, computedStats.total)

  const passCount = Math.max(0, Math.round(computedStats.passCount) || 0)
  const failCount = Math.max(0, Math.round(computedStats.failCount) || 0)
  const blockedCount = Math.max(0, Math.round(computedStats.blockedCount) || 0)
  const skippedCount = Math.max(0, Math.round(computedStats.skippedCount) || 0)
  const notRunCount = Math.max(0, Math.round(computedStats.notRunCount) || 0)
  const done = Math.max(0, Math.round(computedStats.done) || 0)

  const donePct =
    totalCases > 0 ? Math.round((done / totalCases) * 100) : 0

  const passSeg =
    totalCases > 0 ? Math.round((passCount / totalCases) * 100) : 0
  const failSeg =
    totalCases > 0 ? Math.round((failCount / totalCases) * 100) : 0
  const blockedSeg =
    totalCases > 0 ? Math.round((blockedCount / totalCases) * 100) : 0

  useEffect(() => {
    const prev = prevNotRunRef.current
    if (
      prev !== null &&
      prev > 0 &&
      notRunCount === 0 &&
      totalCases > 0
    ) {
      showToast('Test run completed! 🎉', 'success')
    }
    prevNotRunRef.current = notRunCount
  }, [notRunCount, totalCases, showToast])

  useEffect(() => {
    if (!uid || !runId || !run || loading || viewOnly || !workspaceProjectId) return

    const tc =
      typeof run.totalCases === 'number'
        ? Math.max(0, Math.round(Number(run.totalCases)) || 0)
        : Math.max(0, computedStats.total)

    if (tc === 0 && computedStats.total === 0) return

    const next = {
      passCount: computedStats.passCount,
      failCount: computedStats.failCount,
      blockedCount: computedStats.blockedCount,
      skippedCount: computedStats.skippedCount,
      notRunCount: computedStats.notRunCount,
      totalCases: tc > 0 ? tc : computedStats.total,
    }

    const same =
      Math.round(Number(run.passCount)) === Math.round(next.passCount) &&
      Math.round(Number(run.failCount)) === Math.round(next.failCount) &&
      Math.round(Number(run.blockedCount)) === Math.round(next.blockedCount) &&
      Math.round(Number(run.skippedCount)) === Math.round(next.skippedCount) &&
      Math.round(Number(run.notRunCount)) === Math.round(next.notRunCount)

    if (same) return

    let cancelled = false
    updateRunStats(workspaceProjectId, uid, runId, next).catch(() => {
      if (!cancelled) showToast('Something went wrong. Try again.', 'error')
    })
    return () => {
      cancelled = true
    }
  }, [
    uid,
    workspaceProjectId,
    runId,
    run,
    loading,
    viewOnly,
    computedStats.passCount,
    computedStats.failCount,
    computedStats.blockedCount,
    computedStats.skippedCount,
    computedStats.notRunCount,
    computedStats.total,
    showToast,
  ])

  const handleResult = async (row, newResult) => {
    if (viewOnly || !uid || !canExecuteRun) return
    const id = row && row.id != null ? String(row.id) : ''
    if (!id) return
    const notes = row && row.notes != null ? String(row.notes) : ''
    const oldResult = String(row?.result ?? 'Not Run')
    if (oldResult === String(newResult)) return
    try {
      await updateTestResult(workspaceProjectId, uid, id, newResult, notes, executedByLabel)
      const actor = buildActivityActor(userProfile, user)
      const runName = run ? String(run.name ?? 'Test run') : 'Test run'
      const tcRef = row && row.testCaseId != null ? String(row.testCaseId) : ''
      if (actor) {
        void logActivity({
          action: 'testrun.result_updated',
          entityType: 'testRun',
          entityId: runId,
          entityRef: runName,
          actor,
          changes: {
            field: 'result',
            from: oldResult,
            to: String(newResult),
            testCaseRef: tcRef,
          },
        })
      }
      setCardFlash({
        id,
        kind: newResult === 'Fail' || newResult === 'Blocked' ? 'fail' : 'pass',
      })
      window.setTimeout(() => setCardFlash((f) => (f && f.id === id ? null : f)), 450)

      // Auto-report bug on Fail
      if (newResult === 'Fail' && autoReportBugs) {
        if (!workspaceProjectId) return
        const result = await autoCreateBug({
          projectId: workspaceProjectId,
          testCaseId: id,
          testRunId: runId,
          severity: PRIORITY_MAP[String(row?.priority ?? '')] ?? 'Medium',
        })
        if (result?.bugId) {
          setRowBugIds((prev) => ({
            ...prev,
            [id]: [...(prev[id] ?? []), result.bugId],
          }))
          showToast(`Bug ${result.bugId} auto-created`, 'success')
        }
      }
    } catch (e) {
      showToast('Something went wrong. Try again.', 'error')
    }
  }

  const saveNotes = async (row, notesText) => {
    if (viewOnly || !uid || !canExecuteRun) return
    const id = row && row.id != null ? String(row.id) : ''
    if (!id) return
    const res = String(row.result ?? 'Not Run')
    try {
      await updateTestResult(workspaceProjectId, uid, id, res, notesText, executedByLabel)
    } catch (e) {
      showToast('Something went wrong. Try again.', 'error')
    }
  }

  const handleFinish = async () => {
    if (!uid || notRunCount !== 0 || !canApproveRun) return
    try {
      await updateRunStats(workspaceProjectId, uid, runId, {
        passCount,
        failCount,
        blockedCount,
        skippedCount,
        notRunCount: 0,
        totalCases,
      })
      const actor = buildActivityActor(userProfile, user)
      const runName = run ? String(run.name ?? 'Test run') : 'Test run'
      const passRate = totalCases > 0 ? Math.round((passCount / totalCases) * 100) : 0
      if (actor) {
        void logActivity({
          action: 'testrun.completed',
          entityType: 'testRun',
          entityId: runId,
          entityRef: runName,
          actor,
          metadata: {
            passCount,
            failCount,
            blockedCount,
            passRate,
          },
        })
      }
      onExit()
    } catch (e) {
      showToast('Something went wrong. Try again.', 'error')
    }
  }

  const timeSource =
    run?.startedDate && typeof run.startedDate === 'string'
      ? run.startedDate
      : run?.createdDate && typeof run.createdDate === 'string'
        ? run.createdDate
        : ''
  const startedLabel = getRelativeTime(timeSource)
  const startedWord = run?.startedDate ? 'started' : 'created'

  const leftBorderClass = (result) => {
    const r = String(result ?? 'Not Run')
    if (r === 'Pass') return 'border-l-4 border-l-[#16A34A]'
    if (r === 'Fail') return 'border-l-4 border-l-[#DC2626]'
    if (r === 'Blocked') return 'border-l-4 border-l-[#D97706]'
    if (r === 'Skipped') return 'border-l-4 border-l-[#9CA3AF]'
    return ''
  }

  if (!loading && !run) {
    return (
      <div className="max-w-lg mx-auto py-16 text-center px-4">
        {error && (
          <p className="text-sm text-red-700 mb-2" role="alert">
            {error}
          </p>
        )}
        <p className="text-sm text-[#5A6E9A] mb-4">
          {error ? 'Unable to open this test run.' : 'This test run could not be found.'}
        </p>
        <button
          type="button"
          onClick={onExit}
          className="text-[12px] text-[#1A3263] font-medium hover:underline"
        >
          ← Back to Runs
        </button>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-[#EEF2FB] overflow-hidden">
      <div className="bg-white border-b-[0.5px] border-[#B0C0E0] px-4 py-3 shrink-0">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={onExit}
            className="inline-flex items-center gap-1 text-[12px] text-[#5A6E9A] hover:text-[#1A3263] cursor-pointer"
          >
            <span aria-hidden>←</span> Back to Runs
          </button>
          <div className="text-center flex-1 min-w-0">
            <p className="text-[14px] font-medium text-[#1A3263] truncate">
              {run ? String(run.name ?? 'Test run') : '…'}
            </p>
            <p className="text-[10px] text-[#5A6E9A]">
              {Math.round(totalCases)} cases · {startedWord} {startedLabel}
            </p>
          </div>
          {/* Auto-report toggle */}
          <label className="hidden sm:flex shrink-0 items-center gap-2 cursor-pointer select-none">
            <span className="text-[11px] text-[#5A6E9A]">Auto-report bugs</span>
            <button
              type="button"
              role="switch"
              aria-checked={autoReportBugs}
              disabled={!canCreateBug}
              onClick={() => setAutoReportBugs((v) => !v)}
              className={`relative inline-flex h-5 w-9 rounded-full transition-colors ${
                autoReportBugs ? 'bg-[#DC2626]' : 'bg-[#D6E0F5]'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform mt-0.5 ${
                  autoReportBugs ? 'translate-x-4' : 'translate-x-0.5'
                }`}
              />
            </button>
          </label>
          <button
            type="button"
            disabled={notRunCount !== 0 || !canApproveRun}
            onClick={handleFinish}
            className={`shrink-0 rounded-[7px] px-3 py-1.5 text-[12px] font-medium transition ${
              notRunCount === 0 && canApproveRun
                ? 'bg-[#16A34A] hover:bg-green-700 text-white'
                : 'bg-[#B0C0E0] text-[#8A9BBF] cursor-not-allowed'
            }`}
          >
            Finish Run
          </button>
        </div>
      </div>

      {error && (
        <div className="mx-4 mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 shrink-0">
          {error}
        </div>
      )}

      <div className="px-4 py-3 shrink-0 max-w-[1600px] w-full mx-auto">
        <div className="h-2 rounded-full overflow-hidden flex bg-[#EEF2FB]">
          {passSeg > 0 && (
            <div
              className="h-full bg-[#16A34A] first:rounded-l-full"
              style={{ width: `${Math.round(passSeg)}%` }}
            />
          )}
          {failSeg > 0 && (
            <div
              className="h-full bg-[#DC2626]"
              style={{ width: `${Math.round(failSeg)}%` }}
            />
          )}
          {blockedSeg > 0 && (
            <div
              className="h-full bg-[#D97706] last:rounded-r-full"
              style={{ width: `${Math.round(blockedSeg)}%` }}
            />
          )}
        </div>
        <div className="flex flex-wrap gap-[12px] mt-2 text-[11px] text-[#5A6E9A] mb-1">
          <span className="inline-flex items-center gap-1 text-[#16A34A]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#16A34A]" />
            {Math.round(passCount)} passed
          </span>
          <span className="inline-flex items-center gap-1 text-[#DC2626]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#DC2626]" />
            {Math.round(failCount)} failed
          </span>
          <span className="inline-flex items-center gap-1 text-[#D97706]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#D97706]" />
            {Math.round(blockedCount)} blocked
          </span>
          <span className="inline-flex items-center gap-1 text-[#9CA3AF]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#9CA3AF]" />
            {Math.round(skippedCount)} skipped
          </span>
          <span className="inline-flex items-center gap-1 text-[#8A9BBF]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#9CA3AF]" />
            {Math.round(notRunCount)} remaining
          </span>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden px-4 pb-4 max-w-[1600px] w-full mx-auto">
        <div className="flex gap-4 h-full min-h-0">
          <div className="flex-[2] min-w-0 overflow-y-auto pr-1">
            {loading && (
              <p className="text-[13px] text-[#5A6E9A] py-6">Loading run…</p>
            )}
            {!loading &&
              orderedResults.map((row) => {
                const id = String(row.id)
                const res = String(row.result ?? 'Not Run')
                const flash =
                  cardFlash && cardFlash.id === id ? cardFlash.kind : null
                const flashClass =
                  flash === 'fail'
                    ? 'ring-2 ring-red-300'
                    : flash === 'pass'
                      ? 'ring-2 ring-green-300'
                      : ''

                return (
                  <div
                    key={id}
                    className={`bg-white border-[0.5px] border-[#B0C0E0] rounded-[8px] p-3 mb-2 ${leftBorderClass(
                      res,
                    )} ${flashClass} transition-shadow`}
                  >
                    <div className="flex gap-3 justify-between items-start">
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] text-[#5A6E9A] font-medium font-mono">
                          {String(row.testCaseId ?? '—')}
                        </p>
                        <p className="text-[12px] font-medium text-[#1A3263]">
                          {String(row.testCaseTitle ?? '—')}
                        </p>
                        <p className="text-[10px] text-[#5A6E9A]">
                          {String(row.testSuite ?? '')}
                        </p>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button
                          type="button"
                          disabled={viewOnly || !canExecuteRun}
                          onClick={() => handleResult(row, 'Pass')}
                          title={!canExecuteRun && isViewer ? 'Viewers cannot execute runs' : 'Pass'}
                          className={`w-8 h-8 rounded-[7px] border-[0.5px] flex items-center justify-center ${
                            res === 'Pass'
                              ? 'bg-[#16A34A] border-[#16A34A] text-white'
                              : 'bg-[#DCFCE7] border-[#16A34A] text-[#16A34A]'
                          } ${viewOnly ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                        >
                          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M5 12l5 5L20 7" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          disabled={viewOnly || !canExecuteRun}
                          onClick={() => handleResult(row, 'Fail')}
                          title={!canExecuteRun && isViewer ? 'Viewers cannot execute runs' : 'Fail'}
                          className={`w-8 h-8 rounded-[7px] border-[0.5px] flex items-center justify-center ${
                            res === 'Fail'
                              ? 'bg-[#DC2626] border-[#DC2626] text-white'
                              : 'bg-[#FEE2E2] border-[#DC2626] text-[#DC2626]'
                          } ${viewOnly ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                        >
                          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M6 6l12 12M18 6L6 18" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          disabled={viewOnly || !canExecuteRun}
                          onClick={() => handleResult(row, 'Blocked')}
                          title={!canExecuteRun && isViewer ? 'Viewers cannot execute runs' : 'Blocked'}
                          className={`w-8 h-8 rounded-[7px] border-[0.5px] flex items-center justify-center ${
                            res === 'Blocked'
                              ? 'bg-[#D97706] border-[#D97706] text-white'
                              : 'bg-[#FEF3C7] border-[#D97706] text-[#D97706]'
                          } ${viewOnly ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                        >
                          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="9" />
                            <path d="M12 8v5M12 16h.01" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          disabled={viewOnly || !canExecuteRun}
                          onClick={() => handleResult(row, 'Skipped')}
                          title={!canExecuteRun && isViewer ? 'Viewers cannot execute runs' : 'Skip'}
                          className={`w-8 h-8 rounded-[7px] border-[0.5px] flex items-center justify-center ${
                            res === 'Skipped'
                              ? 'bg-[#9CA3AF] border-[#9CA3AF] text-white'
                              : 'bg-[#F1F5F9] border-[#9CA3AF] text-[#9CA3AF]'
                          } ${viewOnly ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                        >
                          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M5 12h14M13 6l6 6-6 6" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    {res !== 'Not Run' && (
                      <div className="mt-3 pt-2 border-t border-[#D6E0F5]">
                        <p
                          className={`text-[11px] font-medium ${
                            res === 'Pass'
                              ? 'text-[#16A34A]'
                              : res === 'Fail'
                                ? 'text-[#DC2626]'
                                : res === 'Blocked'
                                  ? 'text-[#D97706]'
                                  : 'text-[#9CA3AF]'
                          }`}
                        >
                          {res === 'Pass' && '✓ Passed'}
                          {res === 'Fail' && '✗ Failed'}
                          {res === 'Blocked' && '⚠ Blocked'}
                          {res === 'Skipped' && '→ Skipped'}
                        </p>
                        <p className="text-[10px] text-[#5A6E9A] mt-0.5">
                          {row.executedDate
                            ? getRelativeTime(
                                typeof row.executedDate === 'string'
                                  ? row.executedDate
                                  : '',
                              )
                            : ''}
                          {row.executedBy
                            ? ` · ${String(row.executedBy)}`
                            : ''}
                        </p>
                        {(res === 'Fail' || res === 'Blocked') && (
                          <textarea
                            key={`${id}-notes`}
                            defaultValue={row.notes != null ? String(row.notes) : ''}
                            disabled={viewOnly || !canExecuteRun}
                            rows={2}
                            placeholder="Add failure notes..."
                            onBlur={(e) => saveNotes(row, e.target.value)}
                            className="mt-2 w-full text-[12px] rounded-lg border-[0.5px] border-[#B0C0E0] px-2 py-1.5 focus:outline-none focus:border-[#1A3263] focus:ring-1 focus:ring-[rgba(26,50,99,0.15)] disabled:bg-[#F1F5F9]"
                          />
                        )}
                        {/* Report Bug section — shown whenever result is Fail */}
                        {res === 'Fail' && canCreateBug && (
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            {/* Linked bug chips */}
                            {(rowBugIds[id] ?? []).map((chip) => (
                              <button
                                key={chip.docId}
                                type="button"
                                onClick={() => onOpenBug?.(chip.docId)}
                                title={`Open bug ${chip.bugId}`}
                                className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2 py-0.5 font-mono text-[11px] font-semibold text-red-600 transition hover:bg-red-100 hover:border-red-400"
                              >
                                🐛 {chip.bugId}
                              </button>
                            ))}
                            {!autoReportBugs && (
                              <button
                                type="button"
                                onClick={() => openReportBug(row)}
                                className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-medium text-red-600 transition hover:bg-red-100"
                              >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3 w-3" aria-hidden>
                                  <path d="M12 9v4M12 17h.01" />
                                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                                </svg>
                                Report Bug
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
          </div>

          <div className="flex-1 min-w-[240px] max-w-[320px] shrink-0">
            <div className="sticky top-0 space-y-3">
              <div className="rounded-lg border-[0.5px] border-[#1A3263] bg-white p-4">
                <p className="text-[28px] font-semibold text-[#1A3263] leading-none">
                  {Math.round(totalCases) > 0 ? `${Math.round(donePct)}%` : '0%'}
                </p>
                <p className="text-[11px] text-[#5A6E9A] mt-1">
                  {Math.round(done)} of {Math.round(totalCases)} executed
                </p>
              </div>
              <div className="rounded-lg border-[0.5px] border-[#B0C0E0] bg-white p-4">
                <p className="text-[28px] font-semibold text-[#16A34A] leading-none">
                  {Math.round(passCount)}
                </p>
                <p className="text-[11px] text-[#5A6E9A] mt-1">Passed</p>
              </div>
              <div className="rounded-lg border-[0.5px] border-[#B0C0E0] bg-white p-4">
                <p className="text-[28px] font-semibold text-[#DC2626] leading-none">
                  {Math.round(failCount)}
                </p>
                <p className="text-[11px] text-[#5A6E9A] mt-1">Failed</p>
              </div>
              <div className="rounded-lg border-[0.5px] border-[#B0C0E0] bg-white p-4">
                <p className="text-[28px] font-semibold text-[#D97706] leading-none">
                  {Math.round(blockedCount)}
                </p>
                <p className="text-[11px] text-[#5A6E9A] mt-1">Blocked</p>
              </div>

              <button
                type="button"
                disabled={notRunCount !== 0 || !canApproveRun}
                onClick={handleFinish}
                className={`w-full rounded-[7px] py-2.5 text-[13px] font-medium transition ${
                  notRunCount === 0 && canApproveRun
                    ? 'bg-[#16A34A] hover:bg-green-700 text-white'
                    : 'bg-[#B0C0E0] text-[#8A9BBF] cursor-not-allowed'
                }`}
              >
                Finish Run
              </button>
              <button
                type="button"
                onClick={onExit}
                className="w-full rounded-[7px] py-2.5 text-[13px] font-medium text-[#5A6E9A] border-[0.5px] border-[#B0C0E0] bg-white hover:bg-[#EEF2FB] transition"
              >
                ← Exit
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Report Bug Modal */}
      <ReportBugModal
        isOpen={reportBugPrefill !== null}
        onClose={() => setReportBugPrefill(null)}
        projectId={workspaceProjectId || uid}
        prefillFromTestCase={reportBugPrefill}
        onCreated={(docId, bugId) => {
          const resultRowId = reportBugPrefill?._resultRowId
          if (resultRowId && docId && bugId) {
            setRowBugIds((prev) => ({
              ...prev,
              [resultRowId]: [...(prev[resultRowId] ?? []), { docId, bugId }],
            }))
          }
          setReportBugPrefill(null)
        }}
      />
    </div>
  )
}
