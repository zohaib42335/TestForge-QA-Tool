/**
 * Dashboard — Live Firestore-backed overview for TestForge.
 *
 * Option D layout:
 * - Top stat cards row (5 cards)
 * - Two-column panels: status breakdown, by priority, recent failures, recent activity
 *
 * This component is presentation-only and expects `testCases` from the parent (single source of truth).
 *
 * @param {Object} props
 * @param {Array<object>} props.testCases
 * @param {boolean} [props.loading]
 * @param {string} [props.error]
 * @param {(tabKey: string) => void} props.onNavigate
 * @param {boolean} [props.canCreate]
 * @returns {import('react').JSX.Element}
 */
import { useContext, useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore'
import { AIGeneratorContext } from '../context/AIGeneratorContext.jsx'
import { getDb } from '../firebase/firestore.js'
import { useAuth } from '../context/AuthContext.jsx'
import { useProject } from '../contexts/ProjectContext'

/**
 * @param {string|undefined|null} dateString
 * @returns {string}
 */
function getRelativeTime(dateString) {
  const s = dateString == null ? '' : String(dateString)
  const date = new Date(s)
  if (Number.isNaN(date.getTime())) return '—'
  const now = new Date()
  const diffMs = now - date
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)
  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins} min ago`
  if (diffHours < 24) return `${diffHours} hr ago`
  return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`
}

/** Convert a Firestore Timestamp or date string to a JS Date. @param {any} v */
function anyToDate(v) {
  if (!v) return new Date(0)
  if (typeof v.toDate === 'function') return v.toDate()
  return new Date(v)
}

/**
 * @param {object} tc
 * @returns {string}
 */
function tcId(tc) {
  return tc?.testCaseId ?? tc?.id ?? '—'
}

/**
 * @param {object} tc
 * @returns {string}
 */
function tcTitle(tc) {
  return tc?.testTitle ?? tc?.title ?? '—'
}

/**
 * @param {object} tc
 * @returns {string}
 */
function tcCreatedDate(tc) {
  return tc?.createdDate ?? ''
}

/**
 * @param {object} tc
 * @returns {string}
 */
function tcCreatedBy(tc) {
  const v = tc?.createdBy
  return v == null || String(v).trim() === '' ? '—' : String(v)
}

/**
 * Normalize status so Dashboard works with existing app data.
 * @param {unknown} raw
 * @returns {'Pass'|'Fail'|'Blocked'|'Not Run'}
 */
function normalizeStatus(raw) {
  const s = raw == null ? '' : String(raw).trim()
  if (s === 'Pass') return 'Pass'
  if (s === 'Fail') return 'Fail'
  if (s === 'Blocked') return 'Blocked'
  // App previously used "Not Executed" – treat as Not Run for dashboard stats.
  return 'Not Run'
}

/**
 * @param {unknown} raw
 * @returns {'Critical'|'High'|'Medium'|'Low'}
 */
function normalizePriority(raw) {
  const s = raw == null ? '' : String(raw).trim()
  if (s === 'Critical') return 'Critical'
  if (s === 'High') return 'High'
  if (s === 'Medium') return 'Medium'
  return 'Low'
}

/**
 * @param {{ label: string, count: number, total: number, color: string }} props
 */
function BarRow({ label, count, total, color }) {
  const pct = total === 0 ? 0 : Math.round((count / total) * 100)
  return (
    <div className="flex items-center gap-2">
      <div className="w-[52px] text-right text-[10px] text-[#5A6E9A]">{label}</div>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#EEF2FB]">
        <div className="h-2 rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <div className="w-[24px] text-right text-[10px] text-[#1A3263]">
        {Math.round(count)}
      </div>
    </div>
  )
}

function IconClipboard({ className = 'h-4 w-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
    </svg>
  )
}
function IconCheck({ className = 'h-4 w-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M20 6L9 17l-5-5" />
    </svg>
  )
}
function IconX({ className = 'h-4 w-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  )
}
function IconWarning({ className = 'h-4 w-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
      <circle cx="12" cy="12" r="9" />
    </svg>
  )
}
function IconChart({ className = 'h-4 w-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M4 19V5" />
      <path d="M4 19h16" />
      <path d="M8 17v-6" />
      <path d="M12 17v-9" />
      <path d="M16 17v-4" />
    </svg>
  )
}
function IconSparkle({ className = 'h-4 w-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" />
    </svg>
  )
}

/**
 * @param {string} p
 * @returns {{ bg: string, text: string }}
 */
function priorityBadge(p) {
  if (p === 'Critical' || p === 'High') return { bg: '#FEE2E2', text: '#991B1B' }
  if (p === 'Medium') return { bg: '#FEF3C7', text: '#92400E' }
  return { bg: '#F1F5F9', text: '#5A6E9A' }
}

export default function Dashboard({ testCases, loading = false, error = '', onNavigate, canCreate = true }) {
  const list = Array.isArray(testCases) ? testCases : []
  const { user } = useAuth()
  const { projectId } = useProject()

  // Open bugs count — live subscription so it updates when bugs are created/changed
  const [openBugsCount, setOpenBugsCount] = useState(0)
  useEffect(() => {
    const pid = projectId != null && String(projectId).trim() !== '' ? String(projectId).trim() : ''
    if (!pid) {
      setOpenBugsCount(0)
      return
    }
    const db = getDb()
    if (!db) return
    const col = collection(db, `projects/${pid}/bugs`)
    const q = query(col, where('status', '==', 'Open'))
    const unsub = onSnapshot(
      q,
      (snap) => setOpenBugsCount(snap.size),
      () => { /* non-critical, ignore errors */ },
    )
    return () => unsub()
  }, [projectId])

  // Fetch the latest 3 AI generation log entries for the activity feed
  const aiCtx = useContext(AIGeneratorContext)
  const [aiLogs, setAiLogs] = useState([])
  useEffect(() => {
    const projectId = aiCtx?.projectId
    if (!projectId) return
    let cancelled = false
    const run = async () => {
      try {
        const db = getDb()
        if (!db) return
        const col = collection(db, `projects/${projectId}/aiGenerationLogs`)
        const q = query(col, orderBy('createdAt', 'desc'), limit(3))
        const snap = await getDocs(q)
        if (!cancelled) {
          setAiLogs(snap.docs.map((d) => ({ id: d.id, ...d.data(), __kind: 'ai' })))
        }
      } catch { /* non-critical */ }
    }
    void run()
    return () => { cancelled = true }
  }, [aiCtx?.projectId])

  const stats = useMemo(() => {
    const normalized = list.map((t) => ({
      ...t,
      __status: normalizeStatus(t?.status),
      __priority: normalizePriority(t?.priority),
    }))

    const total = normalized.length
    const passCount = normalized.filter((t) => t.__status === 'Pass').length
    const failCount = normalized.filter((t) => t.__status === 'Fail').length
    const blockedCount = normalized.filter((t) => t.__status === 'Blocked').length
    const notRunCount = normalized.filter((t) => t.__status === 'Not Run').length
    const passRate = total === 0 ? 0 : Math.round((passCount / total) * 100)

    const criticalCount = normalized.filter((t) => t.__priority === 'Critical').length
    const highCount     = normalized.filter((t) => t.__priority === 'High').length
    const mediumCount   = normalized.filter((t) => t.__priority === 'Medium').length
    const lowCount      = normalized.filter((t) => t.__priority === 'Low').length
    const aiCount       = normalized.filter((t) => t.source === 'ai').length

    const recentFailures = [...normalized]
      .filter((t) => t.__status === 'Fail' || t.__status === 'Blocked')
      .sort((a, b) => new Date(tcCreatedDate(b)) - new Date(tcCreatedDate(a)))
      .slice(0, 5)

    const recentActivity = [...normalized]
      .sort((a, b) => new Date(tcCreatedDate(b)) - new Date(tcCreatedDate(a)))
      .slice(0, 5)

    return {
      total,
      passCount,
      failCount,
      blockedCount,
      notRunCount,
      passRate,
      criticalCount,
      highCount,
      mediumCount,
      lowCount,
      aiCount,
      recentFailures,
      recentActivity,
    }
  }, [list])

  // Merge test-case activity with AI generation logs, sorted newest first
  const mergedActivity = useMemo(() => {
    const tcItems = stats.recentActivity.map((t) => ({
      __kind: 'tc',
      __date: anyToDate(tcCreatedDate(t)),
      tc: t,
    }))
    const aiItems = aiLogs.map((log) => ({
      __kind: 'ai',
      __date: anyToDate(log.createdAt),
      log,
    }))
    return [...tcItems, ...aiItems]
      .sort((a, b) => b.__date - a.__date)
      .slice(0, 7)
  }, [stats.recentActivity, aiLogs])

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
        {error}
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-3 sm:gap-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-[10px] bg-[#D6E0F5]" />
          ))}
          <div className="h-20 animate-pulse rounded-[10px] bg-[#D6E0F5]" />
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4">
          <div className="h-[260px] animate-pulse rounded-[10px] bg-[#D6E0F5]" />
          <div className="h-[260px] animate-pulse rounded-[10px] bg-[#D6E0F5]" />
          <div className="h-[260px] animate-pulse rounded-[10px] bg-[#D6E0F5]" />
          <div className="h-[260px] animate-pulse rounded-[10px] bg-[#D6E0F5]" />
        </div>
      </div>
    )
  }

  if (stats.total === 0) {
    return (
      <div className="mx-auto max-w-xl rounded-[10px] border border-[#B0C0E0] bg-white p-6 text-center sm:p-8">
        <svg viewBox="0 0 24 24" fill="none" stroke="#B0C0E0" strokeWidth="1.8" className="mx-auto h-8 w-8" aria-hidden>
          <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
        <h2 className="mt-3 text-base font-medium text-[#1A3263]">No test cases yet</h2>
        <p className="mt-1 text-sm text-[#5A6E9A]">
          {canCreate
            ? 'Create your first test case to see dashboard stats here'
            : 'Ask a QA Lead or Admin to create test cases. You can view the dashboard once data exists.'}
        </p>
        {canCreate ? (
          <button
            type="button"
            onClick={() => onNavigate('new')}
            className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-lg bg-[#1A3263] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#122247]"
          >
            + New Test Case
          </button>
        ) : null}
      </div>
    )
  }

  const statCardBase =
    'rounded-[10px] bg-white p-3 border-[0.5px] shadow-sm sm:p-4'

  const panelBase =
    'rounded-[10px] bg-white p-3 border-[0.5px] border-[#B0C0E0] shadow-sm sm:p-4'

  return (
    <div className="flex flex-col gap-3 sm:gap-4">
      {/* Stat cards: 2 cols mobile, 3 tablet, 6 desktop */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <div className={`${statCardBase} border-[#B0C0E0]`}>
          <div className="mb-2 flex items-center gap-2 text-[11px] text-[#5A6E9A]">
            <IconClipboard />
            <span>Total cases</span>
          </div>
          <div className="text-[26px] font-medium leading-none text-[#1A3263]">
            {Math.round(stats.total)}
          </div>
        </div>
        <div className={`${statCardBase} border-[#B0C0E0]`}>
          <div className="mb-2 flex items-center gap-2 text-[11px] text-[#5A6E9A]">
            <IconCheck />
            <span>Passed</span>
          </div>
          <div className="text-[26px] font-medium leading-none text-green-600">
            {Math.round(stats.passCount)}
          </div>
        </div>
        <div className={`${statCardBase} border-[#B0C0E0]`}>
          <div className="mb-2 flex items-center gap-2 text-[11px] text-[#5A6E9A]">
            <IconX />
            <span>Failed</span>
          </div>
          <div className="text-[26px] font-medium leading-none text-red-600">
            {Math.round(stats.failCount)}
          </div>
        </div>
        <div className={`${statCardBase} border-[#B0C0E0]`}>
          <div className="mb-2 flex items-center gap-2 text-[11px] text-[#5A6E9A]">
            <IconWarning />
            <span>Blocked</span>
          </div>
          <div className="text-[26px] font-medium leading-none text-amber-600">
            {Math.round(stats.blockedCount)}
          </div>
        </div>
        <div
          className={`${statCardBase} col-span-2 border border-[#1A3263] bg-[#EEF2FB] sm:col-span-1`}
        >
          <div className="mb-2 flex items-center gap-2 text-[11px] text-[#5A6E9A]">
            <IconChart />
            <span>Pass rate</span>
          </div>
          <div className="text-[26px] font-medium leading-none text-[#1A3263]">
            {`${Math.round(stats.passRate)}%`}
          </div>
        </div>
        {/* AI Generated card */}
        <div className={`${statCardBase} col-span-2 border-[#B0C0E0] sm:col-span-1`}>
          <div className="mb-2 flex items-center gap-2 text-[11px] text-[#5A6E9A]">
            <IconSparkle />
            <span>AI Generated</span>
          </div>
          <div className="text-[26px] font-medium leading-none text-[#4169C4]">
            {Math.round(stats.aiCount)}
          </div>
        </div>
        {/* Open Bugs card */}
        <div
          className={`${statCardBase} col-span-2 border-red-200 sm:col-span-1 cursor-pointer`}
          onClick={() => onNavigate('bugs')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onNavigate('bugs') }}
          title="View Bug Tracker"
        >
          <div className="mb-2 flex items-center gap-2 text-[11px] text-[#5A6E9A]">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden>
              <path d="M12 9v4M12 17h.01" />
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            <span>Open Bugs</span>
          </div>
          <div className="text-[26px] font-medium leading-none text-red-600">
            {openBugsCount}
          </div>
        </div>
      </div>

      {/* Panels: single column mobile; 2×2 from md */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4">
        <div className={panelBase}>
          <div className="mb-3 flex items-baseline justify-between">
            <div className="text-[12px] font-medium text-[#1A3263]">Status breakdown</div>
            <div className="text-[10px] font-normal text-[#5A6E9A]">by count</div>
          </div>
          <div className="space-y-2">
            <BarRow label="Passed" count={stats.passCount} total={stats.total} color="#16A34A" />
            <BarRow label="Failed" count={stats.failCount} total={stats.total} color="#DC2626" />
            <BarRow label="Blocked" count={stats.blockedCount} total={stats.total} color="#D97706" />
            <BarRow label="Not Run" count={stats.notRunCount} total={stats.total} color="#9CA3AF" />
          </div>
        </div>

        <div className={panelBase}>
          <div className="mb-3 flex items-baseline justify-between">
            <div className="text-[12px] font-medium text-[#1A3263]">By priority</div>
            <div className="text-[10px] font-normal text-[#5A6E9A]">&nbsp;</div>
          </div>
          <div className="space-y-2">
            <BarRow label="Critical" count={stats.criticalCount} total={stats.total} color="#DC2626" />
            <BarRow label="High" count={stats.highCount} total={stats.total} color="#DC2626" />
            <BarRow label="Medium" count={stats.mediumCount} total={stats.total} color="#D97706" />
            <BarRow label="Low" count={stats.lowCount} total={stats.total} color="#9CA3AF" />
          </div>
        </div>

        <div className={panelBase}>
          <div className="mb-3 flex items-baseline justify-between">
            <div className="text-[12px] font-medium text-[#1A3263]">Recent failures</div>
            <div className="text-[10px] font-normal text-[#5A6E9A]">needs attention</div>
          </div>

          {stats.recentFailures.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <svg viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="1.8" className="h-6 w-6" aria-hidden>
                <path d="M20 6L9 17l-5-5" />
              </svg>
              <div className="mt-2 text-[12px] font-medium text-green-600">
                No failures — looking good!
              </div>
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border-[0.5px] border-[#EEF2FB]">
              <div className="grid grid-cols-[72px_1fr_76px] bg-[#EEF2FB] px-2 py-1 text-[10px] font-medium text-[#5A6E9A]">
                <div>ID</div>
                <div>Title</div>
                <div className="text-right">Priority</div>
              </div>
              {stats.recentFailures.map((t, idx) => {
                const pri = normalizePriority(t?.priority)
                const badge = priorityBadge(pri)
                return (
                  <div
                    key={`${tcId(t)}-${idx}`}
                    className={`grid grid-cols-[72px_1fr_76px] items-center gap-2 border-t border-[#EEF2FB] px-2 py-1 text-[10px] ${
                      idx % 2 === 1 ? 'bg-[#EEF2FB]' : 'bg-white'
                    }`}
                  >
                    <div className="font-mono text-[#1A3263]">{String(tcId(t))}</div>
                    <div className="truncate text-[#1A3263]" title={String(tcTitle(t))}>
                      {String(tcTitle(t))}
                    </div>
                    <div className="text-right">
                        <span
                          className="inline-flex rounded-full px-2 py-0.5"
                          style={{ background: badge.bg, color: badge.text }}
                        >
                          {pri}
                        </span>
                        {/* Linked bug chip */}
                        {t?.linkedBugIds && Array.isArray(t.linkedBugIds) && t.linkedBugIds.length > 0 && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onNavigate('bugs') }}
                            className="ml-1 inline-flex items-center rounded-full border border-red-200 bg-red-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-red-600 hover:bg-red-100 transition"
                            title={`Linked: ${t.linkedBugIds.join(', ')}`}
                          >
                            → {t.linkedBugIds[0]}
                          </button>
                        )}
                      </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className={panelBase}>
          <div className="mb-3 flex items-baseline justify-between">
            <div className="text-[12px] font-medium text-[#1A3263]">Recent activity</div>
            <div className="text-[10px] font-normal text-[#5A6E9A]">&nbsp;</div>
          </div>

          {mergedActivity.length === 0 ? (
            <div className="py-8 text-center text-[12px] text-[#5A6E9A]">No activity yet</div>
          ) : (
            <div className="space-y-2">
              {mergedActivity.map((item, idx) => {
                if (item.__kind === 'ai') {
                  const log = item.log
                  const mod = log.moduleName ? ` · ${log.moduleName}` : ''
                  const timeStr = getRelativeTime(
                    item.__date && item.__date.getTime() > 0 ? item.__date.toISOString() : '',
                  )
                  return (
                    <div key={`ai-${log.id}`} className="flex items-start gap-2">
                      <span className="mt-1 inline-block h-[6px] w-[6px] rounded-full" style={{ background: '#4169C4' }} aria-hidden />
                      <div className="min-w-0">
                        <div className="text-[10px] text-[#1A3263]">
                          ✨ AI generated {log.generatedCount ?? 0} test cases{mod}
                        </div>
                        <div className="text-[10px] text-[#5A6E9A]">{timeStr}</div>
                      </div>
                    </div>
                  )
                }
                const t = item.tc
                const st = normalizeStatus(t?.status)
                const dot =
                  !t?.testCaseId ? '#4169C4'
                  : st === 'Pass'    ? '#16A34A'
                  : st === 'Fail'    ? '#DC2626'
                  : st === 'Blocked' ? '#D97706'
                  : '#9CA3AF'
                const id   = String(t?.testCaseId ?? '—')
                const main = t?.testCaseId ? `${id} marked as ${st}` : `New case ${id} created`
                return (
                  <div key={`tc-${tcId(t)}-${idx}`} className="flex items-start gap-2">
                    <span className="mt-1 inline-block h-[6px] w-[6px] rounded-full" style={{ background: dot }} aria-hidden />
                    <div className="min-w-0">
                      <div className="text-[10px] text-[#1A3263]">{main}</div>
                      <div className="text-[10px] text-[#5A6E9A]">
                        {getRelativeTime(tcCreatedDate(t))} · {tcCreatedBy(t)}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
