/**
 * @fileoverview Comments thread for a test case: list, filters, add form, edit/delete.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { buildActivityActor, getActorDisplayLabel } from '../utils/memberDisplay.js'
import {
  addComment,
  deleteComment,
  editComment,
  logActivity,
  subscribeToComments,
} from '../firebase/firestore.js'
import { useToast } from './Toast.jsx'

/** @typedef {'all' | 'comment' | 'note' | 'failure' | 'question'} CommentFilter */

const TYPE_OPTIONS = [
  { id: /** @type {const} */ ('comment'), label: 'Comments' },
  { id: /** @type {const} */ ('note'), label: 'Notes' },
  { id: /** @type {const} */ ('failure'), label: 'Failures' },
  { id: /** @type {const} */ ('question'), label: 'Questions' },
]

const POST_TYPES = [
  { id: 'comment', title: 'Comment' },
  { id: 'note', title: 'Note' },
  { id: 'failure', title: 'Failure' },
  { id: 'question', title: 'Question' },
]

const MAX_LEN = 1000

/**
 * @param {string} type
 * @returns {string}
 */
function leftBorderClass(type) {
  if (type === 'note') return 'border-l-[#1D9E75]'
  if (type === 'failure') return 'border-l-[#DC2626]'
  if (type === 'question') return 'border-l-[#7F77DD]'
  return 'border-l-[#4169C4]'
}

/**
 * @param {string} type
 * @returns {{ wrap: string, text: string, label: string }}
 */
function typeBadgeStyle(type) {
  if (type === 'note')
    return { wrap: 'bg-[#E1F5EE]', text: 'text-[#0F6E56]', label: 'Note' }
  if (type === 'failure')
    return { wrap: 'bg-[#FEE2E2]', text: 'text-[#991B1B]', label: 'Failure' }
  if (type === 'question')
    return { wrap: 'bg-[#EEEDFE]', text: 'text-[#534AB7]', label: 'Question' }
  return { wrap: 'bg-[#EEF2FB]', text: 'text-[#1A3263]', label: 'Comment' }
}

/**
 * @param {Object} props
 * @param {string} props.testCaseId - Firestore document id
 * @param {string} props.testCaseRef - Human id e.g. TC-001
 * @param {() => void} [props.onPosted] - After a successful post (e.g. refresh counts)
 * @param {(n: number) => void} [props.onThreadSizeChange] - Emits whenever the thread length changes
 * @param {boolean} [props.hideHeader] - Hide the built-in "Comments" heading row (tabbed panels)
 */
export default function Comments({ testCaseId, testCaseRef, onPosted, onThreadSizeChange, hideHeader = false }) {
  const { user, userProfile, isAdmin } = useAuth()
  const showToast = useToast()

  const [items, setItems] = useState(/** @type {Array<Record<string, unknown>>} */ ([]))
  const [filter, setFilter] = useState(/** @type {CommentFilter} */ ('all'))
  const [draft, setDraft] = useState('')
  const [postType, setPostType] = useState('comment')
  const [posting, setPosting] = useState(false)
  const [editingId, setEditingId] = useState(/** @type {string|null} */ (null))
  const [editDraft, setEditDraft] = useState('')
  const [editingPrevText, setEditingPrevText] = useState('')
  const [menuOpenId, setMenuOpenId] = useState(/** @type {string|null} */ (null))
  const listRef = useRef(/** @type {HTMLDivElement|null} */ (null))

  useEffect(() => {
    const unsub = subscribeToComments(
      testCaseId,
      (rows) => {
        const next = Array.isArray(rows) ? rows : []
        setItems(next)
        if (typeof onThreadSizeChange === 'function') {
          onThreadSizeChange(next.length)
        }
      },
      (msg) => {
        console.error('[Comments] subscribe error:', msg)
        showToast(msg || 'Could not load comments.', 'error')
      },
    )
    return () => {
      if (typeof unsub === 'function') unsub()
    }
  }, [testCaseId, showToast, onThreadSizeChange])

  const filtered = useMemo(() => {
    if (filter === 'all') return items
    return items.filter((c) => String(c.type || 'comment') === filter)
  }, [items, filter])

  const scrollListToBottom = useCallback(() => {
    const el = listRef.current
    if (el) {
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight
      })
    }
  }, [])

  const handlePost = async () => {
    const uid = user?.uid
    if (!uid) {
      showToast('You must be signed in to comment.', 'error')
      return
    }
    const text = draft.trim()
    if (!text) return
    if (text.length > MAX_LEN) {
      showToast(`Comment is too long (max ${MAX_LEN} characters).`, 'error')
      return
    }
    setPosting(true)
    try {
      await addComment(testCaseId, testCaseRef, text, postType, {
        uid,
        displayName: getActorDisplayLabel(userProfile, user),
        email: user?.email,
      })
      const actor = buildActivityActor(userProfile, user)
      if (actor) {
        void logActivity({
          action: 'comment.added',
          entityType: 'comment',
          entityId: testCaseId,
          entityRef: testCaseRef,
          actor,
          metadata: { type: postType },
        })
      }
      setDraft('')
      setPostType('comment')
      showToast('Comment posted.', 'success')
      if (typeof onPosted === 'function') onPosted()
      scrollListToBottom()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to post comment.'
      console.error('[Comments] handlePost:', e)
      showToast(msg, 'error')
    } finally {
      setPosting(false)
    }
  }

  const startEdit = (c) => {
    setMenuOpenId(null)
    setEditingId(String(c.id))
    setEditDraft(String(c.text ?? ''))
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditDraft('')
    setEditingPrevText('')
  }

  const saveEdit = async () => {
    if (!editingId) return
    const text = editDraft.trim()
    if (!text) {
      showToast('Comment cannot be empty.', 'error')
      return
    }
    if (text.length > MAX_LEN) {
      showToast(`Comment is too long (max ${MAX_LEN} characters).`, 'error')
      return
    }
    try {
      await editComment(editingId, text)
      const actor = buildActivityActor(userProfile, user)
      if (actor) {
        void logActivity({
          action: 'comment.edited',
          entityType: 'comment',
          entityId: testCaseId,
          entityRef: testCaseRef,
          actor,
          changes: {
            field: 'text',
            from: editingPrevText,
            to: text,
          },
        })
      }
      setEditingId(null)
      setEditDraft('')
      setEditingPrevText('')
      showToast('Comment updated.', 'success')
      if (typeof onPosted === 'function') onPosted()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to update comment.'
      console.error('[Comments] saveEdit:', e)
      showToast(msg, 'error')
    }
  }

  const confirmDelete = async (id) => {
    setMenuOpenId(null)
    if (!window.confirm('Delete this comment?')) return
    try {
      await deleteComment(id)
      const actor = buildActivityActor(userProfile, user)
      if (actor) {
        void logActivity({
          action: 'comment.deleted',
          entityType: 'comment',
          entityId: testCaseId,
          entityRef: testCaseRef,
          actor,
          metadata: { commentId: id },
        })
      }
      showToast('Comment deleted.', 'neutral')
      if (typeof onPosted === 'function') onPosted()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to delete comment.'
      console.error('[Comments] confirmDelete:', e)
      showToast(msg, 'error')
    }
  }

  useEffect(() => {
    if (!menuOpenId) return
    const close = () => setMenuOpenId(null)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [menuOpenId])

  const uid = user?.uid ?? ''

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {!hideHeader ? (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h3 className="text-[13px] font-semibold text-[#1A3263]">Comments</h3>
          <span className="rounded-full border-[0.5px] border-[#B0C0E0] bg-[#EEF2FB] px-2 py-[1px] text-[10px] font-medium text-[#1A3263]">
            {items.length}
          </span>
        </div>
      ) : null}

      <div className="mb-3 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setFilter('all')}
          className={`rounded-[99px] border-[0.5px] px-[10px] py-1 text-[11px] font-medium transition ${
            filter === 'all'
              ? 'border-transparent bg-[#1A3263] text-white'
              : 'border-[#B0C0E0] bg-[#EEF2FB] text-[#5A6E9A]'
          }`}
        >
          All
        </button>
        {TYPE_OPTIONS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setFilter(t.id)}
            className={`rounded-[99px] border-[0.5px] px-[10px] py-1 text-[11px] font-medium transition ${
              filter === t.id
                ? 'border-transparent bg-[#1A3263] text-white'
                : 'border-[#B0C0E0] bg-[#EEF2FB] text-[#5A6E9A]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div
        ref={listRef}
        className="min-h-[120px] flex-1 space-y-2 overflow-y-auto pr-1"
      >
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="#B0C0E0"
              strokeWidth="1.5"
              className="mb-2 h-6 w-6"
              aria-hidden
            >
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
            </svg>
            <p className="text-[12px] font-medium text-[#1A3263]">No comments yet</p>
            <p className="mt-1 max-w-[14rem] text-[12px] text-[#5A6E9A]">
              Be the first to leave a note
            </p>
          </div>
        ) : (
          filtered.map((c) => {
            const id = String(c.id ?? '')
            const authorUid = String(c.authorUid ?? '')
            const type = String(c.type || 'comment')
            const badge = typeBadgeStyle(type)
            const canUseMenu = uid && (authorUid === uid || isAdmin)
            const canEdit = uid && authorUid === uid
            const isEditing = editingId === id

            return (
              <div
                key={id}
                className={`group relative rounded-lg border-[0.5px] border-[#B0C0E0] bg-white py-2.5 pl-3 pr-2.5 ${leftBorderClass(
                  type,
                )} border-l-[3px]`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-1 gap-2">
                    <div
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#D6E0F5] text-[11px] font-medium text-[#1A3263]"
                      aria-hidden
                    >
                      {String(c.authorInitials || '?').slice(0, 2)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="text-[12px] font-medium text-[#1A3263]">
                          {String(c.authorName || 'Unknown')}
                        </span>
                        <span className="text-[10px] text-[#5A6E9A]">
                          {String(c.createdDate || '').slice(0, 16).replace('T', ' ')}
                        </span>
                        {c.isEdited === true ? (
                          <span className="text-[9px] italic text-[#5A6E9A]">Edited</span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span
                      className={`rounded-[99px] px-[7px] py-[2px] text-[10px] font-medium ${badge.wrap} ${badge.text}`}
                    >
                      {badge.label}
                    </span>
                    {canUseMenu ? (
                      <div className="relative opacity-0 transition group-hover:opacity-100">
                        <button
                          type="button"
                          aria-label="Comment actions"
                          className="rounded p-0.5 text-[#5A6E9A] hover:bg-[#EEF2FB] hover:text-[#1A3263]"
                          onClick={(e) => {
                            e.stopPropagation()
                            setMenuOpenId((prev) => (prev === id ? null : id))
                          }}
                        >
                          <span className="text-base leading-none">⋮</span>
                        </button>
                        {menuOpenId === id ? (
                          <div
                            className="absolute right-0 top-full z-20 mt-1 min-w-[120px] rounded-md border-[0.5px] border-[#B0C0E0] bg-white py-1 shadow-md"
                            onMouseDown={(e) => e.stopPropagation()}
                          >
                            {canEdit ? (
                              <button
                                type="button"
                                className="block w-full px-3 py-1.5 text-left text-[11px] text-[#1A3263] hover:bg-[#EEF2FB]"
                                onClick={() => startEdit(c)}
                              >
                                Edit
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className="block w-full px-3 py-1.5 text-left text-[11px] text-red-600 hover:bg-red-50"
                              onClick={() => void confirmDelete(id)}
                            >
                              Delete
                            </button>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
                {isEditing ? (
                  <div className="mt-2 space-y-2">
                    <textarea
                      value={editDraft}
                      onChange={(e) => setEditDraft(e.target.value)}
                      rows={3}
                      maxLength={MAX_LEN}
                      className="w-full resize-y rounded-lg border-[0.5px] border-[#B0C0E0] p-2 text-[12px] text-[#1A3263] outline-none focus:border-[#1A3263]"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={cancelEdit}
                        className="rounded-md border-[0.5px] border-[#B0C0E0] bg-white px-3 py-1 text-[11px] font-medium text-[#5A6E9A]"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => void saveEdit()}
                        className="rounded-md bg-[#1A3263] px-3 py-1 text-[11px] font-medium text-white hover:bg-[#122247]"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 whitespace-pre-wrap text-[12px] leading-relaxed text-[#1A3263]">
                    {String(c.text ?? '')}
                  </p>
                )}
              </div>
            )
          })
        )}
      </div>

      <div className="mt-auto border-t-[0.5px] border-[#B0C0E0] bg-white px-0 pt-3">
        <div className="mb-2 flex gap-2">
          {POST_TYPES.map((pt) => {
            const sel = postType === pt.id
            const ring =
              pt.id === 'note'
                ? sel
                  ? 'border-[#1D9E75] bg-[#1D9E75] text-white'
                  : ''
                : pt.id === 'failure'
                  ? sel
                    ? 'border-[#DC2626] bg-[#DC2626] text-white'
                    : ''
                  : pt.id === 'question'
                    ? sel
                      ? 'border-[#7F77DD] bg-[#7F77DD] text-white'
                      : ''
                    : sel
                      ? 'border-[#1A3263] bg-[#1A3263] text-white'
                      : ''
            const base =
              'flex h-7 w-7 items-center justify-center rounded-full border-[0.5px] border-[#B0C0E0] transition'
            const idle = 'bg-[#EEF2FB] text-[#5A6E9A]'
            return (
              <button
                key={pt.id}
                type="button"
                title={pt.title}
                aria-label={pt.title}
                onClick={() => setPostType(pt.id)}
                className={`${base} ${sel ? ring : idle}`}
              >
                {pt.id === 'comment' ? (
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>
                    <path d="M4 4h16v10H7l-3 3V4z" />
                  </svg>
                ) : null}
                {pt.id === 'note' ? (
                  <svg
                    viewBox="0 0 24 24"
                    className="h-3.5 w-3.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden
                  >
                    <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
                    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
                  </svg>
                ) : null}
                {pt.id === 'failure' ? (
                  <svg
                    viewBox="0 0 24 24"
                    className="h-3.5 w-3.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden
                  >
                    <circle cx="12" cy="12" r="9" />
                    <path d="M15 9l-6 6M9 9l6 6" />
                  </svg>
                ) : null}
                {pt.id === 'question' ? (
                  <svg
                    viewBox="0 0 24 24"
                    className="h-3.5 w-3.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden
                  >
                    <path d="M12 18h.01M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" />
                  </svg>
                ) : null}
              </button>
            )
          })}
        </div>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Write a comment..."
          rows={3}
          maxLength={MAX_LEN}
          className="w-full resize-y rounded-lg border-[0.5px] border-[#B0C0E0] p-2 text-[12px] text-[#1A3263] outline-none focus:border-[#1A3263]"
        />
        <div className="mt-1 flex items-center justify-between">
          <span />
          <span
            className={`text-[10px] tabular-nums ${
              draft.length > 800 ? 'text-[#DC2626]' : 'text-[#5A6E9A]'
            }`}
          >
            {draft.length}/{MAX_LEN}
          </span>
        </div>
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            disabled={posting || draft.trim().length === 0}
            onClick={() => void handlePost()}
            className="rounded-md bg-[#1A3263] px-[14px] py-1.5 text-[12px] font-medium text-white transition hover:bg-[#122247] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {posting ? (
              <span className="inline-flex items-center gap-2">
                <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Posting…
              </span>
            ) : (
              'Post Comment'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
