/**
 * @fileoverview Bug Detail view — full two-column layout for a single bug.
 * Renders inline-editable fields with auto-save on blur (500ms debounce).
 *
 * @param {Object} props
 * @param {string} props.projectId
 * @param {string} props.bugDocId  - Firestore document ID
 * @param {() => void} props.onBack
 * @param {() => void} [props.onDeleted]
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useBugs } from '../hooks/useBugs.js'
import { useAuth } from '../context/AuthContext.jsx'
import { useJiraIntegration } from '../hooks/useJiraIntegration.js'
import { useRole } from '../hooks/useRole'
import { useToast } from './Toast.jsx'
import {
  BUG_ENVIRONMENTS,
  BUG_SEVERITIES,
  BUG_STATUSES,
  SEVERITY_COLORS,
  STATUS_COLORS,
} from '../constants/bugConstants.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** @param {import('firebase/firestore').Timestamp|null|undefined} ts */
function formatTimestamp(ts) {
  if (!ts) return '—'
  try {
    const d = typeof ts.toDate === 'function' ? ts.toDate() : new Date(ts)
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  } catch { return '—' }
}

/** @param {import('firebase/firestore').Timestamp|null|undefined} ts */
function timeAgo(ts) {
  if (!ts) return ''
  try {
    const d = typeof ts.toDate === 'function' ? ts.toDate() : new Date(ts)
    const diffMs = Date.now() - d.getTime()
    const mins = Math.floor(diffMs / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    return `${Math.floor(hrs / 24)}d ago`
  } catch { return '' }
}

function genLocalId() { return Math.random().toString(36).slice(2, 9) }

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** @param {{ label: string, children: import('react').ReactNode }} props */
function SidebarField({ label, children }) {
  return (
    <div>
      <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-[#5A6E9A]">{label}</div>
      {children}
    </div>
  )
}

/** @param {{ value: string, options: string[], onChange: (v: string) => void }} props */
function InlineSelect({ value, options, onChange }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-[#B0C0E0] bg-white px-2.5 py-1.5 text-[12px] text-[#1A3263] outline-none transition focus:border-[#1A3263] focus:ring-1 focus:ring-[#1A3263]/20"
    >
      {options.map((o) => <option key={o}>{o}</option>)}
    </select>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function BugDetail({ projectId, bugDocId, onBack, onDeleted }) {
  const { fetchBugById, updateBug, deleteBug, addComment, fetchComments } = useBugs()
  const { user } = useAuth()
  const { hasPermission } = useRole()
  const canEditBug = hasPermission('bug_edit')
  const canDeleteBug = hasPermission('bug_delete')
  const canChangeStatus = hasPermission('bug_status_change')
  const showToast = useToast()
  const { config: jiraConfig, fetchConfig: fetchJiraConfig, createIssue, syncStatus } = useJiraIntegration()

  /** @type {[import('../types/bug.types.js').Bug|null, any]} */
  const [bug, setBug] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(/** @type {string|null} */ (null))

  /** @type {[import('../types/bug.types.js').BugComment[], any]} */
  const [comments, setComments] = useState([])
  const [commentText, setCommentText] = useState('')
  const [addingComment, setAddingComment] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [jiraPushing, setJiraPushing] = useState(false)
  const [jiraSyncing, setJiraSyncing] = useState(false)

  // Editable state mirrors
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [steps, setSteps] = useState(/** @type {Array<{id:string,text:string}>} */ ([]))
  const [tags, setTags] = useState(/** @type {string[]} */ ([]))
  const [tagInput, setTagInput] = useState('')
  const [saveIndicator, setSaveIndicator] = useState(/** @type {'idle'|'saving'|'saved'} */ ('idle'))

  const debounceRef = useRef(/** @type {ReturnType<typeof setTimeout>|null} */ (null))

  // -------------------------------------------------------------------------
  // Load bug
  // -------------------------------------------------------------------------

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    Promise.all([
      fetchBugById(projectId, bugDocId),
      fetchComments(projectId, bugDocId),
    ]).then(([bugData, commentData]) => {
      if (cancelled) return
      if (!bugData) { setError('Bug not found.'); setLoading(false); return }
      setBug(bugData)
      setTitle(bugData.title ?? '')
      setDescription(bugData.description ?? '')
      setSteps((bugData.stepsToReproduce ?? []).map((t) => ({ id: genLocalId(), text: t })))
      setTags(bugData.tags ?? [])
      setComments(commentData)
      setLoading(false)
    }).catch((err) => {
      if (!cancelled) { setError(err.message); setLoading(false) }
    })
    return () => { cancelled = true }
  }, [projectId, bugDocId, fetchBugById, fetchComments])

  // Load JIRA config
  useEffect(() => {
    if (projectId) void fetchJiraConfig(projectId)
  }, [projectId, fetchJiraConfig])

  // -------------------------------------------------------------------------
  // Debounced auto-save
  // -------------------------------------------------------------------------

  const scheduleAutoSave = useCallback((changes) => {
    if (!canEditBug) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    setSaveIndicator('saving')
    debounceRef.current = setTimeout(async () => {
      try {
        await updateBug(projectId, bugDocId, changes)
        setSaveIndicator('saved')
        setTimeout(() => setSaveIndicator('idle'), 1500)
      } catch { setSaveIndicator('idle') }
    }, 500)
  }, [projectId, bugDocId, updateBug])

  const handleTitleBlur = useCallback(() => {
    if (title.trim() && title !== bug?.title) scheduleAutoSave({ title: title.trim() })
  }, [title, bug, scheduleAutoSave])

  const handleDescriptionBlur = useCallback(() => {
    if (description !== bug?.description) scheduleAutoSave({ description })
  }, [description, bug, scheduleAutoSave])

  const handleStepsBlur = useCallback(() => {
    const newSteps = steps.map((s) => s.text).filter(Boolean)
    scheduleAutoSave({ stepsToReproduce: newSteps })
  }, [steps, scheduleAutoSave])

  const handleSidebarChange = useCallback((field, value) => {
    if (!canEditBug) return
    setBug((prev) => prev ? { ...prev, [field]: value } : prev)
    scheduleAutoSave({ [field]: value })
  }, [scheduleAutoSave])

  // -------------------------------------------------------------------------
  // Steps management
  // -------------------------------------------------------------------------

  const updateStep = (id, text) => setSteps((prev) => prev.map((s) => s.id === id ? { ...s, text } : s))
  const addStep = () => setSteps((prev) => [...prev, { id: genLocalId(), text: '' }])
  const removeStep = (id) => {
    const next = steps.filter((s) => s.id !== id)
    const final = next.length > 0 ? next : [{ id: genLocalId(), text: '' }]
    setSteps(final)
    scheduleAutoSave({ stepsToReproduce: final.map((s) => s.text).filter(Boolean) })
  }

  // -------------------------------------------------------------------------
  // Tags
  // -------------------------------------------------------------------------

  const addTag = () => {
    const t = tagInput.trim()
    if (!t || tags.includes(t)) { setTagInput(''); return }
    const next = [...tags, t]
    setTags(next)
    setTagInput('')
    scheduleAutoSave({ tags: next })
  }

  const removeTag = (tag) => {
    const next = tags.filter((t) => t !== tag)
    setTags(next)
    scheduleAutoSave({ tags: next })
  }

  // -------------------------------------------------------------------------
  // Comments
  // -------------------------------------------------------------------------

  const handleAddComment = useCallback(async () => {
    if (!commentText.trim() || !user?.uid) return
    setAddingComment(true)
    try {
      await addComment(projectId, bugDocId, commentText.trim(), user.uid)
      setCommentText('')
      const updated = await fetchComments(projectId, bugDocId)
      setComments(updated)
    } catch { /* silent */ }
    finally { setAddingComment(false) }
  }, [commentText, user, addComment, fetchComments, projectId, bugDocId])

  // -------------------------------------------------------------------------
  // Delete
  // -------------------------------------------------------------------------

  const handleDelete = useCallback(async () => {
    if (!canDeleteBug) return
    if (!window.confirm('Delete this bug? This cannot be undone.')) return
    setDeleting(true)
    try {
      await deleteBug(projectId, bugDocId)
      onDeleted?.()
      onBack()
    } catch { setDeleting(false) }
  }, [projectId, bugDocId, deleteBug, onDeleted, onBack])

  // -------------------------------------------------------------------------
  // JIRA handlers
  // -------------------------------------------------------------------------

  const handlePushToJira = useCallback(async () => {
    if (!canEditBug) return
    setJiraPushing(true)
    try {
      const result = await createIssue(projectId, bugDocId)
      setBug((prev) => prev ? { ...prev, jiraIssueKey: result.jiraIssueKey, jiraIssueUrl: result.jiraIssueUrl } : prev)
      showToast(`JIRA issue ${result.jiraIssueKey} created`, 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to push to JIRA', 'error')
    } finally {
      setJiraPushing(false)
    }
  }, [projectId, bugDocId, createIssue, showToast])

  const handleSyncJiraStatus = useCallback(async () => {
    setJiraSyncing(true)
    try {
      const result = await syncStatus(projectId, bugDocId)
      setBug((prev) => prev ? { ...prev, status: result.testForgeStatus } : prev)
      showToast(`Status synced: ${result.jiraStatus} → ${result.testForgeStatus}`, 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to sync from JIRA', 'error')
    } finally {
      setJiraSyncing(false)
    }
  }, [projectId, bugDocId, syncStatus, showToast])

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex min-h-[300px] items-center justify-center">
        <span className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-[#1A3263] border-t-transparent" aria-hidden />
      </div>
    )
  }

  if (error || !bug) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        {error ?? 'Bug not found.'}
      </div>
    )
  }

  const severityColors = SEVERITY_COLORS[bug.severity] ?? SEVERITY_COLORS.Medium
  const statusColors   = STATUS_COLORS[bug.status]   ?? STATUS_COLORS.Open

  return (
    <div className="flex flex-col gap-4">
      {/* Back + save indicator */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-[13px] text-[#5A6E9A] transition hover:text-[#1A3263]"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden>
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
          Back to Bugs
        </button>
        {saveIndicator === 'saving' && <span className="text-[11px] text-[#5A6E9A]">Saving…</span>}
        {saveIndicator === 'saved'  && <span className="text-[11px] text-green-600">Saved ✓</span>}
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        {/* ================================================================ */}
        {/* LEFT COLUMN — main content */}
        {/* ================================================================ */}
        <div className="flex flex-col gap-4 lg:w-[70%]">
          {/* Bug ID + Title */}
          <div className="rounded-[10px] border border-[#B0C0E0] bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <span className="font-mono text-[11px] font-semibold text-[#4169C4] bg-[#EEF2FB] rounded px-1.5 py-0.5">
                {bug.bugId}
              </span>
              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusColors.bg} ${statusColors.text} ${statusColors.border}`}>
                {bug.status}
              </span>
              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${severityColors.bg} ${severityColors.text} ${severityColors.border}`}>
                {bug.severity}
              </span>
            </div>
            {canEditBug ? (
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={handleTitleBlur}
                className="w-full rounded-lg border border-transparent bg-transparent px-1 py-0.5 text-[18px] font-semibold text-[#1A3263] outline-none transition hover:border-[#B0C0E0] focus:border-[#1A3263] focus:ring-1 focus:ring-[#1A3263]/20"
                aria-label="Bug title"
              />
            ) : (
              <p className="px-1 py-0.5 text-[18px] font-semibold text-[#1A3263]">{title || '—'}</p>
            )}
          </div>

          {/* Description */}
          <div className="rounded-[10px] border border-[#B0C0E0] bg-white p-4 shadow-sm">
            <div className="mb-2 text-[12px] font-medium text-[#1A3263]">Description</div>
            {canEditBug ? (
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onBlur={handleDescriptionBlur}
                rows={4}
                placeholder="Describe the bug in detail…"
                className="w-full rounded-lg border border-transparent bg-[#EEF2FB]/50 px-3 py-2 text-[13px] text-[#1A3263] placeholder-[#9CA3AF] outline-none transition hover:border-[#B0C0E0] focus:border-[#1A3263] focus:ring-1 focus:ring-[#1A3263]/20 resize-none"
              />
            ) : (
              <p className="rounded-lg bg-[#EEF2FB]/50 px-3 py-2 text-[13px] text-[#1A3263]">{description || '—'}</p>
            )}
          </div>

          {/* Steps to Reproduce */}
          <div className="rounded-[10px] border border-[#B0C0E0] bg-white p-4 shadow-sm">
            <div className="mb-2 text-[12px] font-medium text-[#1A3263]">Steps to Reproduce</div>
            <div className="space-y-1.5">
              {steps.map((step, idx) => (
                <div key={step.id} className="flex items-center gap-2">
                  <span className="shrink-0 w-5 text-right text-[11px] font-medium text-[#5A6E9A]">{idx + 1}.</span>
                  {canEditBug ? (
                    <>
                      <input
                        type="text"
                        value={step.text}
                        onChange={(e) => updateStep(step.id, e.target.value)}
                        onBlur={handleStepsBlur}
                        placeholder={`Step ${idx + 1}`}
                        className="flex-1 rounded-lg border border-[#B0C0E0] bg-white px-3 py-1.5 text-[13px] text-[#1A3263] placeholder-[#9CA3AF] outline-none transition focus:border-[#1A3263] focus:ring-1 focus:ring-[#1A3263]/20"
                      />
                      <button type="button" onClick={() => removeStep(step.id)} className="flex h-7 w-7 items-center justify-center rounded-lg text-[#9CA3AF] transition hover:bg-red-50 hover:text-red-500" aria-label="Remove step">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5" aria-hidden><path d="M18 6L6 18M6 6l12 12" /></svg>
                      </button>
                    </>
                  ) : (
                    <p className="flex-1 rounded-lg bg-[#EEF2FB]/50 px-3 py-1.5 text-[13px] text-[#1A3263]">{step.text || '—'}</p>
                  )}
                </div>
              ))}
              {canEditBug ? (
                <button type="button" onClick={addStep} className="mt-1 flex items-center gap-1.5 text-[12px] text-[#4169C4] transition hover:text-[#1A3263]">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
                  Add step
                </button>
              ) : null}
            </div>
          </div>

          {/* Linked Test Cases */}
          {(bug.linkedTestCaseIds?.length ?? 0) > 0 && (
            <div className="rounded-[10px] border border-[#B0C0E0] bg-white p-4 shadow-sm">
              <div className="mb-2 text-[12px] font-medium text-[#1A3263]">Linked Test Cases</div>
              <div className="flex flex-wrap gap-2">
                {bug.linkedTestCaseIds.map((tcId) => (
                  <span
                    key={tcId}
                    className="inline-flex items-center rounded-full border border-[#B0C0E0] bg-[#EEF2FB] px-2.5 py-1 font-mono text-[11px] text-[#4169C4]"
                  >
                    {tcId}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Comments */}
          <div className="rounded-[10px] border border-[#B0C0E0] bg-white p-4 shadow-sm">
            <div className="mb-3 text-[12px] font-medium text-[#1A3263]">
              Comments {comments.length > 0 && <span className="ml-1 text-[#5A6E9A]">({comments.length})</span>}
            </div>
            {comments.length === 0 ? (
              <div className="py-4 text-center text-[12px] text-[#5A6E9A]">No comments yet — be the first!</div>
            ) : (
              <div className="mb-4 space-y-3">
                {comments.map((c) => (
                  <div key={c.id} className="flex gap-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#1A3263] text-[10px] font-semibold text-white">
                      {c.createdBy.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="text-[11px] font-medium text-[#1A3263]">{c.createdBy.slice(0, 8)}…</span>
                        <span className="text-[10px] text-[#5A6E9A]">{timeAgo(c.createdAt)}</span>
                      </div>
                      <p className="mt-0.5 whitespace-pre-wrap text-[13px] text-[#1A3263]">{c.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Add comment */}
            <div className="flex gap-2">
              <textarea
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleAddComment() } }}
                placeholder="Add a comment… (Enter to submit)"
                rows={2}
                className="flex-1 resize-none rounded-lg border border-[#B0C0E0] bg-white px-3 py-2 text-[13px] text-[#1A3263] placeholder-[#9CA3AF] outline-none transition focus:border-[#1A3263] focus:ring-1 focus:ring-[#1A3263]/20"
              />
              <button
                type="button"
                onClick={handleAddComment}
                disabled={addingComment || !commentText.trim()}
                className="self-end rounded-lg bg-[#1A3263] px-3 py-2 text-[12px] font-semibold text-white transition hover:bg-[#122247] disabled:opacity-50"
              >
                {addingComment ? '…' : 'Post'}
              </button>
            </div>
          </div>
        </div>

        {/* ================================================================ */}
        {/* RIGHT COLUMN — sidebar metadata */}
        {/* ================================================================ */}
        <div className="flex flex-col gap-3 lg:w-[30%]">
          <div className="rounded-[10px] border border-[#B0C0E0] bg-white p-4 shadow-sm space-y-4">
            <SidebarField label="Status">
              {canChangeStatus ? (
                <InlineSelect value={bug.status} options={BUG_STATUSES} onChange={(v) => handleSidebarChange('status', v)} />
              ) : (
                <div className="text-[12px] text-[#1A3263]">{bug.status}</div>
              )}
            </SidebarField>
            <SidebarField label="Severity">
              {canEditBug ? (
                <InlineSelect value={bug.severity} options={BUG_SEVERITIES} onChange={(v) => handleSidebarChange('severity', v)} />
              ) : (
                <div className="text-[12px] text-[#1A3263]">{bug.severity}</div>
              )}
            </SidebarField>
            <SidebarField label="Priority">
              {canEditBug ? (
                <InlineSelect value={bug.priority} options={BUG_SEVERITIES} onChange={(v) => handleSidebarChange('priority', v)} />
              ) : (
                <div className="text-[12px] text-[#1A3263]">{bug.priority}</div>
              )}
            </SidebarField>
            <SidebarField label="Environment">
              {canEditBug ? (
                <InlineSelect value={bug.environment} options={BUG_ENVIRONMENTS} onChange={(v) => handleSidebarChange('environment', v)} />
              ) : (
                <div className="text-[12px] text-[#1A3263]">{bug.environment}</div>
              )}
            </SidebarField>

            <div className="border-t border-[#EEF2FB] pt-3 space-y-3">
              <SidebarField label="Reported By">
                <div className="text-[12px] text-[#1A3263]">{bug.reportedBy?.slice(0, 12)}…</div>
              </SidebarField>
              <SidebarField label="Created">
                <div className="text-[12px] text-[#1A3263]">{formatTimestamp(bug.createdAt)}</div>
              </SidebarField>
              {(bug.status === 'Fixed' || bug.status === 'Closed') && (
                <SidebarField label="Resolved">
                  <div className="text-[12px] text-[#1A3263]">{formatTimestamp(bug.resolvedAt)}</div>
                </SidebarField>
              )}
            </div>

            {/* Tags */}
            <div className="border-t border-[#EEF2FB] pt-3">
              <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-[#5A6E9A]">Tags</div>
              <div className="mb-2 flex flex-wrap gap-1">
                {tags.map((tag) => (
                  <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-[#EEF2FB] px-2 py-0.5 text-[11px] text-[#1A3263]">
                    {tag}
                    {canEditBug ? (
                      <button type="button" onClick={() => removeTag(tag)} className="text-[#5A6E9A] hover:text-red-500 transition" aria-label={`Remove tag ${tag}`}>×</button>
                    ) : null}
                  </span>
                ))}
              </div>
              {canEditBug ? (
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }}
                  placeholder="Add tag…"
                  className="flex-1 rounded-lg border border-[#B0C0E0] bg-white px-2 py-1 text-[12px] text-[#1A3263] outline-none transition focus:border-[#1A3263]"
                />
                <button type="button" onClick={addTag} className="rounded-lg border border-[#B0C0E0] px-2 py-1 text-[11px] text-[#1A3263] transition hover:bg-[#EEF2FB]">Add</button>
              </div>
              ) : null}
            </div>

            {/* JIRA Integration */}
            <div className="border-t border-[#EEF2FB] pt-3">
              <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-[#5A6E9A]">JIRA</div>
              {bug.jiraIssueKey ? (
                <div className="space-y-2">
                  <a
                    href={bug.jiraIssueUrl ?? '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#0052CC]/10 px-2.5 py-1.5 font-mono text-[12px] font-semibold text-[#0052CC] transition hover:bg-[#0052CC]/20"
                  >
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>
                      <path d="M11.53 2c0 2.4 1.97 4.35 4.35 4.35h1.78v1.7c0 2.4 1.94 4.34 4.34 4.35V2.84a.84.84 0 00-.84-.84H11.53zM6.77 6.8a4.362 4.362 0 004.34 4.37h1.8v1.72a4.362 4.362 0 004.34 4.35V7.65a.85.85 0 00-.85-.85H6.77zM2 11.6a4.35 4.35 0 004.34 4.34h1.8v1.72a4.35 4.35 0 004.34 4.34v-9.57a.84.84 0 00-.84-.84H2z" />
                    </svg>
                    → {bug.jiraIssueKey}
                  </a>
                  {bug.jiraSyncedAt && (
                    <div className="text-[10px] text-[#5A6E9A]">
                      Last synced: {timeAgo(bug.jiraSyncedAt)}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={handleSyncJiraStatus}
                    disabled={jiraSyncing}
                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-[#B0C0E0] bg-white py-1.5 text-[11px] font-medium text-[#1A3263] transition hover:bg-[#EEF2FB] disabled:opacity-50"
                  >
                    {jiraSyncing ? (
                      <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-[#1A3263] border-t-transparent" aria-hidden />
                    ) : (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3 w-3" aria-hidden>
                        <path d="M23 4v6h-6" />
                        <path d="M1 20v-6h6" />
                        <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
                      </svg>
                    )}
                    {jiraSyncing ? 'Syncing…' : 'Sync Status from JIRA'}
                  </button>
                </div>
              ) : jiraConfig?.enabled && canEditBug ? (
                <button
                  type="button"
                  onClick={handlePushToJira}
                  disabled={jiraPushing}
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#0052CC] py-2 text-[11px] font-semibold text-white transition hover:bg-[#0747A6] disabled:opacity-60"
                >
                  {jiraPushing ? (
                    <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" aria-hidden />
                  ) : (
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>
                      <path d="M11.53 2c0 2.4 1.97 4.35 4.35 4.35h1.78v1.7c0 2.4 1.94 4.34 4.34 4.35V2.84a.84.84 0 00-.84-.84H11.53zM6.77 6.8a4.362 4.362 0 004.34 4.37h1.8v1.72a4.362 4.362 0 004.34 4.35V7.65a.85.85 0 00-.85-.85H6.77zM2 11.6a4.35 4.35 0 004.34 4.34h1.8v1.72a4.35 4.35 0 004.34 4.34v-9.57a.84.84 0 00-.84-.84H2z" />
                    </svg>
                  )}
                  {jiraPushing ? 'Pushing…' : 'Push to JIRA'}
                </button>
              ) : (
                <div className="text-[11px] text-[#5A6E9A]">
                  JIRA not configured.
                  <span className="ml-1 text-[#4169C4] cursor-pointer hover:underline">Connect in Settings</span>
                </div>
              )}
            </div>
          </div>

          {/* Delete */}
          {canDeleteBug ? (
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="w-full rounded-[10px] border border-red-200 bg-red-50 py-2 text-[12px] font-medium text-red-600 transition hover:bg-red-100 disabled:opacity-50"
            >
              {deleting ? 'Deleting…' : '🗑 Delete Bug'}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
