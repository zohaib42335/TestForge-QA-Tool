/**
 * @fileoverview Shared sub-components for AIGeneratorModal.
 * Kept separate so the main modal file stays under token limits.
 */

import { useState } from 'react'

// ---------------------------------------------------------------------------
// Design tokens
// ---------------------------------------------------------------------------
export const inputClass =
  'bg-white border-[0.5px] border-[#B0C0E0] text-[#1A3263] rounded-lg px-3 py-2 w-full focus:border-[#1A3263] focus:ring-2 focus:ring-[rgba(26,50,99,0.15)] outline-none transition placeholder:text-[#8A9BBF] hover:border-[#8A9BBF]'
export const labelClass = 'block text-sm text-[#5A6E9A] mb-1'
export const primaryBtnClass =
  'px-5 py-2.5 rounded-lg bg-[#1A3263] hover:bg-[#122247] text-white text-sm font-semibold transition disabled:bg-[#B0C0E0] disabled:text-[#8A9BBF] disabled:cursor-not-allowed'
export const ghostBtnClass =
  'px-5 py-2.5 rounded-lg bg-white border-[0.5px] border-[#B0C0E0] text-[#1A3263] text-sm font-semibold hover:bg-[#EEF2FB] hover:border-[#4169C4] transition disabled:opacity-50 disabled:cursor-not-allowed'

// ---------------------------------------------------------------------------
// Priority badge colour
// ---------------------------------------------------------------------------
/** @param {'Critical'|'High'|'Medium'|'Low'} p */
export function priorityClass(p) {
  if (p === 'Critical') return 'bg-red-100 text-red-700 border border-red-200'
  if (p === 'High')     return 'bg-orange-100 text-orange-700 border border-orange-200'
  if (p === 'Medium')   return 'bg-[#D6E0F5] text-[#1A3263] border border-[#B0C0E0]'
  return 'bg-gray-100 text-gray-600 border border-gray-200'
}

// ---------------------------------------------------------------------------
// Time-ago helper (no external deps)
// ---------------------------------------------------------------------------
/** @param {import('firebase/firestore').Timestamp|null|undefined} ts */
export function timeAgo(ts) {
  if (!ts) return '—'
  const date = ts.toDate ? ts.toDate() : new Date(ts)
  const secs = Math.floor((Date.now() - date.getTime()) / 1000)
  if (secs < 60)  return 'just now'
  const mins = Math.floor(secs / 60)
  if (mins < 60)  return `${mins} min ago`
  const hrs  = Math.floor(mins / 60)
  if (hrs  < 24)  return `${hrs} hr ago`
  const days = Math.floor(hrs  / 24)
  return `${days} day${days > 1 ? 's' : ''} ago`
}

// ---------------------------------------------------------------------------
// Spinner
// ---------------------------------------------------------------------------
export function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// ErrorBanner
// ---------------------------------------------------------------------------
/** @param {{ message: string }} props */
export function ErrorBanner({ message }) {
  return (
    <div
      className="rounded-lg px-4 py-3 text-sm border border-red-200 border-l-4 border-l-red-500 bg-red-50 text-red-800"
      role="alert"
    >
      {message}
    </div>
  )
}

// ---------------------------------------------------------------------------
// SkeletonCard (generation loading state)
// ---------------------------------------------------------------------------
export function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl border border-[#B0C0E0] shadow-sm p-4 animate-pulse space-y-3">
      <div className="flex items-start gap-3">
        <div className="h-4 bg-[#D6E0F5] rounded w-2/3" />
        <div className="ml-auto flex gap-2">
          <div className="h-5 w-16 bg-[#D6E0F5] rounded-full" />
          <div className="h-5 w-20 bg-[#EEF2FB] rounded-full" />
        </div>
      </div>
      <div className="h-3 bg-[#EEF2FB] rounded w-full" />
      <div className="h-3 bg-[#EEF2FB] rounded w-5/6" />
      <div className="flex gap-2">
        <div className="h-4 w-12 bg-[#EEF2FB] rounded-full" />
        <div className="h-4 w-16 bg-[#EEF2FB] rounded-full" />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// HistorySkeletonRow
// ---------------------------------------------------------------------------
export function HistorySkeletonRow() {
  return (
    <div className="bg-white rounded-xl border border-[#B0C0E0] p-4 animate-pulse space-y-2">
      <div className="h-3 bg-[#D6E0F5] rounded w-3/4" />
      <div className="h-3 bg-[#EEF2FB] rounded w-1/2" />
      <div className="flex gap-3 mt-1">
        <div className="h-4 w-24 bg-[#EEF2FB] rounded" />
        <div className="h-4 w-16 bg-[#EEF2FB] rounded" />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// TestCaseCard (preview view)
// ---------------------------------------------------------------------------
/**
 * @param {{ tc: import('../hooks/useAIGenerator.js').GeneratedCase, selected: boolean, onToggle: () => void }} props
 */
export function TestCaseCard({ tc, selected, onToggle }) {
  const [stepsOpen, setStepsOpen] = useState(false)
  return (
    <div className={`bg-white rounded-xl border shadow-sm transition ${selected ? 'border-[#4169C4] ring-1 ring-[#4169C4]/30' : 'border-[#B0C0E0]'}`}>
      <div className="flex items-start gap-3 p-4 pb-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          id={`tc-select-${tc._localId}`}
          className="mt-0.5 shrink-0 w-4 h-4 rounded border-[#B0C0E0] accent-[#1A3263] cursor-pointer"
          aria-label={`Select "${tc.title}"`}
        />
        <label htmlFor={`tc-select-${tc._localId}`} className="flex-1 text-sm font-semibold text-[#1A3263] leading-snug cursor-pointer">
          {tc.title}
        </label>
        <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
          <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${priorityClass(tc.priority)}`}>{tc.priority}</span>
          <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#EEF2FB] text-[#5A6E9A] border border-[#D6E0F5]">{tc.type}</span>
        </div>
      </div>
      <div className="px-4 pb-4 space-y-3">
        {tc.tags && tc.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {tc.tags.map((tag) => (
              <span key={tag} className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#EEF2FB] text-[#8A9BBF] border border-[#D6E0F5]">{tag}</span>
            ))}
          </div>
        )}
        {tc.steps && tc.steps.length > 0 && (
          <div>
            <button type="button" onClick={() => setStepsOpen((o) => !o)}
              className="flex items-center gap-1.5 text-xs font-semibold text-[#4169C4] hover:text-[#1A3263] transition"
              aria-expanded={stepsOpen}>
              <span className={`inline-block transition-transform duration-200 ${stepsOpen ? 'rotate-90' : ''}`} aria-hidden>›</span>
              Steps ({tc.steps.length})
            </button>
            {stepsOpen && (
              <ol className="mt-2 space-y-1 pl-4">
                {tc.steps.map((step, i) => (
                  <li key={i} className="text-xs text-[#5A6E9A] leading-relaxed">
                    <span className="font-semibold text-[#1A3263] mr-1">{i + 1}.</span>{step}
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
        <div>
          <p className="text-[11px] uppercase tracking-widest text-[#8A9BBF] font-mono mb-1">Expected Result</p>
          <p className="text-xs text-[#1A3263] leading-relaxed">{tc.expectedResult}</p>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// TemplatesDropdown — custom select with per-item delete
// ---------------------------------------------------------------------------
/**
 * @param {{
 *   templates: import('../hooks/useAITemplates.js').AIPromptTemplate[],
 *   canManage?: boolean,
 *   onApply: (t: any) => void,
 *   onDelete: (id: string) => void,
 *   loading: boolean,
 * }} props
 */
export function TemplatesDropdown({ templates, canManage = true, onApply, onDelete, loading }) {
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState('Load a saved template…')

  const apply = (t) => {
    setLabel(t.name)
    setOpen(false)
    onApply(t)
  }

  const handleDelete = (e, id) => {
    e.stopPropagation()
    onDelete(id)
    setLabel('Load a saved template…')
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between bg-white border-[0.5px] border-[#B0C0E0] text-[#1A3263] rounded-lg px-3 py-2 text-sm hover:border-[#8A9BBF] transition"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={label === 'Load a saved template…' ? 'text-[#8A9BBF]' : ''}>{label}</span>
        <svg className={`h-4 w-4 text-[#8A9BBF] transition-transform ${open ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-[#B0C0E0] rounded-lg shadow-lg max-h-48 overflow-y-auto" role="listbox">
          {loading ? (
            <p className="px-3 py-2 text-xs text-[#5A6E9A]">Loading…</p>
          ) : templates.length === 0 ? (
            <p className="px-3 py-2 text-xs text-[#8A9BBF] italic">No templates saved yet.</p>
          ) : (
            templates.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between px-3 py-2 hover:bg-[#EEF2FB] cursor-pointer group"
                role="option"
                onClick={() => apply(t)}
              >
                <span className="text-sm text-[#1A3263] truncate flex-1">{t.name}</span>
                {canManage ? (
                  <button
                    type="button"
                    onClick={(e) => handleDelete(e, t.id)}
                    className="shrink-0 ml-2 opacity-0 group-hover:opacity-100 text-[#8A9BBF] hover:text-red-500 transition"
                    aria-label={`Delete template "${t.name}"`}
                  >
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2" />
                    </svg>
                  </button>
                ) : null}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// HistoryList
// ---------------------------------------------------------------------------
/**
 * @param {{
 *   history: import('../hooks/useAIHistory.js').AIHistoryItem[],
 *   loading: boolean,
 *   onRerun: (item: any) => void,
 * }} props
 */
export function HistoryList({ history, loading, onRerun }) {
  if (loading) {
    return (
      <div className="space-y-3">
        <HistorySkeletonRow />
        <HistorySkeletonRow />
        <HistorySkeletonRow />
      </div>
    )
  }

  if (history.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-14 text-center">
        <svg className="h-9 w-9 text-[#B0C0E0] mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 3" />
        </svg>
        <p className="text-sm font-medium text-[#1A3263]">No generation history yet</p>
        <p className="text-xs text-[#8A9BBF] mt-1">Generated test cases will appear here.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {history.map((item) => (
        <div key={item.id} className="bg-white rounded-xl border border-[#B0C0E0] shadow-sm p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm text-[#1A3263] leading-snug">
                {item.featureDescription}
                {item.featureDescriptionFull && item.featureDescriptionFull.length > 80 && (
                  <span className="text-[#8A9BBF]">…</span>
                )}
              </p>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                {item.moduleName && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#EEF2FB] text-[#5A6E9A] border border-[#D6E0F5]">
                    {item.moduleName}
                  </span>
                )}
                <span className="text-[10px] text-[#8A9BBF]">
                  {item.generatedCount} generated · {item.savedCount} saved
                </span>
                <span className="text-[10px] text-[#8A9BBF]">{timeAgo(item.createdAt)}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onRerun(item)}
              className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#EEF2FB] text-[#1A3263] border border-[#D6E0F5] hover:bg-[#D6E0F5] transition"
            >
              ↩ Re-run
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
