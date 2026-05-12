/**
 * @fileoverview Activity Log — timeline of workspace audit events (Admin / QA Lead).
 */

import { useEffect, useMemo, useState } from 'react'
import { publicActorNameFromLog, publicTeamMemberName } from '../utils/memberDisplay.js'
import { subscribeToActivityLogs, subscribeToUsers } from '../firebase/firestore.js'

/** @typedef {'all'|'testCase'|'testRun'|'template'|'comment'|'user'|'bulkUpdate'} EntityFilter */

/**
 * @param {string} iso
 * @returns {Date|null}
 */
function parseTs(iso) {
  if (typeof iso !== 'string' || iso.trim() === '') return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * @param {Date} d
 * @returns {string} YYYY-MM-DD local
 */
function dayKey(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * @param {Date} d
 * @returns {string}
 */
function separatorLabel(d) {
  const today = new Date()
  const yest = new Date()
  yest.setDate(today.getDate() - 1)
  if (dayKey(d) === dayKey(today)) return 'Today'
  if (dayKey(d) === dayKey(yest)) return 'Yesterday'
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

/**
 * @param {Date} d
 * @returns {boolean}
 */
function isThisWeek(d) {
  const now = new Date()
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - start.getDay())
  return d >= start && d <= now
}

/**
 * @param {Date} d
 * @returns {string}
 */
function formatEntryTime(d) {
  const today = new Date()
  if (dayKey(d) === dayKey(today)) {
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  }
  if (isThisWeek(d)) {
    return `${d.toLocaleDateString(undefined, { weekday: 'short' })} ${d.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    })}`
  }
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

/**
 * @param {string} value
 * @param {'status'|'result'|'role'|'priority'|'commentType'} kind
 * @returns {import('react').JSX.Element|null}
 */
function TonePill({ value, kind }) {
  const v = String(value ?? '')
  if (!v) return null

  /** @type {string} */
  let cls =
    'inline-flex items-center rounded-[99px] border-[0.5px] px-[6px] py-[1px] text-[10px] font-semibold'

  if (kind === 'status' || kind === 'result') {
    if (v === 'Pass')
      cls += ' border-green-200 bg-[#DCFCE7] text-[#166534]'
    else if (v === 'Fail')
      cls += ' border-red-200 bg-[#FEE2E2] text-[#991B1B]'
    else if (v === 'Blocked')
      cls += ' border-amber-200 bg-[#FEF3C7] text-[#92400E]'
    else cls += ' border-[#B0C0E0] bg-[#EEF2FB] text-[#1A3263]'
  } else if (kind === 'role') {
    if (v === 'Admin') cls += ' border-[#B0C0E0] bg-[#EEF2FB] text-[#1A3263]'
    else if (v === 'QA Lead') cls += ' border-[#97C459] bg-[#EAF3DE] text-[#3B6D11]'
    else cls += ' border-[#B0C0E0] bg-[#EEF2FB] text-[#2A4A8A]'
  } else if (kind === 'priority') {
    if (v === 'High' || v === 'Critical')
      cls += ' border-red-200 bg-[#FEE2E2] text-[#991B1B]'
    else if (v === 'Low') cls += ' border-green-200 bg-[#DCFCE7] text-[#166534]'
    else cls += ' border-amber-200 bg-[#FEF3C7] text-[#92400E]'
  } else if (kind === 'commentType') {
    if (v === 'note') cls += ' border-emerald-200 bg-[#E1F5EE] text-[#0F6E56]'
    else if (v === 'failure') cls += ' border-red-200 bg-[#FEE2E2] text-[#991B1B]'
    else if (v === 'question') cls += ' border-indigo-200 bg-[#EEEDFE] text-[#534AB7]'
    else cls += ' border-[#B0C0E0] bg-[#EEF2FB] text-[#1A3263]'
  }

  const label =
    kind === 'commentType'
      ? v === 'comment'
        ? 'Comment'
        : v === 'note'
          ? 'Note'
          : v === 'failure'
            ? 'Failure'
            : v === 'question'
              ? 'Question'
              : v
      : v

  return <span className={cls}>{label}</span>
}

/**
 * @param {{ text: string }} props
 * @returns {import('react').JSX.Element|null}
 */
function EntityChip({ text }) {
  const t = String(text ?? '').trim()
  if (!t) return null
  return (
    <span className="ml-1 inline-flex max-w-[10rem] truncate rounded border-[0.5px] border-[#B0C0E0] bg-[#EEF2FB] px-[6px] py-[1px] text-[10px] font-medium text-[#1A3263] align-middle">
      [{t}]
    </span>
  )
}

/**
 * Actor line: public name plus role pill (no email).
 * @param {{ row: Record<string, unknown> }} props
 */
function ActorName({ row }) {
  const label = publicActorNameFromLog(row.actorName)
  const role = String(row.actorRole ?? '').trim()
  return (
    <span className="inline-flex flex-wrap items-center gap-1 align-middle">
      <span className="font-medium">{label}</span>
      {role ? <TonePill value={role} kind="role" /> : null}
    </span>
  )
}

/**
 * @param {string} label
 * @returns {string}
 */
function initialsFromPublicLabel(label) {
  const s = String(label ?? '').trim()
  const words = s.split(/\s+/).filter(Boolean)
  if (words.length >= 2) {
    return `${words[0][0] || ''}${words[1][0] || ''}`.toUpperCase().slice(0, 2)
  }
  return (s.slice(0, 2) || '?').toUpperCase()
}

/**
 * @param {Record<string, unknown>} row
 * @returns {{ rowTint: string, body: import('react').JSX.Element }}
 */
export function renderSentence(row) {
  const action = String(row.action ?? '')
  const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata : {}
  const ch = row.changes && typeof row.changes === 'object' ? row.changes : null

  let rowTint = ''

  if (action === 'testcase.created') {
    return {
      rowTint: '',
      body: (
        <span className="text-[12px] leading-snug text-[#1A3263]">
          <ActorName row={row} /> created test case
          <EntityChip text={String(row.entityRef ?? '')} />
        </span>
      ),
    }
  }

  if (action === 'testcase.updated') {
    const field = ch && typeof ch.field === 'string' ? ch.field : 'details'
    const from = ch && ch.from != null ? String(ch.from) : ''
    const to = ch && ch.to != null ? String(ch.to) : ''
    return {
      rowTint: '',
      body: (
        <div className="space-y-1">
          <span className="text-[12px] leading-snug text-[#1A3263]">
            <ActorName row={row} /> updated <span className="font-medium">{field}</span> on
            <EntityChip text={String(row.entityRef ?? '')} />
          </span>
          {from !== '' || to !== '' ? (
            <p className="text-[11px] text-[#5A6E9A]">
              <span className="line-through decoration-[#8A9BBF]">{from || '—'}</span>
              <span className="mx-1 text-[#8A9BBF]">→</span>
              <span className="text-[#1A3263]">{to || '—'}</span>
            </p>
          ) : null}
        </div>
      ),
    }
  }

  if (action === 'testcase.status_changed') {
    const from = ch && ch.from != null ? String(ch.from) : ''
    const to = ch && ch.to != null ? String(ch.to) : ''
    return {
      rowTint: '',
      body: (
        <div className="space-y-1">
          <span className="text-[12px] leading-snug text-[#1A3263]">
            <ActorName row={row} /> changed status on
            <EntityChip text={String(row.entityRef ?? '')} />
          </span>
          <div className="flex flex-wrap items-center gap-1 text-[11px] text-[#5A6E9A]">
            <TonePill value={from} kind="status" />
            <span>→</span>
            <TonePill value={to} kind="status" />
          </div>
        </div>
      ),
    }
  }

  if (action === 'testcase.deleted') {
    rowTint = 'bg-[#FFF5F5]'
    const title = meta && typeof meta.title === 'string' ? meta.title : String(row.entityRef ?? '')
    return {
      rowTint,
      body: (
        <span className="text-[12px] leading-snug text-[#1A3263]">
          <ActorName row={row} /> deleted test case{' '}
          <span className="font-medium text-red-700">{title || '—'}</span>
        </span>
      ),
    }
  }

  if (action === 'testcase.duplicated') {
    const sourceRef =
      meta && typeof meta.sourceRef === 'string' && meta.sourceRef.trim() !== ''
        ? meta.sourceRef.trim()
        : '—'
    const dest = String(row.entityRef ?? '')
    return {
      rowTint: '',
      body: (
        <span className="text-[12px] leading-snug text-[#1A3263]">
          <ActorName row={row} /> duplicated{' '}
          <EntityChip text={sourceRef} />
          <span className="mx-1 text-[#8A9BBF]">→</span>
          <EntityChip text={dest} />
        </span>
      ),
    }
  }

  if (action === 'testcase.bulk_status_changed') {
    const to = ch && ch.to != null ? String(ch.to) : ''
    const count = ch && typeof ch.count === 'number' ? Math.round(ch.count) : 0
    return {
      rowTint: '',
      body: (
        <span className="text-[12px] leading-snug text-[#1A3263]">
          <ActorName row={row} /> bulk updated {Math.round(count)} test cases to{' '}
          <TonePill value={to} kind="status" />
        </span>
      ),
    }
  }

  if (action === 'testcase.imported') {
    const count = meta && typeof meta.count === 'number' ? Math.round(meta.count) : 0
    return {
      rowTint: '',
      body: (
        <span className="text-[12px] leading-snug text-[#1A3263]">
          <ActorName row={row} /> imported {Math.round(count)} test cases
        </span>
      ),
    }
  }

  if (action === 'testrun.created') {
    const runName = String(row.entityRef ?? '')
    return {
      rowTint: '',
      body: (
        <span className="text-[12px] leading-snug text-[#1A3263]">
          <ActorName row={row} /> created test run “<span className="font-medium">{runName}</span>”
        </span>
      ),
    }
  }

  if (action === 'testrun.started') {
    const runName = String(row.entityRef ?? '')
    return {
      rowTint: '',
      body: (
        <span className="text-[12px] leading-snug text-[#1A3263]">
          <ActorName row={row} /> started test run “<span className="font-medium">{runName}</span>”
        </span>
      ),
    }
  }

  if (action === 'testrun.completed') {
    rowTint = 'bg-[#F0FDF4]'
    const runName = String(row.entityRef ?? '')
    const rate = meta && typeof meta.passRate === 'number' ? Math.round(meta.passRate) : 0
    return {
      rowTint,
      body: (
        <span className="text-[12px] leading-snug text-[#1A3263]">
          <ActorName row={row} /> completed test run “
          <span className="font-medium">{runName}</span>” —{' '}
          <span className="font-semibold text-[#166534]">{rate}%</span> pass rate
        </span>
      ),
    }
  }

  if (action === 'testrun.deleted') {
    const runName = String(row.entityRef ?? '')
    return {
      rowTint: '',
      body: (
        <span className="text-[12px] leading-snug text-[#1A3263]">
          <ActorName row={row} /> deleted test run “<span className="font-medium">{runName}</span>”
        </span>
      ),
    }
  }

  if (action === 'testrun.result_updated') {
    const runName = String(row.entityRef ?? '')
    const tcRef = ch && ch.testCaseRef != null ? String(ch.testCaseRef) : ''
    const to = ch && ch.to != null ? String(ch.to) : ''
    return {
      rowTint: '',
      body: (
        <span className="text-[12px] leading-snug text-[#1A3263]">
          <ActorName row={row} /> marked <EntityChip text={tcRef} /> as{' '}
          <TonePill value={to} kind="result" /> in “<span className="font-medium">{runName}</span>”
        </span>
      ),
    }
  }

  if (action === 'template.created') {
    const tname = String(row.entityRef ?? '')
    return {
      rowTint: '',
      body: (
        <span className="text-[12px] leading-snug text-[#1A3263]">
          <ActorName row={row} /> created template “<span className="font-medium">{tname}</span>”
        </span>
      ),
    }
  }

  if (action === 'template.deleted') {
    const tname = String(row.entityRef ?? '')
    return {
      rowTint: '',
      body: (
        <span className="text-[12px] leading-snug text-[#1A3263]">
          <ActorName row={row} /> deleted template “<span className="font-medium">{tname}</span>”
        </span>
      ),
    }
  }

  if (action === 'template.used') {
    const tname = String(row.entityRef ?? '')
    return {
      rowTint: '',
      body: (
        <span className="text-[12px] leading-snug text-[#1A3263]">
          <ActorName row={row} /> used template “<span className="font-medium">{tname}</span>”
        </span>
      ),
    }
  }

  if (action === 'comment.added') {
    const t = meta && typeof meta.type === 'string' ? meta.type : 'comment'
    return {
      rowTint: '',
      body: (
        <span className="text-[12px] leading-snug text-[#1A3263]">
          <ActorName row={row} /> commented on
          <EntityChip text={String(row.entityRef ?? '')} />
          <span className="ml-1 inline-flex align-middle">
            <TonePill value={t} kind="commentType" />
          </span>
        </span>
      ),
    }
  }

  if (action === 'comment.edited') {
    return {
      rowTint: '',
      body: (
        <span className="text-[12px] leading-snug text-[#1A3263]">
          <ActorName row={row} /> edited a comment on
          <EntityChip text={String(row.entityRef ?? '')} />
        </span>
      ),
    }
  }

  if (action === 'comment.deleted') {
    return {
      rowTint: '',
      body: (
        <span className="text-[12px] leading-snug text-[#1A3263]">
          <ActorName row={row} /> deleted a comment on
          <EntityChip text={String(row.entityRef ?? '')} />
        </span>
      ),
    }
  }

  if (action === 'user.joined') {
    const role =
      meta && typeof meta.role === 'string' && meta.role.trim() !== ''
        ? String(meta.role).trim()
        : String(row.actorRole ?? 'Tester')
    return {
      rowTint: '',
      body: (
        <span className="text-[12px] leading-snug text-[#1A3263]">
          <span className="font-medium">{publicActorNameFromLog(row.actorName)}</span> joined TestForge as{' '}
          <TonePill value={role} kind="role" />
        </span>
      ),
    }
  }

  if (action === 'user.role_changed') {
    const target = String(row.entityRef ?? 'Member')
    const from = ch && ch.from != null ? String(ch.from) : ''
    const to = ch && ch.to != null ? String(ch.to) : ''
    return {
      rowTint: '',
      body: (
        <span className="text-[12px] leading-snug text-[#1A3263]">
          <ActorName row={row} /> changed{' '}
          <span className="font-medium">{publicActorNameFromLog(target)}</span>&apos;s role{' '}
          <TonePill value={from} kind="role" />
          <span className="mx-1 text-[#8A9BBF]">→</span>
          <TonePill value={to} kind="role" />
        </span>
      ),
    }
  }

  return {
    rowTint: '',
    body: (
      <span className="text-[12px] leading-snug text-[#1A3263]">
        <ActorName row={row} /> <span className="text-[#5A6E9A]">{action || 'performed an action'}</span>
      </span>
    ),
  }
}

/**
 * Skeleton rows while the first snapshot is loading.
 * @returns {import('react').JSX.Element}
 */
function LoadingSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading activity">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="flex gap-3">
          <div className="h-8 w-8 shrink-0 rounded-full bg-[#D6E0F5] animate-pulse" />
          <div className="min-w-0 flex-1 space-y-2 pt-0.5">
            <div className="h-3 w-40 rounded bg-[#D6E0F5] animate-pulse" />
            <div className="h-3 w-[72%] rounded bg-[#EEF2FB] animate-pulse" />
          </div>
          <div className="h-3 w-14 shrink-0 rounded bg-[#EEF2FB] animate-pulse" />
        </div>
      ))}
    </div>
  )
}

/**
 * Activity Log page: filters + grouped timeline.
 * @returns {import('react').JSX.Element}
 */
export default function ActivityLog() {
  const [rawLogs, setRawLogs] = useState(/** @type {Array<Record<string, unknown> & { id: string }>} */ ([]))
  const [loading, setLoading] = useState(true)
  const [members, setMembers] = useState(/** @type {Array<Record<string, unknown>>} */ ([]))

  const [entityFilter, setEntityFilter] = useState(/** @type {EntityFilter} */ ('all'))
  const [actorUid, setActorUid] = useState('all')
  const [range, setRange] = useState(/** @type {'all'|'today'|'7'|'30'} */ ('all'))

  useEffect(() => {
    setLoading(true)
    const unsub = subscribeToActivityLogs(
      (rows) => {
        setRawLogs(Array.isArray(rows) ? rows : [])
        setLoading(false)
      },
      { limitCount: 400 },
    )
    return () => {
      if (typeof unsub === 'function') unsub()
    }
  }, [])

  useEffect(() => {
    const unsub = subscribeToUsers(
      (rows) => setMembers(Array.isArray(rows) ? rows : []),
      () => {
        setMembers([])
      },
    )
    return () => {
      if (typeof unsub === 'function') unsub()
    }
  }, [])

  const actorOptions = useMemo(() => {
    return members
      .map((m) => {
        const uid = String(m.uid ?? m.id ?? '')
        const name = publicTeamMemberName(m)
        const role =
          m.role != null && String(m.role).trim() !== ''
            ? String(m.role).trim() === 'Tester'
              ? 'Member'
              : String(m.role).trim()
            : 'Member'
        return { uid, label: `${name} (${role})` }
      })
      .filter((m) => m.uid)
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [members])

  const filtered = useMemo(() => {
    const now = new Date()
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const start7 = new Date(startToday)
    start7.setDate(start7.getDate() - 6)
    const start30 = new Date(startToday)
    start30.setDate(start30.getDate() - 29)

    return rawLogs.filter((row) => {
      const et = String(row.entityType ?? '')
      if (entityFilter !== 'all' && et !== entityFilter) return false

      if (actorUid !== 'all' && String(row.actorUid ?? '') !== actorUid) return false

      const d = parseTs(String(row.timestamp ?? ''))
      if (!d) return false
      if (range === 'today' && d < startToday) return false
      if (range === '7' && d < start7) return false
      if (range === '30' && d < start30) return false
      return true
    })
  }, [rawLogs, entityFilter, actorUid, range])

  const grouped = useMemo(() => {
    /** @type {Array<{ key: string, label: string, items: typeof filtered }>} */
    const out = []
    for (const row of filtered) {
      const d = parseTs(String(row.timestamp ?? ''))
      if (!d) continue
      const key = dayKey(d)
      const label = separatorLabel(d)
      const last = out[out.length - 1]
      if (!last || last.key !== key) {
        out.push({ key, label, items: [row] })
      } else {
        last.items.push(row)
      }
    }
    return out
  }, [filtered])

  const filtersActive =
    entityFilter !== 'all' || actorUid !== 'all' || range !== 'all'

  const clearFilters = () => {
    setEntityFilter('all')
    setActorUid('all')
    setRange('all')
  }

  return (
    <div className="mx-auto w-full max-w-3xl pb-10">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-[#B0C0E0] pb-3">
        <div>
          <h2 className="text-[16px] font-semibold text-[#1A3263]">Activity Log</h2>
          <p className="mt-0.5 text-[12px] text-[#5A6E9A]">Who changed what, and when.</p>
        </div>
      </div>

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <label className="flex min-w-[10.5rem] flex-1 flex-col gap-1">
            <span className="text-[10px] font-medium uppercase tracking-wide text-[#5A6E9A]">Entity</span>
            <select
              value={entityFilter}
              onChange={(e) => setEntityFilter(/** @type {EntityFilter} */ (e.target.value))}
              className="rounded-lg border-[0.5px] border-[#B0C0E0] bg-white px-2 py-2 text-[12px] text-[#1A3263] outline-none focus:border-[#1A3263] focus:ring-2 focus:ring-[rgba(26,50,99,0.15)]"
            >
              <option value="all">All Activity</option>
              <option value="testCase">Test Cases</option>
              <option value="testRun">Test Runs</option>
              <option value="template">Templates</option>
              <option value="comment">Comments</option>
              <option value="user">Users</option>
              <option value="bulkUpdate">Bulk updates</option>
            </select>
          </label>

          <label className="flex min-w-[10.5rem] flex-1 flex-col gap-1">
            <span className="text-[10px] font-medium uppercase tracking-wide text-[#5A6E9A]">Actor</span>
            <select
              value={actorUid}
              onChange={(e) => setActorUid(e.target.value)}
              className="rounded-lg border-[0.5px] border-[#B0C0E0] bg-white px-2 py-2 text-[12px] text-[#1A3263] outline-none focus:border-[#1A3263] focus:ring-2 focus:ring-[rgba(26,50,99,0.15)]"
            >
              <option value="all">All Members</option>
              {actorOptions.map((m) => (
                <option key={m.uid} value={m.uid}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex min-w-[10.5rem] flex-1 flex-col gap-1">
            <span className="text-[10px] font-medium uppercase tracking-wide text-[#5A6E9A]">Date range</span>
            <select
              value={range}
              onChange={(e) => setRange(/** @type {'all'|'today'|'7'|'30'} */ (e.target.value))}
              className="rounded-lg border-[0.5px] border-[#B0C0E0] bg-white px-2 py-2 text-[12px] text-[#1A3263] outline-none focus:border-[#1A3263] focus:ring-2 focus:ring-[rgba(26,50,99,0.15)]"
            >
              <option value="all">All time</option>
              <option value="today">Today</option>
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
            </select>
          </label>
        </div>

        {filtersActive ? (
          <button
            type="button"
            onClick={clearFilters}
            className="self-start rounded-lg border-[0.5px] border-[#B0C0E0] bg-white px-3 py-2 text-[12px] font-medium text-[#5A6E9A] hover:bg-[#EEF2FB] sm:self-auto"
          >
            Clear filters
          </button>
        ) : null}
      </div>

      {loading ? (
        <LoadingSkeleton />
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#B0C0E0] bg-white px-6 py-16 text-center">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="#B0C0E0"
            strokeWidth="1.8"
            className="mb-3 h-7 w-7"
            aria-hidden
          >
            <path d="M12 8v4l3 3" />
            <circle cx="12" cy="12" r="10" />
          </svg>
          <p className="text-[13px] font-medium text-[#1A3263]">No activity found</p>
          <p className="mt-2 max-w-sm text-[12px] leading-relaxed text-[#5A6E9A]">
            Activity will appear here as your team works on test cases
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map((g) => (
            <section key={g.key} aria-label={g.label}>
              <div className="mb-3 flex items-center gap-3">
                <div className="h-[0.5px] flex-1 bg-[#B0C0E0]" />
                <span
                  className="shrink-0 rounded-[99px] px-[10px] py-[2px] text-[11px] text-[#5A6E9A]"
                  style={{ background: '#EEF2FB' }}
                >
                  {g.label}
                </span>
                <div className="h-[0.5px] flex-1 bg-[#B0C0E0]" />
              </div>

              <div className="space-y-3">
                {g.items.map((row) => {
                  const id = String(row.id ?? '')
                  const initials = initialsFromPublicLabel(publicActorNameFromLog(row.actorName))
                  const ts = parseTs(String(row.timestamp ?? ''))
                  const { rowTint, body } = renderSentence(row)
                  return (
                    <div
                      key={id}
                      className={`flex gap-3 rounded-lg border-[0.5px] border-transparent px-2 py-2 ${
                        rowTint ? `${rowTint} border-[#B0C0E0]/60` : ''
                      }`}
                    >
                      <div
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-medium text-[#1A3263]"
                        style={{ background: '#D6E0F5' }}
                        aria-hidden
                      >
                        {initials}
                      </div>
                      <div className="min-w-0 flex-1">{body}</div>
                      <div className="w-[92px] shrink-0 text-right text-[10px] leading-snug text-[#5A6E9A]">
                        {ts ? formatEntryTime(ts) : ''}
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
