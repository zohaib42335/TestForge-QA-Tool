/**
 * @fileoverview RunsList — shows all test runs with progress and actions.
 */

import { useState } from 'react'
import { useAuth } from '../../context/AuthContext.jsx'
import { useRole } from '../../hooks/useRole'
import { buildActivityActor } from '../../utils/memberDisplay.js'
import { deleteTestRun, logActivity, startTestRun } from '../../firebase/firestore.js'
import { useTestRuns } from '../../hooks/useTestRuns.js'
import { getRelativeTime } from '../../utils/relativeTime.js'
import { useToast } from '../Toast.jsx'
import CreateRunModal from './CreateRunModal.jsx'

/**
 * @param {Object} props
 * @param {string|null|undefined} props.projectId
 * @param {Array<Record<string, unknown>>} props.testCases
 * @param {boolean} props.testCasesLoading
 * @param {(runId: string) => void} props.onExecute
 */
export default function RunsList({ projectId, testCases, testCasesLoading, onExecute }) {
  const { user, userProfile } = useAuth()
  const { hasPermission } = useRole()
  const canCreateRun = hasPermission('run_create')
  const canDeleteRun = hasPermission('run_delete')
  const canExecuteRun = hasPermission('run_execute')
  const { runs, loading, error } = useTestRuns()
  const showToast = useToast()
  const [modalOpen, setModalOpen] = useState(false)

  const handleDelete = async (run) => {
    const uid = user?.uid
    if (!uid) {
      showToast('You must be signed in.', 'error')
      return
    }
    if (!projectId) {
      showToast('No active project.', 'error')
      return
    }
    const id = run && run.id != null ? String(run.id) : ''
    if (!id) return
    const ok =
      typeof window !== 'undefined' &&
      window.confirm(
        'Delete this test run and all its results? This cannot be undone.',
      )
    if (!ok) return
    try {
      await deleteTestRun(projectId, uid, id)
      const actor = buildActivityActor(userProfile, user)
      const runName = run && run.name != null ? String(run.name) : 'Test run'
      if (actor) {
        void logActivity({
          action: 'testrun.deleted',
          entityType: 'testRun',
          entityId: id,
          entityRef: runName,
          actor,
        })
      }
      showToast('Test run deleted', 'neutral')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Something went wrong. Try again.'
      showToast(msg, 'error')
    }
  }

  const handleStart = async (run) => {
    const uid = user?.uid
    if (!uid) {
      showToast('You must be signed in.', 'error')
      return
    }
    if (!projectId) {
      showToast('No active project.', 'error')
      return
    }
    const id = run && run.id != null ? String(run.id) : ''
    if (!id) return
    try {
      await startTestRun(projectId, uid, id)
      const actor = buildActivityActor(userProfile, user)
      const runName = run && run.name != null ? String(run.name) : 'Test run'
      if (actor) {
        void logActivity({
          action: 'testrun.started',
          entityType: 'testRun',
          entityId: id,
          entityRef: runName,
          actor,
        })
      }
      showToast('Test run started', 'orange')
      onExecute(id)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Something went wrong. Try again.'
      showToast(msg, 'error')
    }
  }

  const handleContinue = (runId) => {
    onExecute(runId)
  }

  return (
    <div className="w-full max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[15px] font-medium text-[#1A3263]">Test Runs</h2>
        {canCreateRun ? (
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="bg-[#1A3263] text-white rounded-[7px] px-[14px] py-[6px] text-[12px] font-medium hover:bg-[#122247] transition"
          >
            + New Run
          </button>
        ) : null}
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {loading && (
        <div className="space-y-2">
          {[0, 1, 2].map((k) => (
            <div
              key={k}
              className="h-[120px] rounded-[10px] bg-[#D6E0F5] animate-pulse border border-[#B0C0E0]/50"
            />
          ))}
        </div>
      )}

      {!loading && !error && runs.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="#B0C0E0"
            strokeWidth="1.8"
            className="w-8 h-8 mb-4"
            aria-hidden
          >
            <path d="M5 3l14 9-14 9V3z" />
          </svg>
          <p className="text-[15px] font-medium text-[#1A3263] mb-1">No test runs yet</p>
          <p className="text-[13px] text-[#5A6E9A] mb-6">
            {canCreateRun
              ? 'Create a run to start executing test cases'
              : 'Ask a QA Lead or Admin to create a test run for you.'}
          </p>
          {canCreateRun ? (
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="bg-[#1A3263] text-white rounded-[7px] px-4 py-2 text-[13px] font-medium hover:bg-[#122247] transition"
            >
              + Create First Run
            </button>
          ) : null}
        </div>
      )}

      {!loading && runs.length > 0 && (
        <div>
          {runs.map((run) => {
            const id = String(run.id)
            const status = String(run.status ?? 'Pending')
            const totalCases = Math.max(
              0,
              Math.round(Number(run.totalCases)) || 0,
            )
            const passCount = Math.max(0, Math.round(Number(run.passCount)) || 0)
            const failCount = Math.max(0, Math.round(Number(run.failCount)) || 0)
            const blockedCount = Math.max(
              0,
              Math.round(Number(run.blockedCount)) || 0,
            )
            const skippedCount = Math.max(
              0,
              Math.round(Number(run.skippedCount)) || 0,
            )
            const notRunCount = Math.max(
              0,
              Math.round(Number(run.notRunCount)) || 0,
            )
            const done = passCount + failCount + blockedCount + skippedCount
            const pct =
              totalCases > 0 ? Math.round((done / totalCases) * 100) : 0

            const dotColor =
              status === 'In Progress'
                ? '#1A3263'
                : status === 'Completed'
                  ? '#16A34A'
                  : '#9CA3AF'

            const fillColor =
              status === 'Completed'
                ? '#16A34A'
                : status === 'In Progress'
                  ? '#4169C4'
                  : '#9CA3AF'

            const borderClass =
              status === 'In Progress'
                ? 'border-[1px] border-[#1A3263]'
                : 'border-[0.5px] border-[#B0C0E0]'

            return (
              <div
                key={id}
                className={`bg-white ${borderClass} rounded-[10px] p-[14px] mb-2 flex gap-3`}
              >
                <div
                  className="mt-1.5 shrink-0 rounded-full"
                  style={{
                    width: 8,
                    height: 8,
                    backgroundColor: dotColor,
                  }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-[#1A3263] truncate">
                    {String(run.name ?? 'Untitled run')}
                  </p>
                  <p className="text-[11px] text-[#5A6E9A] mt-0.5">
                    {Math.round(totalCases)} cases · {Math.round(done)} done ·{' '}
                    {getRelativeTime(
                      typeof run.createdDate === 'string' ? run.createdDate : '',
                    )}
                  </p>
                  <div
                    className="mt-2 h-[5px] rounded-full overflow-hidden"
                    style={{ backgroundColor: '#EEF2FB' }}
                  >
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.round(pct)}%`,
                        backgroundColor: fillColor,
                      }}
                    />
                  </div>
                  <div className="flex flex-wrap gap-[10px] mt-2 text-[10px]">
                    <span className="inline-flex items-center gap-1 text-[#16A34A]">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#16A34A]" />
                      {Math.round(passCount)} pass
                    </span>
                    <span className="inline-flex items-center gap-1 text-[#DC2626]">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#DC2626]" />
                      {Math.round(failCount)} fail
                    </span>
                    <span className="inline-flex items-center gap-1 text-[#D97706]">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#D97706]" />
                      {Math.round(blockedCount)} blocked
                    </span>
                    <span className="inline-flex items-center gap-1 text-[#9CA3AF]">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#9CA3AF]" />
                      {Math.round(notRunCount)} remaining
                    </span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <span
                    className={`text-[10px] px-[9px] py-[3px] rounded-full border-[0.5px] ${
                      status === 'In Progress'
                        ? 'bg-[#EEF2FB] text-[#1A3263] border-[#B0C0E0]'
                        : status === 'Completed'
                          ? 'bg-[#DCFCE7] text-[#166534] border-green-200'
                          : 'bg-[#F1F5F9] text-[#5A6E9A] border-[#B0C0E0]'
                    }`}
                  >
                    {status}
                  </span>
                  {status === 'Pending' && canExecuteRun && (
                    <button
                      type="button"
                      onClick={() => handleStart(run)}
                      className="text-[11px] font-medium px-3 py-1.5 rounded-[7px] border-[0.5px] border-[#1A3263] text-[#1A3263] bg-white hover:bg-[#EEF2FB] transition"
                    >
                      ▶ Start
                    </button>
                  )}
                  {status === 'In Progress' && canExecuteRun && (
                    <button
                      type="button"
                      onClick={() => handleContinue(id)}
                      className="text-[11px] font-medium px-3 py-1.5 rounded-[7px] bg-[#1A3263] text-white hover:bg-[#122247] transition"
                    >
                      ▶ Continue
                    </button>
                  )}
                  {status === 'Completed' && (
                    <button
                      type="button"
                      onClick={() => handleContinue(id)}
                      className="text-[11px] font-medium px-3 py-1.5 rounded-[7px] text-[#5A6E9A] hover:bg-[#EEF2FB] transition"
                    >
                      View
                    </button>
                  )}
                  {canDeleteRun ? (
                    <button
                      type="button"
                      onClick={() => handleDelete(run)}
                      className="p-1 text-[#DC2626] hover:bg-red-50 rounded transition"
                      aria-label="Delete run"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        className="w-4 h-4"
                      >
                        <path d="M3 6h18M8 6V4h8v2M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M10 11v6M14 11v6" />
                      </svg>
                    </button>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {modalOpen && (
        <CreateRunModal
          projectId={projectId}
          testCases={testCases}
          testCasesLoading={testCasesLoading}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  )
}
