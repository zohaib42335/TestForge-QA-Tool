/**
 * ImportModal — Multi-step CSV/XLSX bulk import: Upload → Map → Preview → Import.
 * @param {Object} props
 * @param {boolean} props.open
 * @param {Function} props.onClose
 * @param {Function} props.onImport - ({ imported, skipped, failedRows?, error? }) => void
 * @param {string|null|undefined} [props.projectId]
 */

import { useCallback, useLayoutEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import {
  SKIP_FIELD,
  IMPORT_TARGET_FIELDS,
  parseImportFile,
  buildAutoColumnMapping,
  mapRowToTestCaseShape,
  mergeWithDefaultsForImport,
} from '../utils/importUtils.js'
import { validateTestCase } from '../utils/validation.js'
import { buildActivityActor } from '../utils/memberDisplay.js'
import { addTestCasesBatch, logActivity } from '../firebase/firestore.js'

const PREVIEW_PAGE_SIZE = 10

/** Step labels for the import wizard (shown as pills). */
const STEP_LABELS = ['Upload', 'Map columns', 'Preview', 'Done']

/**
 * @param {Object} props
 * @param {boolean} props.open
 * @param {Function} props.onClose
 * @param {Function} props.onImport
 */
export default function ImportModal({ open, onClose, onImport, projectId = null }) {
  const { user, userProfile } = useAuth()
  const [step, setStep] = useState(1)
  const [parseError, setParseError] = useState(/** @type {string|null} */ (null))
  const [fileLabel, setFileLabel] = useState('')
  const [headers, setHeaders] = useState(/** @type {string[]} */ ([]))
  const [rows, setRows] = useState(/** @type {Record<string, string>[]} */ ([]))
  const [columnMapping, setColumnMapping] = useState(
    /** @type {Record<string, string>} */ ({}),
  )
  const [previewPage, setPreviewPage] = useState(0)
  const [dragOver, setDragOver] = useState(false)
  const [summary, setSummary] = useState(
    /** @type {{ imported: number, skipped: number, failedRows?: Array<{ rowNumber: number, reason: string }>, error?: string } | null} */ (null),
  )
  const [isImporting, setIsImporting] = useState(false)
  const [importProgress, setImportProgress] = useState(
    /** @type {{ current: number, total: number } | null} */ (null),
  )

  const resetState = useCallback(() => {
    setStep(1)
    setParseError(null)
    setFileLabel('')
    setHeaders([])
    setRows([])
    setColumnMapping({})
    setPreviewPage(0)
    setDragOver(false)
    setSummary(null)
    setIsImporting(false)
    setImportProgress(null)
  }, [])

  useLayoutEffect(() => {
    if (open) {
      resetState()
    }
  }, [open, resetState])

  /**
   * @param {File|null} file
   */
  const processFile = async (file) => {
    setParseError(null)
    if (!file) {
      setParseError('No file selected.')
      return
    }
    setFileLabel(file.name)
    const result = await parseImportFile(file)
    if ('error' in result) {
      setParseError(result.error)
      return
    }
    setHeaders(result.headers)
    setRows(result.rows)
    setColumnMapping(buildAutoColumnMapping(result.headers))
    setPreviewPage(0)
    setStep(2)
  }

  /**
   * @param {import('react').DragEvent} e
   */
  const onDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files && e.dataTransfer.files[0]
    if (f) processFile(f)
  }

  /**
   * @param {import('react').ChangeEvent<HTMLInputElement>} e
   */
  const onFileInput = (e) => {
    const f = e.target.files && e.target.files[0]
    processFile(f)
  }

  /**
   * @param {string} header
   * @param {string} target
   */
  const updateMapping = (header, target) => {
    setColumnMapping((prev) => ({ ...prev, [header]: target }))
  }

  const rowAnalyses = useMemo(() => {
    return rows.map((row) => {
      const partial = mapRowToTestCaseShape(row, columnMapping)
      const merged = mergeWithDefaultsForImport(partial)
      const { isValid, errors } = validateTestCase(merged)
      return { merged, isValid, errors }
    })
  }, [rows, columnMapping])

  const stats = useMemo(() => {
    let valid = 0
    let invalid = 0
    for (const r of rowAnalyses) {
      if (r.isValid) valid += 1
      else invalid += 1
    }
    return { valid, invalid, total: rows.length }
  }, [rowAnalyses, rows.length])

  const previewSlice = useMemo(() => {
    const start = previewPage * PREVIEW_PAGE_SIZE
    return rowAnalyses.slice(start, start + PREVIEW_PAGE_SIZE).map((r, i) => ({
      ...r,
      globalIndex: start + i,
    }))
  }, [rowAnalyses, previewPage])

  const previewPageCount = Math.max(1, Math.ceil(rows.length / PREVIEW_PAGE_SIZE))

  const handleRunImport = async () => {
    const validEntries = rowAnalyses
      .map((r, index) => ({ ...r, sourceIndex: index }))
      .filter((r) => r.isValid)
    const validMerged = validEntries.map((r) => r.merged)
    const skipped = stats.invalid

    if (!user?.uid) {
      setSummary({
        imported: 0,
        skipped,
        error: 'You must be signed in to import test cases.',
        failedRows: validEntries.map((r) => ({
          rowNumber: r.sourceIndex + 1,
          reason: 'User is not authenticated.',
        })),
      })
      setStep(4)
      if (typeof onImport === 'function') {
        onImport({
          imported: 0,
          skipped,
          error: 'You must be signed in to import test cases.',
        })
      }
      return
    }

    if (!projectId) {
      const msg = 'No project is selected. Open the app from your workspace and try again.'
      setSummary({
        imported: 0,
        skipped,
        error: msg,
        failedRows: validEntries.map((r) => ({
          rowNumber: r.sourceIndex + 1,
          reason: msg,
        })),
      })
      setStep(4)
      if (typeof onImport === 'function') {
        onImport({
          imported: 0,
          skipped,
          error: msg,
        })
      }
      return
    }

    setIsImporting(true)
    setImportProgress({ current: 0, total: validMerged.length })
    for (let i = 0; i < validMerged.length; i += 1) {
      setImportProgress({ current: i + 1, total: validMerged.length })
      if (i % 25 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 0))
      }
    }

    const result = await addTestCasesBatch(user.uid, validMerged, projectId)
    setIsImporting(false)
    setImportProgress(null)

    if (!result || result.success !== true) {
      const failedRowsRaw = Array.isArray(result?.failedRows) ? result.failedRows : []
      const failedRows = failedRowsRaw.map((r) => ({
        rowNumber:
          validEntries[Number(r.rowIndex)]?.sourceIndex != null
            ? validEntries[Number(r.rowIndex)].sourceIndex + 1
            : Number(r.rowIndex) + 1,
        reason: String(r.reason || result?.error || 'Unknown Firestore error'),
      }))
      const nextSummary = {
        imported: 0,
        skipped,
        error:
          result && typeof result.error === 'string'
            ? result.error
            : 'Import failed while writing to Firestore.',
        failedRows,
      }
      setSummary(nextSummary)
      if (typeof onImport === 'function') {
        onImport({
          imported: 0,
          skipped,
          failedRows,
          error: nextSummary.error,
        })
      }
      setStep(4)
      return
    }

    const imported = typeof result.imported === 'number' ? result.imported : validMerged.length
    setSummary({ imported, skipped, failedRows: [] })
    if (typeof onImport === 'function') {
      onImport({ imported, skipped, failedRows: [] })
    }
    const actor = buildActivityActor(userProfile, user)
    if (actor) {
      void logActivity({
        action: 'testcase.imported',
        entityType: 'testCase',
        entityId: 'import',
        entityRef: 'Import',
        actor,
        metadata: { count: imported },
      })
    }
    setStep(4)
  }

  const handleClose = () => {
    resetState()
    onClose()
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-modal-title"
    >
      <div className="bg-white border border-[#B0C0E0] rounded-2xl w-full max-w-5xl max-h-[92vh] overflow-hidden flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 bg-[#1A3263] text-white shrink-0">
          <div>
            <h2 id="import-modal-title" className="text-lg font-semibold">
              Import test cases
            </h2>
            <p className="text-xs text-white/80 font-mono mt-1">
              Step {step} of 4 — {fileLabel && `"${fileLabel}"`}
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="w-10 h-10 rounded-lg text-white hover:text-white/80 transition"
            aria-label="Close import"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 text-[#1A3263]">
          <div
            className="flex flex-wrap gap-2 mb-5"
            role="list"
            aria-label="Import steps"
          >
            {STEP_LABELS.map((label, i) => {
              const n = i + 1
              const isActive = step === n
              const isDone = step > n
              return (
                <span
                  key={label}
                  role="listitem"
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold ${
                    isActive
                      ? 'bg-[#1A3263] text-white'
                      : isDone
                        ? 'bg-[#D6E0F5] text-[#1A3263]'
                        : 'bg-[#F1F5F9] text-[#5A6E9A]'
                  }`}
                >
                  {n}. {label}
                </span>
              )
            })}
          </div>
          {step === 1 && (
            <div className="space-y-4">
              <p className="text-sm text-[#5A6E9A]">
                Upload a <strong className="text-[#1A3263]">.csv</strong>,{' '}
                <strong className="text-[#1A3263]">.xlsx</strong>, or{' '}
                <strong className="text-[#1A3263]">.xls</strong> file. The first row must
                contain column headers.
              </p>
              <div
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragOver(true)
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                className={`border-2 border-dashed rounded-xl p-12 text-center transition bg-[#EEF2FB]/50 ${
                  dragOver
                    ? 'border-[#1A3263] bg-[#D6E0F5]'
                    : 'border-[#B0C0E0]'
                }`}
              >
                <p className="text-[#1A3263] mb-4">
                  Drag and drop your file here, or use the button below.
                </p>
                <label className="inline-block">
                  <input
                    type="file"
                    accept=".csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                    className="hidden"
                    onChange={onFileInput}
                  />
                  <span className="cursor-pointer px-5 py-2.5 rounded-lg bg-[#1A3263] hover:bg-[#122247] text-white text-sm font-semibold transition inline-block">
                    Browse files
                  </span>
                </label>
              </div>
              {parseError && (
                <div
                  className="rounded-lg border border-red-200 bg-red-50 border-l-4 border-l-red-500 text-red-800 text-sm px-4 py-3"
                  role="alert"
                >
                  {parseError}
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-[#5A6E9A]">
                Map each column from your file to a field in TestForge. Unmapped columns
                are skipped. You can override any auto-detected mapping.
              </p>
              <div className="overflow-x-auto rounded-lg border border-[#B0C0E0]">
                <table className="w-full text-sm text-left">
                  <thead className="bg-[#1A3263] text-xs uppercase tracking-wider text-white font-mono">
                    <tr>
                      <th className="px-4 py-3 border-b border-[#B0C0E0]">Source column</th>
                      <th className="px-4 py-3 border-b border-[#B0C0E0]">Maps to</th>
                    </tr>
                  </thead>
                  <tbody>
                    {headers.map((h) => (
                      <tr
                        key={h}
                        className="border-t border-[#B0C0E0] odd:bg-white even:bg-[#EEF2FB] text-[#1A3263]"
                      >
                        <td className="px-4 py-2 font-mono text-xs break-all">{h}</td>
                        <td className="px-4 py-2">
                          <select
                            value={columnMapping[h] ?? SKIP_FIELD}
                            onChange={(e) => updateMapping(h, e.target.value)}
                            className="w-full max-w-md bg-white border border-[#B0C0E0] text-[#1A3263] rounded-lg px-3 py-2 text-sm focus:border-[#1A3263] focus:ring-2 focus:ring-[rgba(26,50,99,0.15)] outline-none"
                          >
                            {IMPORT_TARGET_FIELDS.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {parseError && (
                <p className="text-red-600 text-sm" role="alert">
                  {parseError}
                </p>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-4 text-sm">
                <span className="text-[#1A3263]">
                  Total rows: <strong>{stats.total}</strong>
                </span>
                <span className="text-green-600">
                  Valid: <strong>{stats.valid}</strong>
                </span>
                <span className="text-red-600">
                  With errors: <strong>{stats.invalid}</strong>
                </span>
              </div>
              <p className="text-xs text-[#5A6E9A]">
                Rows failing validation (missing required fields or invalid enums) are
                highlighted. Only valid rows will be imported.
              </p>
              {isImporting && importProgress && (
                <div
                  className="rounded-lg border border-[#B0C0E0] bg-[#EEF2FB] px-4 py-3 text-sm text-[#1A3263]"
                  role="status"
                >
                  Importing {importProgress.current} of {importProgress.total} rows...
                </div>
              )}
              <div className="overflow-x-auto rounded-lg border border-[#B0C0E0] max-h-[360px] overflow-y-auto">
                <table className="w-full text-xs text-left min-w-[720px]">
                  <thead className="sticky top-0 bg-[#1A3263] z-10 text-[10px] uppercase tracking-wider text-white font-mono">
                    <tr>
                      <th className="px-2 py-2 w-10 border-b border-[#B0C0E0]">#</th>
                      <th className="px-2 py-2 border-b border-[#B0C0E0]">Module</th>
                      <th className="px-2 py-2 border-b border-[#B0C0E0]">Title</th>
                      <th className="px-2 py-2 border-b border-[#B0C0E0]">Status</th>
                      <th className="px-2 py-2 border-b border-[#B0C0E0]">Validation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewSlice.map(({ merged, isValid, errors, globalIndex }) => (
                      <tr
                        key={globalIndex}
                        className={`border-t border-[#B0C0E0] ${
                          isValid
                            ? 'odd:bg-white even:bg-[#EEF2FB]'
                            : 'border border-red-400 bg-red-50'
                        }`}
                      >
                        <td className="px-2 py-2 text-[#5A6E9A]">{globalIndex + 1}</td>
                        <td className="px-2 py-2 text-[#1A3263] max-w-[120px] truncate">
                          {merged.module}
                        </td>
                        <td className="px-2 py-2 text-[#1A3263] max-w-[200px] truncate">
                          {merged.title}
                        </td>
                        <td className="px-2 py-2 text-[#1A3263]">{merged.status}</td>
                        <td className="px-2 py-2 text-red-700">
                          {isValid
                            ? '—'
                            : Object.values(errors || {}).slice(0, 2).join(' · ')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rows.length > PREVIEW_PAGE_SIZE && (
                <div className="flex items-center justify-between gap-2 text-sm">
                  <button
                    type="button"
                    disabled={previewPage <= 0}
                    onClick={() => setPreviewPage((p) => Math.max(0, p - 1))}
                    className="px-3 py-1 rounded-lg bg-white border border-[#B0C0E0] text-[#1A3263] hover:bg-[#EEF2FB] disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <span className="text-[#5A6E9A]">
                    Page {previewPage + 1} / {previewPageCount}
                  </span>
                  <button
                    type="button"
                    disabled={previewPage >= previewPageCount - 1}
                    onClick={() =>
                      setPreviewPage((p) => Math.min(previewPageCount - 1, p + 1))
                    }
                    className="px-3 py-1 rounded-lg bg-white border border-[#B0C0E0] text-[#1A3263] hover:bg-[#EEF2FB] disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          )}

          {step === 4 && summary && (
            <div className="text-center py-8 space-y-4">
              {summary.error ? (
                <>
                  <p className="text-4xl text-red-600" aria-hidden>
                    !
                  </p>
                  <p className="text-lg text-[#1A3263] font-semibold">Import failed</p>
                  <p className="text-red-700 text-sm">{summary.error}</p>
                  {summary.failedRows && summary.failedRows.length > 0 && (
                    <div className="mx-auto max-w-2xl rounded-lg border border-red-200 bg-red-50 p-4 text-left">
                      <p className="text-sm font-semibold text-red-800 mb-2">Failed rows</p>
                      <ul className="text-xs text-red-700 space-y-1 max-h-56 overflow-y-auto">
                        {summary.failedRows.slice(0, 50).map((r) => (
                          <li key={`${r.rowNumber}-${r.reason}`}>
                            Row {r.rowNumber}: {r.reason}
                          </li>
                        ))}
                      </ul>
                      {summary.failedRows.length > 50 && (
                        <p className="text-[11px] text-red-600 mt-2">
                          Showing first 50 failures of {summary.failedRows.length}.
                        </p>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <p className="text-4xl text-green-600" aria-hidden>
                    ✓
                  </p>
                  <p className="text-lg text-[#1A3263] font-semibold">Import complete</p>
                  <p className="text-[#5A6E9A] text-sm">
                    {summary.imported} test case{summary.imported === 1 ? '' : 's'} imported
                    successfully{summary.skipped > 0 ? `, ${summary.skipped} skipped due to errors` : ''}.
                  </p>
                </>
              )}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-[#B0C0E0] bg-[#EEF2FB]/30 flex flex-wrap justify-end gap-2 shrink-0">
          {step === 1 && (
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 rounded-lg bg-white border border-[#B0C0E0] text-[#1A3263] text-sm font-semibold hover:bg-[#EEF2FB]"
            >
              Cancel
            </button>
          )}

          {step === 2 && (
            <>
              <button
                type="button"
                onClick={() => setStep(1)}
                className="px-4 py-2 rounded-lg bg-white border border-[#B0C0E0] text-[#1A3263] text-sm hover:bg-[#EEF2FB]"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => setStep(3)}
                className="px-4 py-2 rounded-lg bg-[#1A3263] hover:bg-[#122247] text-white text-sm font-semibold"
              >
                Continue to preview
              </button>
            </>
          )}

          {step === 3 && (
            <>
              <button
                type="button"
                onClick={() => setStep(2)}
                disabled={isImporting}
                className="px-4 py-2 rounded-lg bg-white border border-[#B0C0E0] text-[#1A3263] text-sm hover:bg-[#EEF2FB]"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleClose}
                disabled={isImporting}
                className="px-4 py-2 rounded-lg bg-white border border-[#B0C0E0] text-[#1A3263] text-sm hover:bg-[#EEF2FB]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={stats.valid === 0 || isImporting}
                onClick={handleRunImport}
                className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-semibold disabled:bg-[#B0C0E0] disabled:text-[#8A9BBF] disabled:cursor-not-allowed"
              >
                {isImporting ? 'Importing...' : 'Import valid rows only'}
              </button>
            </>
          )}

          {step === 4 && (
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 rounded-lg bg-[#1A3263] hover:bg-[#122247] text-white text-sm font-semibold"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
