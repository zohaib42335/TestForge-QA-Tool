/**
 * @fileoverview AIGeneratorModal — Two-phase AI test case generator.
 * Enhancement A: Prompt Templates (load / save / delete from Firestore)
 * Enhancement B: Generation History tab with re-run support
 *
 * @param {{ isOpen: boolean, onClose: () => void, projectId: string, onSuccess?: (n: number) => void, suiteId?: string }} props
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAIGenerator } from '../../hooks/useAIGenerator.js'
import { useAITemplates } from '../../hooks/useAITemplates.js'
import { useAIHistory } from '../../hooks/useAIHistory.js'
import { useRole } from '../../hooks/useRole'
import { useToast } from '../Toast.jsx'
import {
  ErrorBanner,
  HistoryList,
  SkeletonCard,
  Spinner,
  TemplatesDropdown,
  TestCaseCard,
  ghostBtnClass,
  inputClass,
  labelClass,
  primaryBtnClass,
} from './AIGeneratorModalParts.jsx'

// ---------------------------------------------------------------------------
// Main modal
// ---------------------------------------------------------------------------
export default function AIGeneratorModal({ isOpen, onClose, projectId, onSuccess, suiteId }) {
  const { hasPermission } = useRole()
  const canGenerate = hasPermission('ai_generate')
  const canSave = hasPermission('ai_save')
  const showToast = useToast()

  // ── AI generation hook ──────────────────────────────────────────────────
  const ai = useAIGenerator(projectId, {
    onSuccess: useCallback(
      (count) => {
        showToast(`${count} test case${count === 1 ? '' : 's'} added!`, 'success')
        onSuccess?.(count)
        onClose()
      },
      [showToast, onSuccess, onClose],
    ),
    suiteId,
  })

  // ── Templates hook ──────────────────────────────────────────────────────
  const tmpl = useAITemplates()

  // ── History hook ────────────────────────────────────────────────────────
  const hist = useAIHistory()

  // ── Local state ─────────────────────────────────────────────────────────
  /** @type {['generate'|'history', Function]} */
  const [modalTab,         setModalTab]         = useState('generate')
  const [saveMode,         setSaveMode]         = useState(false)
  const [templateName,     setTemplateName]     = useState('')
  const [savingTmpl,       setSavingTmpl]       = useState(false)
  const dropdownRef = useRef(null)

  // ── Reset on open ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return
    ai.reset()
    setModalTab('generate')
    setSaveMode(false)
    setTemplateName('')
    tmpl.fetchTemplates(projectId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  // ── Escape key ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return
    const h = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [isOpen, onClose])

  // ── Switch to history tab ───────────────────────────────────────────────
  const openHistory = useCallback(() => {
    setModalTab('history')
    hist.fetchHistory(projectId)
  }, [hist, projectId])

  // ── Apply template ──────────────────────────────────────────────────────
  const handleApplyTemplate = useCallback((t) => {
    ai.setFeatureDescription(t.featureDescription ?? '')
    ai.setModuleName(t.moduleName ?? '')
    ai.setExtraContext(t.extraContext ?? '')
    ai.setCount(t.count ?? 5)
  }, [ai])

  // ── Delete template ─────────────────────────────────────────────────────
  const handleDeleteTemplate = useCallback(async (id) => {
    if (!window.confirm('Delete this template?')) return
    try {
      await tmpl.deleteTemplate(projectId, id)
      tmpl.setTemplates((prev) => prev.filter((t) => t.id !== id))
      showToast('Template deleted.', 'success')
    } catch {
      showToast('Failed to delete template.', 'error')
    }
  }, [tmpl, projectId, showToast])

  // ── Save template ───────────────────────────────────────────────────────
  const handleSaveTemplate = useCallback(async () => {
    if (!templateName.trim()) return
    setSavingTmpl(true)
    try {
      await tmpl.saveTemplate(projectId, templateName, {
        featureDescription: ai.featureDescription,
        moduleName: ai.moduleName,
        extraContext: ai.extraContext,
        count: ai.count,
      })
      showToast('Template saved!', 'success')
      setSaveMode(false)
      setTemplateName('')
      await tmpl.fetchTemplates(projectId)
    } catch {
      showToast('Failed to save template.', 'error')
    } finally {
      setSavingTmpl(false)
    }
  }, [templateName, tmpl, projectId, ai, showToast])

  // ── Re-run from history ─────────────────────────────────────────────────
  const handleHistoryRerun = useCallback((item) => {
    ai.setFeatureDescription(item.featureDescriptionFull ?? item.featureDescription)
    ai.setModuleName(item.moduleName ?? '')
    ai.setExtraContext(item.extraContext ?? '')
    ai.setCount(item.count ?? 5)
    setModalTab('generate')
  }, [ai])

  // ── Derived ─────────────────────────────────────────────────────────────
  const selectedCount = ai.selectedIds.size
  const allSelected =
    ai.generatedCases.length > 0 &&
    ai.generatedCases.every((c) => ai.selectedIds.has(c._localId))

  if (!isOpen) return null

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      role="dialog" aria-modal="true" aria-labelledby="ai-gen-modal-title"
    >
      {/* Backdrop */}
      <button type="button" className="absolute inset-0 w-full h-full cursor-default" aria-label="Close" onClick={onClose} />

      {/* Panel */}
      <div className="relative bg-white rounded-2xl border border-[#B0C0E0] w-full max-w-2xl max-h-[92vh] overflow-hidden flex flex-col shadow-2xl">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-4 px-6 py-4 bg-[#1A3263] text-white shrink-0">
          {ai.view === 'input' ? (
            <div className="flex items-center gap-2.5">
              <span className="text-xl" aria-hidden>✨</span>
              <h2 id="ai-gen-modal-title" className="text-base font-semibold tracking-tight">AI Test Case Generator</h2>
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <button type="button" onClick={ai.goBack} disabled={ai.saving}
                className="flex items-center gap-1 text-white/80 hover:text-white text-sm transition disabled:opacity-50">
                <span aria-hidden>←</span> Back
              </button>
              <h2 id="ai-gen-modal-title" className="text-base font-semibold">
                {ai.generatedCases.length} test case{ai.generatedCases.length === 1 ? '' : 's'} generated
              </h2>
            </div>
          )}
          <button type="button" onClick={onClose} disabled={ai.loading || ai.saving}
            className="shrink-0 w-9 h-9 rounded-lg text-white/80 hover:text-white transition text-xl leading-none disabled:opacity-50"
            aria-label="Close">×</button>
        </div>

        {/* ── Tab bar (only in input view) ────────────────────────────────── */}
        {ai.view === 'input' && (
          <div className="flex border-b border-[#D6E0F5] bg-white shrink-0" role="tablist">
            {[
              { id: 'generate', label: '✨ Generate', onClick: () => setModalTab('generate') },
              { id: 'history',  label: '🕐 History',  onClick: openHistory },
            ].map(({ id, label, onClick }) => (
              <button
                key={id}
                role="tab"
                type="button"
                aria-selected={modalTab === id}
                onClick={onClick}
                className={`px-5 py-2.5 text-sm font-medium border-b-2 transition ${
                  modalTab === id
                    ? 'border-[#1A3263] text-[#1A3263]'
                    : 'border-transparent text-[#5A6E9A] hover:text-[#1A3263]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* GENERATE TAB — Input view                                         */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {ai.view === 'input' && modalTab === 'generate' && (
          <>
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4 min-h-0">
              {ai.error && <ErrorBanner message={ai.error} />}

              {/* Templates dropdown */}
              <div>
                <label className={labelClass}>Saved Templates</label>
                <TemplatesDropdown
                  templates={tmpl.templates}
                  loading={tmpl.loading}
                  canManage={canGenerate}
                  onApply={handleApplyTemplate}
                  onDelete={handleDeleteTemplate}
                />
              </div>

              <div className="border-t border-[#EEF2FB]" />

              {/* Feature Description */}
              <div>
                <label className={labelClass} htmlFor="ai-feature-desc">
                  Feature Description <span className="text-red-500">*</span>
                </label>
                <textarea
                  id="ai-feature-desc" rows={4} maxLength={2000}
                  value={ai.featureDescription}
                  onChange={(e) => ai.setFeatureDescription(e.target.value)}
                  placeholder="e.g. User can log in with email and password, reset password via email link…"
                  className={inputClass} disabled={ai.loading}
                />
                <p className="text-[11px] text-[#8A9BBF] mt-1 text-right tabular-nums">
                  {ai.featureDescription.length} / 2000
                </p>
              </div>

              {/* Module */}
              <div>
                <label className={labelClass} htmlFor="ai-module">
                  Module / Area <span className="text-[#8A9BBF] font-normal">(optional)</span>
                </label>
                <input id="ai-module" type="text" value={ai.moduleName}
                  onChange={(e) => ai.setModuleName(e.target.value)}
                  placeholder="e.g. Authentication, Checkout, Dashboard"
                  className={inputClass} autoComplete="off" disabled={ai.loading} />
              </div>

              {/* Extra Context */}
              <div>
                <label className={labelClass} htmlFor="ai-extra">
                  Extra Context <span className="text-[#8A9BBF] font-normal">(optional)</span>
                </label>
                <textarea id="ai-extra" rows={2} maxLength={500}
                  value={ai.extraContext}
                  onChange={(e) => ai.setExtraContext(e.target.value)}
                  placeholder="e.g. Must handle expired sessions, test on mobile viewport"
                  className={inputClass} disabled={ai.loading} />
                <p className="text-[11px] text-[#8A9BBF] mt-1 text-right tabular-nums">
                  {ai.extraContext.length} / 500
                </p>
              </div>

              {/* Count */}
              <div className="w-40">
                <label className={labelClass} htmlFor="ai-count">Number of test cases</label>
                <input id="ai-count" type="number" min={1} max={20} value={ai.count}
                  onChange={(e) => ai.setCount(Math.min(20, Math.max(1, parseInt(e.target.value, 10) || 1)))}
                  className={inputClass} disabled={ai.loading} />
              </div>

              {/* Loading skeletons */}
              {ai.loading && (
                <div className="space-y-3 pt-1">
                  <p className="text-xs text-[#5A6E9A] font-mono">Generating with Claude…</p>
                  <SkeletonCard /><SkeletonCard /><SkeletonCard />
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-[#B0C0E0] bg-[#EEF2FB]/30 shrink-0 space-y-2">
              {/* Save-as-template inline row */}
              {saveMode ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text" value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    placeholder="Template name…"
                    className={`${inputClass} flex-1 py-1.5 text-sm`}
                    autoFocus
                    onKeyDown={(e) => { if (e.key === 'Enter') void handleSaveTemplate() }}
                  />
                  <button type="button" onClick={() => void handleSaveTemplate()}
                    disabled={!templateName.trim() || savingTmpl}
                    className="px-4 py-1.5 rounded-lg bg-[#1A3263] text-white text-sm font-semibold disabled:opacity-50 hover:bg-[#122247] transition flex items-center gap-1">
                    {savingTmpl ? <><Spinner /> Saving…</> : 'Save'}
                  </button>
                  <button type="button" onClick={() => { setSaveMode(false); setTemplateName('') }}
                    className="px-3 py-1.5 rounded-lg border border-[#B0C0E0] text-sm text-[#5A6E9A] hover:bg-[#EEF2FB] transition">
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap justify-end gap-3">
                  <button type="button" onClick={onClose} disabled={ai.loading} className={ghostBtnClass}>Cancel</button>
                  <button type="button" onClick={() => setSaveMode(true)} disabled={!canGenerate || ai.loading || !ai.featureDescription.trim()}
                    className="px-5 py-2.5 rounded-lg bg-white border-[0.5px] border-[#B0C0E0] text-[#1A3263] text-sm font-semibold hover:bg-[#EEF2FB] hover:border-[#4169C4] transition disabled:opacity-40 disabled:cursor-not-allowed">
                    🔖 Save as Template
                  </button>
                  <button type="button" onClick={() => void ai.generate()}
                    disabled={!canGenerate || ai.loading || !ai.featureDescription.trim()}
                    className={primaryBtnClass} aria-busy={ai.loading}>
                    {ai.loading ? <span className="flex items-center gap-2"><Spinner />Generating…</span> : '✨ Generate Test Cases'}
                  </button>
                </div>
              )}
            </div>
          </>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* HISTORY TAB                                                        */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {ai.view === 'input' && modalTab === 'history' && (
          <>
            <div className="flex-1 overflow-y-auto px-6 py-5 min-h-0">
              <HistoryList history={hist.history} loading={hist.loading} onRerun={handleHistoryRerun} />
            </div>
            <div className="px-6 py-4 border-t border-[#B0C0E0] bg-[#EEF2FB]/30 flex justify-end shrink-0">
              <button type="button" onClick={onClose} className={ghostBtnClass}>Close</button>
            </div>
          </>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* PREVIEW VIEW                                                       */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {ai.view === 'preview' && (
          <>
            {/* Controls bar */}
            <div className="px-6 py-3 border-b border-[#D6E0F5] bg-[#EEF2FB]/40 flex items-center justify-between gap-3 shrink-0">
              <label className="flex items-center gap-2 text-sm text-[#1A3263] cursor-pointer select-none">
                <input type="checkbox" checked={allSelected}
                  onChange={allSelected ? ai.deselectAll : ai.selectAll}
                  className="w-4 h-4 rounded border-[#B0C0E0] accent-[#1A3263]" />
                {allSelected ? 'Deselect all' : 'Select all'}
              </label>
              <span className="text-xs text-[#8A9BBF] tabular-nums">
                {selectedCount} of {ai.generatedCases.length} selected
              </span>
            </div>

            {/* Cards */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3 min-h-0">
              {ai.error && <ErrorBanner message={ai.error} />}
              {ai.generatedCases.map((tc) => (
                <TestCaseCard key={tc._localId} tc={tc}
                  selected={ai.selectedIds.has(tc._localId)}
                  onToggle={() => ai.toggleSelect(tc._localId)} />
              ))}
            </div>

            {/* Sticky save bar */}
            <div className="px-6 py-4 border-t border-[#B0C0E0] bg-white flex items-center justify-between gap-3 shrink-0">
              <button type="button" onClick={ai.goBack} disabled={ai.saving} className={ghostBtnClass}>← Back</button>
              <button type="button" onClick={() => void ai.saveSelected()}
                disabled={!canSave || ai.saving || selectedCount === 0} className={primaryBtnClass} aria-busy={ai.saving}>
                {ai.saving
                  ? <span className="flex items-center gap-2"><Spinner />Saving…</span>
                  : `Save Selected (${selectedCount})`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
