/**
 * @fileoverview CreateRunModal — two-step modal to create a new test run.
 */

import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import { buildActivityActor, getActorDisplayLabel } from '../../utils/memberDisplay.js'
import { createTestRun, logActivity } from '../../firebase/firestore.js'
import { useToast } from '../Toast.jsx'

/**
 * @param {Record<string, unknown>} tc
 * @returns {string}
 */
function suiteOf(tc) {
  if (tc.testSuite != null && String(tc.testSuite).trim() !== '') {
    return String(tc.testSuite)
  }
  if (tc.module != null && String(tc.module).trim() !== '') {
    return String(tc.module)
  }
  return ''
}

/**
 * @param {string} p
 * @returns {string}
 */
function priorityClass(p) {
  const u = String(p || '').toLowerCase()
  if (u === 'critical' || u === 'high') return 'text-[#DC2626]'
  if (u === 'low') return 'text-[#9CA3AF]'
  return 'text-[#D97706]'
}

/**
 * @param {Object} props
 * @param {Array<Record<string, unknown>>} props.testCases
 * @param {boolean} props.testCasesLoading
 * @param {() => void} props.onClose
 */
export default function CreateRunModal({ testCases, testCasesLoading, onClose }) {
  const { user, userProfile } = useAuth()
  const showToast = useToast()

  const [step, setStep] = useState(1)
  const [runName, setRunName] = useState('')
  const [runDescription, setRunDescription] = useState('')
  const [nameError, setNameError] = useState('')
  const [search, setSearch] = useState('')
  const [suiteFilter, setSuiteFilter] = useState('__all__')
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [submitting, setSubmitting] = useState(false)

  const list = Array.isArray(testCases) ? testCases : []

  const suites = useMemo(() => {
    const s = new Set()
    for (const tc of list) {
      const v = suiteOf(tc)
      if (v) s.add(v)
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b))
  }, [list])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return list.filter((tc) => {
      const id = String(tc.testCaseId ?? tc.id ?? '').toLowerCase()
      const title = String(tc.title ?? tc.testTitle ?? '').toLowerCase()
      const matchQ = !q || id.includes(q) || title.includes(q)
      const su = suiteOf(tc)
      const matchS = suiteFilter === '__all__' || su === suiteFilter
      return matchQ && matchS
    })
  }, [list, search, suiteFilter])

  const selectedCaseObjects = useMemo(() => {
    return list.filter((tc) => tc && tc.id != null && selectedIds.has(String(tc.id)))
  }, [list, selectedIds])

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((tc) => selectedIds.has(String(tc.id)))

  const toggleOne = (tc) => {
    const id = tc && tc.id != null ? String(tc.id) : ''
    if (!id) return
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAllFiltered = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (allFilteredSelected) {
        for (const tc of filtered) {
          if (tc && tc.id != null) next.delete(String(tc.id))
        }
      } else {
        for (const tc of filtered) {
          if (tc && tc.id != null) next.add(String(tc.id))
        }
      }
      return next
    })
  }

  const handleNext = () => {
    if (!runName.trim()) {
      setNameError('Run name is required.')
      return
    }
    setNameError('')
    setStep(2)
  }

  const handleCreate = async () => {
    const ids = selectedCaseObjects
      .map((tc) => (tc && tc.id != null ? String(tc.id) : ''))
      .filter(Boolean)
    if (ids.length === 0) return

    const createdBy = getActorDisplayLabel(userProfile, user)

    const uid = user?.uid
    if (!uid) {
      showToast('You must be signed in to create a test run.', 'error')
      return
    }

    setSubmitting(true)
    try {
      const runId = await createTestRun(uid, {
        name: runName.trim(),
        description: runDescription.trim(),
        testCaseIds: ids,
        selectedCases: selectedCaseObjects,
        createdBy,
        totalCases: Math.round(ids.length),
      })
      const actor = buildActivityActor(userProfile, user)
      if (actor) {
        void logActivity({
          action: 'testrun.created',
          entityType: 'testRun',
          entityId: runId,
          entityRef: runName.trim(),
          actor,
          metadata: { totalCases: Math.round(ids.length) },
        })
      }
      showToast('Test run created successfully', 'success')
      onClose()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Something went wrong. Try again.'
      showToast(msg, 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const modal = (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center px-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-run-title"
    >
      <div
        className="bg-white border-[0.5px] border-[#B0C0E0] rounded-[12px] w-[520px] max-w-[calc(100vw-32px)] max-h-[85vh] overflow-y-auto shadow-lg"
      >
        <div className="bg-[#1A3263] text-white px-[18px] py-[14px] flex items-center justify-between">
          <h2 id="create-run-title" className="text-[15px] font-medium">
            {step === 1 ? 'Create Test Run' : 'Select Test Cases'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-white text-[18px] leading-none px-1 hover:opacity-90"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="px-5 py-4 flex items-center gap-2">
          <div className="flex items-center gap-2 flex-1">
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-semibold ${
                step === 1
                  ? 'bg-[#1A3263] text-white'
                  : 'bg-[#D6E0F5] text-[#1A3263]'
              }`}
            >
              {step === 2 ? '✓' : '1'}
            </div>
            <div className="flex-1 h-[2px] bg-[#D6E0F5] rounded" />
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-semibold ${
                step === 2 ? 'bg-[#1A3263] text-white' : 'bg-[#F1F5F9] text-[#5A6E9A]'
              }`}
            >
              2
            </div>
          </div>
        </div>

        {step === 1 && (
          <div className="px-5 pb-5">
            <label className="block text-[12px] font-medium text-[#1A3263] mb-1">
              Run Name <span className="text-red-600">*</span>
            </label>
            <input
              type="text"
              value={runName}
              onChange={(e) => {
                setRunName(e.target.value)
                if (nameError) setNameError('')
              }}
              placeholder="e.g. Sprint 12 Regression"
              className="w-full rounded-lg border-[0.5px] border-[#B0C0E0] px-3 py-2 text-[13px] text-[#1A3263] focus:outline-none focus:border-[#1A3263] focus:ring-2 focus:ring-[rgba(26,50,99,0.15)]"
            />
            {nameError && (
              <p className="text-[11px] text-red-600 mt-1">{nameError}</p>
            )}

            <label className="block text-[12px] font-medium text-[#1A3263] mt-4 mb-1">
              Description (optional)
            </label>
            <textarea
              value={runDescription}
              onChange={(e) => setRunDescription(e.target.value)}
              rows={3}
              placeholder="What is this test run for?"
              className="w-full rounded-lg border-[0.5px] border-[#B0C0E0] px-3 py-2 text-[13px] text-[#1A3263] focus:outline-none focus:border-[#1A3263] focus:ring-2 focus:ring-[rgba(26,50,99,0.15)] resize-y min-h-[72px]"
            />

            <div className="flex justify-end gap-2 mt-6">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-[12px] font-medium text-[#5A6E9A] hover:bg-[#EEF2FB] rounded-[7px] transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleNext}
                className="px-4 py-2 text-[12px] font-medium bg-[#1A3263] text-white rounded-[7px] hover:bg-[#122247] transition"
              >
                Next →
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="px-5 pb-5">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by title or ID..."
              className="w-full rounded-lg border-[0.5px] border-[#B0C0E0] px-3 py-2 text-[12px] mb-3 focus:outline-none focus:border-[#1A3263] focus:ring-2 focus:ring-[rgba(26,50,99,0.15)]"
            />

            <div className="flex items-center justify-between gap-3 mb-2">
              <select
                value={suiteFilter}
                onChange={(e) => setSuiteFilter(e.target.value)}
                className="text-[12px] border-[0.5px] border-[#B0C0E0] rounded-lg px-2 py-1.5 bg-white text-[#1A3263] focus:outline-none focus:border-[#1A3263]"
              >
                <option value="__all__">All Suites</option>
                {suites.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <label className="inline-flex items-center gap-2 text-[11px] text-[#5A6E9A] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={allFilteredSelected}
                  onChange={toggleSelectAllFiltered}
                  className="rounded border-[#B0C0E0]"
                />
                Select all
              </label>
            </div>

            <div
              className="border-[0.5px] border-[#B0C0E0] rounded-lg overflow-hidden"
              style={{ maxHeight: 320 }}
            >
              <div className="max-h-[320px] overflow-y-auto">
                {testCasesLoading && (
                  <p className="text-[12px] text-[#5A6E9A] p-4">Loading test cases…</p>
                )}
                {!testCasesLoading && filtered.length === 0 && (
                  <p className="text-[12px] text-[#5A6E9A] p-4">No test cases match.</p>
                )}
                {!testCasesLoading &&
                  filtered.map((tc) => {
                    const docId = tc && tc.id != null ? String(tc.id) : ''
                    const humanId = String(tc.testCaseId ?? docId)
                    const title = String(tc.title ?? tc.testTitle ?? '—')
                    const su = suiteOf(tc) || '—'
                    const pri = String(tc.priority ?? 'Medium')
                    const checked = docId ? selectedIds.has(docId) : false
                    return (
                      <label
                        key={docId || humanId}
                        className="flex items-center gap-2 px-3 py-2 border-b border-[#D6E0F5] last:border-b-0 cursor-pointer hover:bg-[#EEF2FB]/60"
                      >
                        <span
                          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border-[0.5px] ${
                            checked
                              ? 'bg-[#1A3263] border-[#122247]'
                              : 'bg-white border-[#B0C0E0]'
                          }`}
                        >
                          {checked && (
                            <svg
                              viewBox="0 0 24 24"
                              className="w-3 h-3 text-white"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="3"
                            >
                              <path d="M5 12l4 4L19 6" />
                            </svg>
                          )}
                        </span>
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={checked}
                          onChange={() => toggleOne(tc)}
                        />
                        <span className="text-[10px] text-[#1A3263] bg-[#EEF2FB] rounded px-[5px] py-[1px] font-mono shrink-0">
                          {humanId}
                        </span>
                        <span className="text-[11px] text-[#1A3263] flex-1 min-w-0 truncate">
                          {title}
                        </span>
                        <span className="text-[10px] bg-[#EEF2FB] text-[#5A6E9A] rounded-full px-[7px] py-[1px] shrink-0 max-w-[100px] truncate">
                          {su}
                        </span>
                        <span className={`text-[10px] shrink-0 w-14 text-right ${priorityClass(pri)}`}>
                          {pri}
                        </span>
                      </label>
                    )
                  })}
              </div>
            </div>

            <p className="text-[11px] text-[#5A6E9A] mt-2">
              {Math.round(selectedIds.size)} test cases selected
            </p>

            <div className="flex justify-between gap-2 mt-6">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="px-4 py-2 text-[12px] font-medium text-[#5A6E9A] hover:bg-[#EEF2FB] rounded-[7px] transition"
              >
                ← Back
              </button>
              <button
                type="button"
                disabled={selectedIds.size === 0 || submitting}
                onClick={handleCreate}
                className="px-4 py-2 text-[12px] font-medium bg-[#1A3263] text-white rounded-[7px] hover:bg-[#122247] transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? 'Creating…' : 'Create Run'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )

  if (typeof document === 'undefined') return null
  return createPortal(modal, document.body)
}
