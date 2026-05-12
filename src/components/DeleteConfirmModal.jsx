/**
 * @fileoverview Themed confirmation dialog for deleting a test case (replaces window.confirm).
 */

import { useEffect } from 'react'
import { createPortal } from 'react-dom'

/**
 * @param {Object} props
 * @param {Record<string, unknown>|null} props.testCase - Row to delete, or null to hide
 * @param {() => void} props.onClose
 * @param {() => void} props.onConfirm
 * @param {boolean} [props.isDeleting]
 */
export default function DeleteConfirmModal({ testCase, onClose, onConfirm, isDeleting = false }) {
  useEffect(() => {
    if (!testCase) return
    const onKey = (e) => {
      if (e.key === 'Escape' && !isDeleting) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [testCase, isDeleting, onClose])

  if (!testCase || typeof document === 'undefined') return null

  const humanId =
    testCase.testCaseId != null && String(testCase.testCaseId).trim() !== ''
      ? String(testCase.testCaseId)
      : testCase.id != null
        ? String(testCase.id)
        : '—'
  const title =
    testCase.title != null && String(testCase.title).trim() !== ''
      ? String(testCase.title)
      : 'Untitled test case'

  return createPortal(
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.45)' }}
      role="presentation"
      onClick={() => !isDeleting && onClose()}
    >
      <div
        className="relative w-full max-w-[400px] overflow-hidden rounded-xl border-[0.5px] border-[#B0C0E0] bg-white shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-confirm-title"
        aria-describedby="delete-confirm-desc"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-gradient-to-r from-[#EEF2FB] to-white px-6 pt-6 pb-4 border-b border-[#D6E0F5]/80">
          <div className="flex items-start gap-4">
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-red-50 border border-red-100"
              aria-hidden
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="#DC2626"
                strokeWidth="1.8"
                className="h-6 w-6"
              >
                <path d="M3 6h18M8 6V4h8v2M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M10 11v6M14 11v6" />
              </svg>
            </div>
            <div className="min-w-0 flex-1 pt-0.5">
              <h2
                id="delete-confirm-title"
                className="text-[16px] font-semibold leading-snug text-[#1A3263]"
              >
                Delete this test case?
              </h2>
              <p id="delete-confirm-desc" className="mt-2 text-[13px] leading-relaxed text-[#5A6E9A]">
                This action cannot be undone. The test case will be removed from your library.
              </p>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 bg-[#EEF2FB]">
          <p className="text-[11px] font-mono uppercase tracking-wide text-[#5A6E9A] mb-1">
            Test case ID
          </p>
          <p className="text-[14px] font-mono font-semibold text-[#1A3263]">{humanId}</p>
          <p className="text-[11px] font-mono uppercase tracking-wide text-[#5A6E9A] mt-3 mb-1">
            Title
          </p>
          <p className="text-[13px] text-[#1A3263] line-clamp-2" title={title}>
            {title}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-[#B0C0E0]/60 bg-white px-6 py-4">
          <button
            type="button"
            disabled={isDeleting}
            onClick={onClose}
            className="rounded-lg border-[0.5px] border-[#B0C0E0] bg-white px-4 py-2.5 text-[13px] font-medium text-[#5A6E9A] transition hover:bg-[#EEF2FB] hover:text-[#1A3263] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isDeleting}
            onClick={onConfirm}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#DC2626] px-4 py-2.5 text-[13px] font-semibold text-white shadow-sm transition hover:bg-red-700 disabled:opacity-60 disabled:cursor-not-allowed min-w-[120px]"
          >
            {isDeleting ? (
              <>
                <span
                  className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-white border-t-transparent"
                  aria-hidden
                />
                Deleting…
              </>
            ) : (
              'Delete test case'
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
