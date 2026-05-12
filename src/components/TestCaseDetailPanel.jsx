/**
 * @fileoverview Slide-out test case detail panel with quick metadata, comments, and history.
 */

import { useEffect, useState } from 'react'
import StatusBadge from './StatusBadge.jsx'
import Comments from './Comments.jsx'
import { renderSentence } from './ActivityLog.jsx'
import { subscribeToEntityLogs } from '../firebase/firestore.js'

/**
 * @param {Record<string, unknown>|null|undefined} tc
 * @returns {string}
 */
function displayTitle(tc) {
  if (!tc) return ''
  const t = tc.title != null && String(tc.title).trim() !== '' ? String(tc.title) : ''
  if (t) return t
  const tt = tc.testTitle != null && String(tc.testTitle).trim() !== '' ? String(tc.testTitle) : ''
  return tt || 'Untitled'
}

/**
 * @param {Record<string, unknown>|null|undefined} tc
 * @returns {string}
 */
function humanRef(tc) {
  if (!tc) return ''
  const id = tc.testCaseId != null ? String(tc.testCaseId) : ''
  return id || ''
}

/**
 * Slide-out panel from the right showing test case summary, {@link Comments}, and activity history.
 *
 * @param {Object} props
 * @param {Record<string, unknown>|null} props.testCase - Selected row (includes Firestore `id`)
 * @param {() => void} props.onClose - Clears selection (e.g. sets `selectedTestCase` to null)
 * @param {() => void} [props.onCommentPosted] - Refresh aggregate counts in the parent table
 */
export default function TestCaseDetailPanel({ testCase, onClose, onCommentPosted }) {
  const docId = testCase?.id != null ? String(testCase.id) : ''
  const ref = humanRef(testCase)
  const title = displayTitle(testCase)

  const [panelTab, setPanelTab] = useState(/** @type {'comments'|'history'} */ ('comments'))
  const [history, setHistory] = useState(/** @type {Array<Record<string, unknown> & { id: string }>} */ ([]))
  const [commentCount, setCommentCount] = useState(0)

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    setPanelTab('comments')
    setHistory([])
    setCommentCount(0)
  }, [docId])

  useEffect(() => {
    if (!docId) {
      setHistory([])
      return () => {}
    }
    const unsub = subscribeToEntityLogs(docId, (rows) => {
      setHistory(Array.isArray(rows) ? rows : [])
    })
    return () => {
      if (typeof unsub === 'function') unsub()
    }
  }, [docId])

  if (!testCase || !docId) return null

  return (
    <aside
      role="dialog"
      aria-modal="true"
      aria-labelledby="testcase-detail-title"
      className="fixed inset-y-0 right-0 z-40 flex h-full w-full max-w-[420px] translate-x-0 flex-col border-l-[0.5px] border-[#B0C0E0] bg-white shadow-xl transition-transform duration-[250ms] ease-out"
    >
      <header className="flex h-12 shrink-0 items-center justify-between bg-[#1A3263] px-4 text-white">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="shrink-0 rounded-[99px] bg-white/20 px-2 py-[2px] font-mono text-[11px] font-medium">
            {ref || '—'}
          </span>
          <h2
            id="testcase-detail-title"
            className="min-w-0 truncate text-[13px] font-medium leading-tight"
            title={title}
          >
            {title}
          </h2>
        </div>
        <button
          type="button"
          aria-label="Close panel"
          onClick={onClose}
          className="ml-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-white hover:bg-white/15"
        >
          <svg
            viewBox="0 0 24 24"
            width={24}
            height={24}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col px-4 pt-4">
        <section aria-label="Test case summary" className="mb-4 shrink-0">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-2">
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-[10px] font-medium uppercase tracking-wide text-[#5A6E9A]">
                Status
              </span>
              <StatusBadge value={testCase?.status} type="status" />
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-[10px] font-medium uppercase tracking-wide text-[#5A6E9A]">
                Priority
              </span>
              <StatusBadge value={testCase?.priority} type="priority" />
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-[10px] font-medium uppercase tracking-wide text-[#5A6E9A]">
                Severity
              </span>
              <StatusBadge value={testCase?.severity} type="severity" />
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-[10px] font-medium uppercase tracking-wide text-[#5A6E9A]">
                Test type
              </span>
              <span className="inline-flex w-fit max-w-full truncate rounded-full border-[0.5px] border-[#B0C0E0] bg-[#EEF2FB] px-2 py-0.5 text-[11px] font-medium text-[#1A3263]">
                {testCase?.testType != null && String(testCase.testType).trim() !== ''
                  ? String(testCase.testType)
                  : '—'}
              </span>
            </div>
          </div>
        </section>

        <div className="mb-2 flex border-b border-[#B0C0E0]">
          <button
            type="button"
            onClick={() => setPanelTab('comments')}
            className={`relative flex-1 pb-2 text-[12px] font-medium transition ${
              panelTab === 'comments' ? 'text-[#1A3263]' : 'text-[#5A6E9A] hover:text-[#1A3263]'
            }`}
          >
            Comments{' '}
            <span className="rounded-full border-[0.5px] border-[#B0C0E0] bg-[#EEF2FB] px-1.5 py-[1px] text-[10px] font-medium text-[#1A3263]">
              {commentCount}
            </span>
            {panelTab === 'comments' ? (
              <span className="absolute bottom-0 left-0 right-0 h-[2px] rounded-full bg-[#1A3263]" />
            ) : null}
          </button>
          <button
            type="button"
            onClick={() => setPanelTab('history')}
            className={`relative flex-1 pb-2 text-[12px] font-medium transition ${
              panelTab === 'history' ? 'text-[#1A3263]' : 'text-[#5A6E9A] hover:text-[#1A3263]'
            }`}
          >
            History{' '}
            <span className="rounded-full border-[0.5px] border-[#B0C0E0] bg-[#EEF2FB] px-1.5 py-[1px] text-[10px] font-medium text-[#1A3263]">
              {history.length}
            </span>
            {panelTab === 'history' ? (
              <span className="absolute bottom-0 left-0 right-0 h-[2px] rounded-full bg-[#1A3263]" />
            ) : null}
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          {panelTab === 'comments' ? (
            <Comments
              testCaseId={docId}
              testCaseRef={ref}
              onPosted={typeof onCommentPosted === 'function' ? onCommentPosted : undefined}
              hideHeader
              onThreadSizeChange={setCommentCount}
            />
          ) : (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-[160px] flex-1 space-y-3 overflow-y-auto pr-1">
                {history.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-center">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#B0C0E0"
                      strokeWidth="1.8"
                      className="mb-2 h-6 w-6"
                      aria-hidden
                    >
                      <path d="M12 8v4l3 3" />
                      <circle cx="12" cy="12" r="10" />
                    </svg>
                    <p className="text-[12px] font-medium text-[#1A3263]">No history yet</p>
                    <p className="mt-1 max-w-[14rem] text-[12px] text-[#5A6E9A]">
                      Changes to this test case will show up here.
                    </p>
                  </div>
                ) : (
                  history.map((row) => {
                    const id = String(row.id ?? '')
                    const { body } = renderSentence(row)
                    const ts = typeof row.timestamp === 'string' ? row.timestamp : ''
                    const timeShort =
                      ts.length >= 16
                        ? `${ts.slice(0, 10)} ${ts.slice(11, 16)}`
                        : ts.replace('T', ' ')
                    return (
                      <div key={id} className="flex gap-2">
                        <div
                          className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#4169C4]"
                          aria-hidden
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-[11px] leading-snug text-[#1A3263]">{body}</div>
                          <div className="mt-1 text-[10px] text-[#5A6E9A]">{timeShort}</div>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}
