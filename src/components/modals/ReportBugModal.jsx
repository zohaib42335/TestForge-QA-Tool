/**
 * @fileoverview Report Bug Modal — creates a new bug in Firestore.
 * Props allow pre-filling from a failed test case.
 *
 * @param {Object} props
 * @param {boolean} props.isOpen
 * @param {() => void} props.onClose
 * @param {string} props.projectId
 * @param {{ testCaseId: string, title: string, steps: string[], priority: string } | null} [props.prefillFromTestCase]
 * @param {(docId: string, bugId: string) => void} [props.onCreated]
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useBugs } from '../../hooks/useBugs.js'
import { useJiraIntegration } from '../../hooks/useJiraIntegration.js'
import { BUG_ENVIRONMENTS, BUG_SEVERITIES, BUG_STATUSES, PRIORITY_MAP } from '../../constants/bugConstants.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function genLocalStepId() {
  return `step-${Math.random().toString(36).slice(2, 9)}`
}

/** @param {string[]} raw */
function initSteps(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return [{ id: genLocalStepId(), text: '' }]
  return raw.map((t) => ({ id: genLocalStepId(), text: t }))
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ReportBugModal({
  isOpen,
  onClose,
  projectId,
  prefillFromTestCase = null,
  onCreated,
}) {
  const { createBug } = useBugs()
  const { config: jiraConfig, fetchConfig: fetchJiraConfig, createIssue } = useJiraIntegration()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [steps, setSteps] = useState([{ id: genLocalStepId(), text: '' }])
  const [severity, setSeverity] = useState('Medium')
  const [priority, setPriority] = useState('Medium')
  const [environment, setEnvironment] = useState('Staging')
  const [tags, setTags] = useState(/** @type {string[]} */ ([]))
  const [tagInput, setTagInput] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(/** @type {string|null} */ (null))
  const [jiraState, setJiraState] = useState(
    /** @type {'idle'|'syncing'|'success'|'failed'|'prompt'} */ ('idle'),
  )
  const [jiraResult, setJiraResult] = useState(
    /** @type {{ key?: string, url?: string, error?: string } | null} */ (null),
  )

  const firstInputRef = useRef(/** @type {HTMLInputElement|null} */ (null))

  // Pre-fill from test case when opened
  useEffect(() => {
    if (!isOpen) return
    if (prefillFromTestCase) {
      setTitle(`Bug: ${prefillFromTestCase.title} failed`)
      setSteps(initSteps(prefillFromTestCase.steps ?? []))
      const mapped = PRIORITY_MAP[prefillFromTestCase.priority] ?? 'Medium'
      setSeverity(mapped)
      setPriority(mapped)
    } else {
      setTitle('')
      setDescription('')
      setSteps([{ id: genLocalStepId(), text: '' }])
      setSeverity('Medium')
      setPriority('Medium')
      setEnvironment('Staging')
      setTags([])
      setTagInput('')
    }
    setError(null)
    setJiraState('idle')
    setJiraResult(null)
    setTimeout(() => firstInputRef.current?.focus(), 50)
  }, [isOpen, prefillFromTestCase])

  // Load JIRA config when opened
  useEffect(() => {
    if (isOpen && projectId) void fetchJiraConfig(projectId)
  }, [isOpen, projectId, fetchJiraConfig])

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return
    const handler = (/** @type {KeyboardEvent} */ e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  // -------------------------------------------------------------------------
  // Steps management
  // -------------------------------------------------------------------------

  const updateStep = useCallback((id, text) => {
    setSteps((prev) => prev.map((s) => s.id === id ? { ...s, text } : s))
  }, [])

  const addStep = useCallback(() => {
    setSteps((prev) => [...prev, { id: genLocalStepId(), text: '' }])
  }, [])

  const removeStep = useCallback((id) => {
    setSteps((prev) => prev.length > 1 ? prev.filter((s) => s.id !== id) : prev)
  }, [])

  // -------------------------------------------------------------------------
  // Tags management
  // -------------------------------------------------------------------------

  const addTag = useCallback(() => {
    const t = tagInput.trim()
    if (!t || tags.includes(t)) { setTagInput(''); return }
    setTags((prev) => [...prev, t])
    setTagInput('')
  }, [tagInput, tags])

  const removeTag = useCallback((tag) => {
    setTags((prev) => prev.filter((t) => t !== tag))
  }, [])

  // -------------------------------------------------------------------------
  // Submit
  // -------------------------------------------------------------------------

  const handleSubmit = useCallback(async () => {
    if (!title.trim()) { setError('Title is required.'); return }
    setError(null)
    setSubmitting(true)
    try {
      const { docId, bugId } = await createBug(projectId, {
        title: title.trim(),
        description: description.trim(),
        stepsToReproduce: steps.map((s) => s.text).filter(Boolean),
        severity,
        priority,
        status: 'Open',
        environment: environment.trim() || 'Unknown',
        linkedTestCaseIds: prefillFromTestCase?.testCaseId ? [prefillFromTestCase.testCaseId] : [],
        linkedTestRunId: null,
        assignedTo: null,
        tags,
        attachments: [],
      })
      onCreated?.(docId, bugId)

      // JIRA auto-sync
      if (jiraConfig?.enabled) {
        if (jiraConfig.autoSync) {
          setJiraState('syncing')
          try {
            const result = await createIssue(projectId, docId)
            setJiraResult({ key: result.jiraIssueKey, url: result.jiraIssueUrl })
            setJiraState('success')
          } catch (err) {
            setJiraResult({ error: err instanceof Error ? err.message : 'JIRA sync failed' })
            setJiraState('failed')
          }
          // Keep modal open briefly to show result, then close
          setTimeout(() => onClose(), 2500)
          return
        } else {
          // Show prompt to manually push
          setJiraState('prompt')
          // Store docId for manual push
          setJiraResult({ key: docId })
          return // Don't close — user can choose to push or dismiss
        }
      }

      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create bug.')
    } finally {
      setSubmitting(false)
    }
  }, [title, description, steps, severity, priority, environment, tags, projectId, prefillFromTestCase, createBug, onCreated, onClose, jiraConfig, createIssue])

  const handleManualJiraPush = useCallback(async () => {
    if (!jiraResult?.key) return
    setJiraState('syncing')
    try {
      const result = await createIssue(projectId, jiraResult.key)
      setJiraResult({ key: result.jiraIssueKey, url: result.jiraIssueUrl })
      setJiraState('success')
      setTimeout(() => onClose(), 2500)
    } catch (err) {
      setJiraResult({ error: err instanceof Error ? err.message : 'JIRA sync failed' })
      setJiraState('failed')
    }
  }, [projectId, jiraResult, createIssue, onClose])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-[2px] sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Report Bug"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="flex h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:h-auto sm:max-h-[90vh] sm:rounded-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-[#B0C0E0] px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-100">
              <svg viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="1.8" className="h-4 w-4" aria-hidden>
                <path d="M12 9v4M12 17h.01" />
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
            </span>
            <h2 className="text-[15px] font-semibold text-[#1A3263]">Report Bug</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-[#5A6E9A] transition hover:bg-[#EEF2FB] hover:text-[#1A3263]"
            aria-label="Close"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden>
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Title */}
          <div>
            <label className="mb-1.5 block text-[12px] font-medium text-[#1A3263]">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              ref={firstInputRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Short description of the bug"
              className="w-full rounded-lg border border-[#B0C0E0] bg-white px-3 py-2 text-[13px] text-[#1A3263] placeholder-[#9CA3AF] outline-none transition focus:border-[#1A3263] focus:ring-1 focus:ring-[#1A3263]/20"
            />
          </div>

          {/* Description */}
          <div>
            <label className="mb-1.5 block text-[12px] font-medium text-[#1A3263]">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="What went wrong? Include any relevant context..."
              className="w-full rounded-lg border border-[#B0C0E0] bg-white px-3 py-2 text-[13px] text-[#1A3263] placeholder-[#9CA3AF] outline-none transition focus:border-[#1A3263] focus:ring-1 focus:ring-[#1A3263]/20 resize-none"
            />
          </div>

          {/* Steps to Reproduce */}
          <div>
            <label className="mb-1.5 block text-[12px] font-medium text-[#1A3263]">Steps to Reproduce</label>
            <div className="space-y-1.5">
              {steps.map((step, idx) => (
                <div key={step.id} className="flex items-center gap-2">
                  <span className="shrink-0 text-[11px] font-medium text-[#5A6E9A] w-5 text-right">{idx + 1}.</span>
                  <input
                    type="text"
                    value={step.text}
                    onChange={(e) => updateStep(step.id, e.target.value)}
                    placeholder={`Step ${idx + 1}`}
                    className="flex-1 rounded-lg border border-[#B0C0E0] bg-white px-3 py-1.5 text-[13px] text-[#1A3263] placeholder-[#9CA3AF] outline-none transition focus:border-[#1A3263] focus:ring-1 focus:ring-[#1A3263]/20"
                  />
                  <button
                    type="button"
                    onClick={() => removeStep(step.id)}
                    className="shrink-0 flex h-7 w-7 items-center justify-center rounded-lg text-[#9CA3AF] transition hover:bg-red-50 hover:text-red-500"
                    aria-label="Remove step"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5" aria-hidden>
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={addStep}
                className="mt-1 flex items-center gap-1.5 text-[12px] text-[#4169C4] transition hover:text-[#1A3263]"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5" aria-hidden>
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Add step
              </button>
            </div>
          </div>

          {/* Severity / Priority / Environment */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-[#1A3263]">Severity</label>
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value)}
                className="w-full rounded-lg border border-[#B0C0E0] bg-white px-3 py-2 text-[13px] text-[#1A3263] outline-none transition focus:border-[#1A3263]"
              >
                {BUG_SEVERITIES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-[#1A3263]">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full rounded-lg border border-[#B0C0E0] bg-white px-3 py-2 text-[13px] text-[#1A3263] outline-none transition focus:border-[#1A3263]"
              >
                {BUG_SEVERITIES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-[#1A3263]">Environment</label>
              <select
                value={environment}
                onChange={(e) => setEnvironment(e.target.value)}
                className="w-full rounded-lg border border-[#B0C0E0] bg-white px-3 py-2 text-[13px] text-[#1A3263] outline-none transition focus:border-[#1A3263]"
              >
                {BUG_ENVIRONMENTS.map((env) => <option key={env}>{env}</option>)}
              </select>
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="mb-1.5 block text-[12px] font-medium text-[#1A3263]">Tags</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 rounded-full bg-[#EEF2FB] px-2 py-0.5 text-[11px] text-[#1A3263]"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => removeTag(tag)}
                    className="text-[#5A6E9A] hover:text-red-500 transition"
                    aria-label={`Remove tag ${tag}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }}
                placeholder="Add a tag…"
                className="flex-1 rounded-lg border border-[#B0C0E0] bg-white px-3 py-1.5 text-[13px] text-[#1A3263] placeholder-[#9CA3AF] outline-none transition focus:border-[#1A3263]"
              />
              <button
                type="button"
                onClick={addTag}
                className="rounded-lg border border-[#B0C0E0] px-3 py-1.5 text-[12px] text-[#1A3263] transition hover:bg-[#EEF2FB]"
              >
                Add
              </button>
            </div>
          </div>
        </div>

        {/* JIRA sync status banner */}
        {jiraState === 'syncing' && (
          <div className="flex shrink-0 items-center gap-2 border-t border-[#B0C0E0] bg-[#F0F4FF] px-5 py-3 text-[12px] text-[#1A3263]">
            <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#0052CC] border-t-transparent" aria-hidden />
            Creating JIRA issue…
          </div>
        )}
        {jiraState === 'success' && jiraResult?.key && (
          <div className="flex shrink-0 items-center gap-2 border-t border-green-200 bg-green-50 px-5 py-3 text-[12px] text-green-700">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5 shrink-0" aria-hidden>
              <path d="M20 6L9 17l-5-5" />
            </svg>
            JIRA issue{' '}
            <a
              href={jiraResult.url ?? '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold underline hover:text-green-900"
            >
              {jiraResult.key}
            </a>{' '}
            created. Closing…
          </div>
        )}
        {jiraState === 'failed' && (
          <div className="flex shrink-0 items-center gap-2 border-t border-yellow-200 bg-yellow-50 px-5 py-3 text-[12px] text-yellow-800">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5 shrink-0" aria-hidden>
              <path d="M12 9v4M12 17h.01" />
              <circle cx="12" cy="12" r="10" />
            </svg>
            Bug saved in TestForge but JIRA sync failed: {jiraResult?.error ?? 'Unknown error'}
          </div>
        )}
        {jiraState === 'prompt' && (
          <div className="flex shrink-0 items-center justify-between gap-2 border-t border-[#B0C0E0] bg-[#F0F4FF] px-5 py-3">
            <span className="text-[12px] text-[#1A3263]">Bug saved ✓ — also create in JIRA?</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-[#B0C0E0] px-3 py-1.5 text-[12px] text-[#5A6E9A] transition hover:bg-[#EEF2FB]"
              >
                Skip
              </button>
              <button
                type="button"
                onClick={handleManualJiraPush}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#0052CC] px-3 py-1.5 text-[12px] font-semibold text-white transition hover:bg-[#0747A6]"
              >
                <svg viewBox="0 0 24 24" className="h-3 w-3" fill="currentColor" aria-hidden>
                  <path d="M11.53 2c0 2.4 1.97 4.35 4.35 4.35h1.78v1.7c0 2.4 1.94 4.34 4.34 4.35V2.84a.84.84 0 00-.84-.84H11.53zM6.77 6.8a4.362 4.362 0 004.34 4.37h1.8v1.72a4.362 4.362 0 004.34 4.35V7.65a.85.85 0 00-.85-.85H6.77zM2 11.6a4.35 4.35 0 004.34 4.34h1.8v1.72a4.35 4.35 0 004.34 4.34v-9.57a.84.84 0 00-.84-.84H2z" />
                </svg>
                Also create in JIRA
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        {jiraState === 'idle' && (
          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-[#B0C0E0] px-5 py-3">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-lg border border-[#B0C0E0] px-4 py-2 text-[13px] font-medium text-[#5A6E9A] transition hover:bg-[#EEF2FB] disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-lg bg-[#1A3263] px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-[#122247] disabled:opacity-60"
            >
              {submitting ? (
                <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" aria-hidden />
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5" aria-hidden>
                  <path d="M12 9v4M12 17h.01" />
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
              )}
              {submitting ? 'Reporting…' : 'Report Bug'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
