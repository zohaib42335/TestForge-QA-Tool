/**
 * @fileoverview Bug Tracker — main list view with filters, search, and bug cards.
 * Follows the same design system as Dashboard and TestCaseTable.
 *
 * @param {Object} props
 * @param {string} props.projectId
 * @param {(bugDocId: string) => void} props.onOpenDetail
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useBugs } from '../hooks/useBugs.js'
import { useJiraIntegration } from '../hooks/useJiraIntegration.js'
import { useRole } from '../hooks/useRole'
import { useToast } from './Toast.jsx'
import ReportBugModal from './modals/ReportBugModal.jsx'
import { BUG_SEVERITIES, BUG_STATUSES, SEVERITY_COLORS, STATUS_COLORS } from '../constants/bugConstants.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** @param {import('firebase/firestore').Timestamp|null|undefined} ts */
function timeAgo(ts) {
  if (!ts) return '—'
  try {
    const d = typeof ts.toDate === 'function' ? ts.toDate() : new Date(ts)
    const diffMs = Date.now() - d.getTime()
    const mins = Math.floor(diffMs / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    return `${Math.floor(hrs / 24)}d ago`
  } catch { return '—' }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** @param {{ label: string, active: boolean, count?: number, onClick: () => void }} props */
function StatusPill({ label, active, count, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium transition ${
        active
          ? 'bg-[#1A3263] text-white shadow-sm'
          : 'bg-white border border-[#B0C0E0] text-[#5A6E9A] hover:border-[#1A3263] hover:text-[#1A3263]'
      }`}
    >
      {label}
      {count !== undefined && (
        <span className={`rounded-full px-1.5 py-[1px] text-[10px] ${active ? 'bg-white/20 text-white' : 'bg-[#EEF2FB] text-[#1A3263]'}`}>
          {count}
        </span>
      )}
    </button>
  )
}

/** @param {{ bug: import('../types/bug.types.js').Bug, onClick: () => void, onPushJira?: () => void, jiraPushing?: boolean }} props */
function BugRow({ bug, onClick, onPushJira, jiraPushing }) {
  const severity = SEVERITY_COLORS[bug.severity] ?? SEVERITY_COLORS.Medium
  const status   = STATUS_COLORS[bug.status]     ?? STATUS_COLORS.Open
  const tcCount  = bug.linkedTestCaseIds?.length ?? 0

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left transition hover:bg-[#EEF2FB]/60"
    >
      <div className="grid grid-cols-[auto_1fr_auto_auto_auto_auto_auto] items-center gap-3 border-b border-[#EEF2FB] px-4 py-3">
        {/* Bug ID */}
        <span className="shrink-0 rounded bg-[#EEF2FB] px-1.5 py-0.5 font-mono text-[11px] font-semibold text-[#4169C4]">
          {bug.bugId}
        </span>

        {/* Title */}
        <div className="min-w-0">
          <div className="truncate text-[13px] font-medium text-[#1A3263]" title={bug.title}>
            {bug.title}
          </div>
          {bug.environment && (
            <div className="text-[11px] text-[#5A6E9A]">{bug.environment}</div>
          )}
        </div>

        {/* Severity badge */}
        <span className={`shrink-0 hidden sm:inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${severity.bg} ${severity.text} ${severity.border}`}>
          {bug.severity}
        </span>

        {/* Status badge */}
        <span className={`shrink-0 inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${status.bg} ${status.text} ${status.border}`}>
          {bug.status}
        </span>

        {/* Linked TCs */}
        {tcCount > 0 && (
          <span className="shrink-0 hidden md:inline-flex items-center gap-0.5 rounded-full bg-[#EEF2FB] px-2 py-0.5 text-[11px] text-[#5A6E9A]">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3 w-3" aria-hidden>
              <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2" />
            </svg>
            {tcCount} TC{tcCount > 1 ? 's' : ''}
          </span>
        )}

        {/* Time */}
        <span className="shrink-0 hidden lg:block text-[11px] text-[#5A6E9A]">
          {timeAgo(bug.createdAt)}
        </span>

        {/* JIRA */}
        <span className="shrink-0 hidden md:inline-flex" onClick={(e) => e.stopPropagation()}>
          {bug.jiraIssueKey ? (
            <a
              href={bug.jiraIssueUrl ?? '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-full bg-[#0052CC]/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-[#0052CC] transition hover:bg-[#0052CC]/20"
              onClick={(e) => e.stopPropagation()}
            >
              {bug.jiraIssueKey}
            </a>
          ) : onPushJira ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onPushJira() }}
              disabled={jiraPushing}
              title="Push to JIRA"
              className="flex h-6 w-6 items-center justify-center rounded-md text-[#5A6E9A] transition hover:bg-[#0052CC]/10 hover:text-[#0052CC] disabled:opacity-50"
            >
              {jiraPushing ? (
                <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-[#0052CC] border-t-transparent" aria-hidden />
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5" aria-hidden>
                  <path d="M7 17l9.2-9.2M17 17V7H7" />
                </svg>
              )}
            </button>
          ) : (
            <span className="text-[10px] text-[#B0C0E0]">—</span>
          )}
        </span>

        {/* Chevron */}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4 shrink-0 text-[#B0C0E0]" aria-hidden>
          <path d="M9 18l6-6-6-6" />
        </svg>
      </div>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState({ filtered }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <svg viewBox="0 0 24 24" fill="none" stroke="#B0C0E0" strokeWidth="1.5" className="h-10 w-10" aria-hidden>
        <path d="M12 9v4M12 17h.01" />
        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      </svg>
      <h3 className="mt-3 text-[14px] font-medium text-[#1A3263]">
        {filtered ? 'No bugs match your filters' : 'No bugs found — great job! 🎉'}
      </h3>
      <p className="mt-1 text-[12px] text-[#5A6E9A]">
        {filtered ? 'Try adjusting your search or filters.' : 'Report a bug when a test case fails.'}
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function BugTracker({ projectId, onOpenDetail }) {
  const { hasPermission } = useRole()
  const canCreateBug = hasPermission('bug_create')
  const canEditBug = hasPermission('bug_edit')
  const { bugs, loading, error, fetchBugs } = useBugs()
  const { config: jiraConfig, fetchConfig: fetchJiraConfig, createIssue } = useJiraIntegration()
  const showToast = useToast()
  const [reportOpen, setReportOpen] = useState(false)
  const [statusFilter, setStatusFilter] = useState('All')
  const [severityFilter, setSeverityFilter] = useState('All')
  const [search, setSearch] = useState('')
  const [pushingBugId, setPushingBugId] = useState(/** @type {string|null} */ (null))
  const [syncAllProgress, setSyncAllProgress] = useState(/** @type {{ current: number, total: number }|null} */ (null))

  useEffect(() => {
    if (projectId) {
      fetchBugs(projectId)
      void fetchJiraConfig(projectId)
    }
  }, [projectId, fetchBugs, fetchJiraConfig])

  const handleCreated = useCallback((docId, bugId) => {
    fetchBugs(projectId)
  }, [projectId, fetchBugs])

  const handlePushSingle = useCallback(async (bugDocId) => {
    setPushingBugId(bugDocId)
    try {
      const result = await createIssue(projectId, bugDocId)
      showToast(`JIRA issue ${result.jiraIssueKey} created`, 'success')
      fetchBugs(projectId)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to push to JIRA', 'error')
    } finally {
      setPushingBugId(null)
    }
  }, [projectId, createIssue, showToast, fetchBugs])

  const handleSyncAll = useCallback(async () => {
    const unsynced = bugs.filter((b) => !b.jiraIssueKey && (b.status === 'Open' || b.status === 'In Progress'))
    if (unsynced.length === 0) { showToast('No open bugs to sync', 'info'); return }
    setSyncAllProgress({ current: 0, total: unsynced.length })
    let created = 0
    /** @type {string|null} */
    let firstError = null
    for (const b of unsynced) {
      try {
        await createIssue(projectId, b.id)
        created++
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error('[JIRA Sync All] failed for bug', b.id, msg)
        if (!firstError) firstError = msg
      }
      setSyncAllProgress({ current: created, total: unsynced.length })
    }
    setSyncAllProgress(null)
    if (created === 0 && firstError) {
      showToast(`Sync failed: ${firstError}`, 'error')
    } else if (created < unsynced.length && firstError) {
      showToast(`Synced ${created} of ${unsynced.length}. Error: ${firstError}`, 'error')
    } else {
      showToast(`Synced ${created} of ${unsynced.length} bugs to JIRA`, 'success')
    }
    fetchBugs(projectId)
  }, [bugs, projectId, createIssue, showToast, fetchBugs])

  // -------------------------------------------------------------------------
  // Filter & search
  // -------------------------------------------------------------------------

  const statusCounts = useMemo(() => {
    /** @type {Record<string, number>} */
    const counts = { All: bugs.length }
    for (const s of BUG_STATUSES) counts[s] = bugs.filter((b) => b.status === s).length
    return counts
  }, [bugs])

  const filtered = useMemo(() => {
    let list = bugs
    if (statusFilter !== 'All') list = list.filter((b) => b.status === statusFilter)
    if (severityFilter !== 'All') list = list.filter((b) => b.severity === severityFilter)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(
        (b) => b.title?.toLowerCase().includes(q) || b.bugId?.toLowerCase().includes(q)
      )
    }
    return list
  }, [bugs, statusFilter, severityFilter, search])

  const isFiltered = statusFilter !== 'All' || severityFilter !== 'All' || search.trim() !== ''

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="flex flex-col gap-4">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[20px] font-semibold text-[#1A3263]">Bug Tracker</h1>
          <p className="mt-0.5 text-[12px] text-[#5A6E9A]">Track and manage defects linked to test cases</p>
        </div>
        <div className="flex items-center gap-2">
          {jiraConfig?.enabled && canEditBug && (
            <button
              type="button"
              onClick={handleSyncAll}
              disabled={syncAllProgress !== null}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#0052CC]/30 bg-[#0052CC]/5 px-3 py-2 text-[12px] font-medium text-[#0052CC] transition hover:bg-[#0052CC]/10 disabled:opacity-60"
            >
              {syncAllProgress ? (
                <>
                  <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#0052CC] border-t-transparent" aria-hidden />
                  Syncing {syncAllProgress.current} of {syncAllProgress.total}…
                </>
              ) : (
                <>
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>
                    <path d="M11.53 2c0 2.4 1.97 4.35 4.35 4.35h1.78v1.7c0 2.4 1.94 4.34 4.34 4.35V2.84a.84.84 0 00-.84-.84H11.53zM6.77 6.8a4.362 4.362 0 004.34 4.37h1.8v1.72a4.362 4.362 0 004.34 4.35V7.65a.85.85 0 00-.85-.85H6.77zM2 11.6a4.35 4.35 0 004.34 4.34h1.8v1.72a4.35 4.35 0 004.34 4.34v-9.57a.84.84 0 00-.84-.84H2z" />
                  </svg>
                  Sync All with JIRA
                </>
              )}
            </button>
          )}
          {canCreateBug ? (
            <button
              type="button"
              onClick={() => setReportOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-[#1A3263] px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-[#122247]"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden>
                <path d="M12 5v14M5 12h14" />
              </svg>
              Report Bug
            </button>
          ) : null}
        </div>
      </div>

      {/* Filter bar */}
      <div className="rounded-[10px] border border-[#B0C0E0] bg-white p-3 shadow-sm">
        {/* Status pills */}
        <div className="mb-3 flex flex-wrap gap-2">
          <StatusPill label="All" active={statusFilter === 'All'} count={statusCounts.All} onClick={() => setStatusFilter('All')} />
          {BUG_STATUSES.map((s) => (
            <StatusPill key={s} label={s} active={statusFilter === s} count={statusCounts[s]} onClick={() => setStatusFilter(s)} />
          ))}
        </div>

        {/* Severity dropdown + search */}
        <div className="flex flex-col gap-2 sm:flex-row">
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="rounded-lg border border-[#B0C0E0] bg-white px-3 py-2 text-[12px] text-[#1A3263] outline-none transition focus:border-[#1A3263] sm:w-[160px]"
          >
            <option value="All">All Severities</option>
            {BUG_SEVERITIES.map((s) => <option key={s}>{s}</option>)}
          </select>
          <div className="relative flex-1">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#B0C0E0]" aria-hidden>
              <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search bugs by title or ID…"
              className="w-full rounded-lg border border-[#B0C0E0] bg-white py-2 pl-9 pr-3 text-[12px] text-[#1A3263] placeholder-[#9CA3AF] outline-none transition focus:border-[#1A3263] focus:ring-1 focus:ring-[#1A3263]/20"
            />
          </div>
        </div>
      </div>

      {/* Bug list */}
      <div className="rounded-[10px] border border-[#B0C0E0] bg-white shadow-sm overflow-hidden">
        {/* Table header */}
        <div className="grid grid-cols-[auto_1fr_auto_auto_auto_auto_auto] items-center gap-3 border-b border-[#B0C0E0] bg-[#EEF2FB] px-4 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-[#5A6E9A]">ID</div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-[#5A6E9A]">Title</div>
          <div className="hidden text-[10px] font-semibold uppercase tracking-wide text-[#5A6E9A] sm:block">Severity</div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-[#5A6E9A]">Status</div>
          <div className="hidden text-[10px] font-semibold uppercase tracking-wide text-[#5A6E9A] md:block">TCs</div>
          <div className="hidden text-[10px] font-semibold uppercase tracking-wide text-[#5A6E9A] lg:block">Created</div>
          <div className="hidden text-[10px] font-semibold uppercase tracking-wide text-[#5A6E9A] md:block">JIRA</div>
          <div className="w-4" />
        </div>

        {/* Rows */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <span className="inline-block h-7 w-7 animate-spin rounded-full border-2 border-[#1A3263] border-t-transparent" aria-hidden />
          </div>
        ) : error ? (
          <div className="px-4 py-4 text-sm text-red-600">{error}</div>
        ) : filtered.length === 0 ? (
          <EmptyState filtered={isFiltered} />
        ) : (
          filtered.map((bug) => (
            <BugRow
              key={bug.id}
              bug={bug}
              onClick={() => onOpenDetail(bug.id)}
              onPushJira={jiraConfig?.enabled && canEditBug ? () => handlePushSingle(bug.id) : undefined}
              jiraPushing={pushingBugId === bug.id}
            />
          ))
        )}
      </div>

      {/* Report Bug modal */}
      <ReportBugModal
        isOpen={reportOpen}
        onClose={() => setReportOpen(false)}
        projectId={projectId}
        onCreated={handleCreated}
      />
    </div>
  )
}
