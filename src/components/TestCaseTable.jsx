/**
 * TestCaseTable — Displays all test cases in a styled table with search, filter,
 * bulk status updates, duplicate row action, and persisted column sort.
 * @param {Object} props
 * @param {Array} props.testCases
 * @param {boolean} [props.loading]
 * @param {string} [props.error]
 * @param {Function} props.onEdit
 * @param {Function} props.onDelete
 * @param {Set<string>} [props.deletingDocIds]
 */

import { useCallback, useEffect, useMemo, useRef, useState, useContext } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useProject } from '../contexts/ProjectContext'
import { useRole } from '../hooks/useRole'
import { AIGeneratorContext } from '../context/AIGeneratorContext.jsx'
import { buildActivityActor } from '../utils/memberDisplay.js'
import {
  bulkUpdateStatus,
  duplicateTestCase,
  fetchCommentCountsByTestCaseIds,
  logActivity,
} from '../firebase/firestore.js'
import {
  getInitialSort,
  SORT_FIELD_LABELS,
  SORT_STORAGE_KEY,
  sortTestCasesList,
} from '../utils/tableSort.js'
import DeleteConfirmModal from './DeleteConfirmModal.jsx'
import TestCaseDetailPanel from './TestCaseDetailPanel.jsx'
import { useToast } from './Toast.jsx'
import TestCaseRow from './TestCaseRow.jsx'

const STATUS_FILTER_OPTIONS = ['All', 'Pass', 'Fail', 'Blocked', 'Not Executed']
const PRIORITY_FILTER_OPTIONS = ['All', 'High', 'Medium', 'Low']

/**
 * @param {string} q
 * @param {object} tc
 * @returns {boolean}
 */
function matchesSearch(q, tc) {
  if (!q) return true
  const needle = q.trim().toLowerCase()
  if (!needle) return true
  const fields = [tc?.testCaseId, tc?.module, tc?.title, tc?.assignedTo]
  return fields.some((f) => String(f ?? '').toLowerCase().includes(needle))
}

/**
 * @param {string} status
 * @returns {string}
 */
function statusDisplayLabel(status) {
  if (status === 'Not Run') return 'Not Run'
  return String(status)
}

/**
 * @param {string} status
 * @returns {'success-pass'|'success-fail'|'success-blocked'|'success-notrun'}
 */
function toastVariantForStatus(status) {
  if (status === 'Pass') return 'success-pass'
  if (status === 'Fail') return 'success-fail'
  if (status === 'Blocked') return 'success-blocked'
  return 'success-notrun'
}

/**
 * @param {string} status
 * @returns {string}
 */
function confirmUpdateButtonClass(status) {
  if (status === 'Pass') return 'bg-[#16A34A] text-white hover:bg-green-700'
  if (status === 'Fail') return 'bg-[#DC2626] text-white hover:bg-red-700'
  if (status === 'Blocked') return 'bg-[#D97706] text-white hover:bg-amber-700'
  return 'bg-[#9CA3AF] text-white hover:bg-[#6B7280]'
}

/**
 * Sort indicator for column headers.
 * @param {'asc'|'desc'|null} activeDirection
 */
function SortHeaderIcons({ activeDirection }) {
  if (activeDirection === 'asc') {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        className="h-3 w-3 shrink-0"
        aria-hidden
      >
        <path d="M12 19V5M5 12l7-7 7 7" />
      </svg>
    )
  }
  if (activeDirection === 'desc') {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        className="h-3 w-3 shrink-0"
        aria-hidden
      >
        <path d="M12 5v14M5 12l7 7 7-7" />
      </svg>
    )
  }
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className="h-3 w-3 shrink-0 opacity-40"
      aria-hidden
    >
      <path d="M7 15l5 5 5-5M7 9l5-5 5 5" />
    </svg>
  )
}

/**
 * @typedef {{ label: string, sortField?: string, sortable: boolean }} HeaderCol
 */

/** @type {HeaderCol[]} */
const TABLE_HEADER_COLS = [
  { label: 'Test Case ID', sortField: 'testCaseId', sortable: true },
  { label: 'Module', sortField: 'testSuite', sortable: true },
  { label: 'Title', sortField: 'testTitle', sortable: true },
  { label: 'Priority', sortField: 'priority', sortable: true },
  { label: 'Severity', sortField: 'severity', sortable: true },
  { label: 'Status', sortField: 'status', sortable: true },
  { label: 'Type', sortField: 'testType', sortable: true },
  { label: 'Assigned To', sortable: false },
  { label: 'Created Date', sortField: 'createdDate', sortable: true },
  { label: 'Actions', sortable: false },
]

/**
 * @param {Object} props
 * @param {Array} props.testCases
 * @param {boolean} [props.loading]
 * @param {string} [props.error]
 * @param {Function} props.onEdit
 * @param {Function} props.onDelete
 * @param {Set<string>} [props.deletingDocIds]
 */
export default function TestCaseTable({
  testCases,
  loading = false,
  error = '',
  onEdit,
  onDelete,
  deletingDocIds = new Set(),
}) {
  const { user, userProfile } = useAuth()
  const { projectId } = useProject()
  const { hasPermission } = useRole()
  const canCreate = hasPermission('testcase_create')
  const canEdit = hasPermission('testcase_edit')
  const canDelete = hasPermission('testcase_delete')
  const canDuplicate = hasPermission('testcase_create')
  const canBulkUpdate = hasPermission('testcase_edit')
  const canAssign = hasPermission('testcase_assign')
  const canAIGenerate = hasPermission('ai_generate')
  const showToast = useToast()
  // Optional — graceful if rendered outside AIGeneratorProvider
  const aiCtx = useContext(AIGeneratorContext)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [priorityFilter, setPriorityFilter] = useState('All')

  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState(/** @type {string[]} */ ([]))
  const [bulkLoading, setBulkLoading] = useState(false)
  const [confirmDialog, setConfirmDialog] = useState(
    /** @type {{ status: string, count: number, docIds: string[] } | null} */ (null),
  )
  const [bulkTargetStatus, setBulkTargetStatus] = useState(/** @type {string|null} */ (null))

  const [duplicatingId, setDuplicatingId] = useState(/** @type {string|null} */ (null))
  const [deleteTarget, setDeleteTarget] = useState(/** @type {Record<string, unknown>|null} */ (null))
  const [deleteSubmitting, setDeleteSubmitting] = useState(false)
  const [sortConfig, setSortConfig] = useState(() => getInitialSort())

  const [selectedTestCase, setSelectedTestCase] = useState(
    /** @type {Record<string, unknown>|null} */ (null),
  )
  const [commentCounts, setCommentCounts] = useState(/** @type {Record<string, number>} */ ({}))

  const selectAllRef = useRef(/** @type {HTMLInputElement|null} */ (null))

  const list = Array.isArray(testCases) ? testCases : []

  useEffect(() => {
    try {
      localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify(sortConfig))
    } catch (err) {
      console.warn('[TestCaseTable] persist sort:', err)
    }
  }, [sortConfig])

  const sortedList = useMemo(() => sortTestCasesList(list, sortConfig), [list, sortConfig])

  const filtered = useMemo(() => {
    return sortedList.filter((tc) => {
      if (!matchesSearch(search, tc)) return false
      if (statusFilter !== 'All' && String(tc?.status) !== statusFilter) return false
      if (priorityFilter !== 'All' && String(tc?.priority) !== priorityFilter) return false
      return true
    })
  }, [sortedList, search, statusFilter, priorityFilter])

  const visibleDocIds = useMemo(
    () =>
      filtered
        .map((tc) => (tc && tc.id != null ? String(tc.id) : ''))
        .filter((id) => id !== ''),
    [filtered],
  )

  const total = list.length
  const shown = filtered.length

  const nSelected = selectedIds.length
  const nSelectedRounded = Math.round(nSelected)

  const allVisibleSelected =
    visibleDocIds.length > 0 && visibleDocIds.every((id) => selectedIds.includes(id))
  const someVisibleSelected =
    visibleDocIds.some((id) => selectedIds.includes(id)) && !allVisibleSelected

  useEffect(() => {
    const el = selectAllRef.current
    if (el) {
      el.indeterminate = someVisibleSelected
    }
  }, [someVisibleSelected, selectionMode])

  useEffect(() => {
    if (!selectionMode) return
    const handler = (e) => {
      if (e.key === 'Escape') {
        setSelectionMode(false)
        setSelectedIds([])
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [selectionMode])

  useEffect(() => {
    if (!canBulkUpdate && selectionMode) {
      setSelectionMode(false)
      setSelectedIds([])
    }
  }, [canBulkUpdate, selectionMode])

  /**
   * Reloads per-row comment totals for the currently visible test case ids.
   */
  const refreshCommentCounts = useCallback(async () => {
    if (visibleDocIds.length === 0) {
      setCommentCounts({})
      return
    }
    try {
      const next = await fetchCommentCountsByTestCaseIds(visibleDocIds)
      setCommentCounts(next)
    } catch (err) {
      console.error('[TestCaseTable] refreshCommentCounts:', err)
      showToast(
        err instanceof Error ? err.message : 'Could not refresh comment counts.',
        'error',
      )
    }
  }, [visibleDocIds, showToast])

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      if (visibleDocIds.length === 0) {
        setCommentCounts({})
        return
      }
      try {
        const next = await fetchCommentCountsByTestCaseIds(visibleDocIds)
        if (!cancelled) setCommentCounts(next)
      } catch (err) {
        console.error('[TestCaseTable] comment counts:', err)
        if (!cancelled) {
          setCommentCounts({})
          showToast(
            err instanceof Error ? err.message : 'Could not load comment counts.',
            'error',
          )
        }
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [visibleDocIds, showToast])

  const buildActor = () => buildActivityActor(userProfile, user)

  const filterBarClass =
    'bg-white border-[0.5px] border-[#B0C0E0] text-[#1A3263] rounded-lg px-3 py-2 w-full sm:w-auto min-w-[10rem] focus:border-[#1A3263] focus:ring-2 focus:ring-[rgba(26,50,99,0.15)] outline-none transition placeholder:text-[#8A9BBF] hover:border-[#8A9BBF]'
  const searchClass =
    'bg-white border-[0.5px] border-[#B0C0E0] text-[#1A3263] rounded-lg px-3 py-2 w-full flex-1 min-w-[12rem] focus:border-[#1A3263] focus:ring-2 focus:ring-[rgba(26,50,99,0.15)] outline-none transition placeholder:text-[#8A9BBF] hover:border-[#8A9BBF]'

  /**
   * Toggles bulk selection mode and clears selection when closing.
   */
  const toggleSelectionMode = () => {
    setSelectionMode((prev) => !prev)
    setSelectedIds([])
    setConfirmDialog(null)
    setBulkTargetStatus(null)
  }

  /**
   * Toggles one row in the selection set (by Firestore document id).
   * @param {string} docId
   */
  const toggleRow = (docId) => {
    if (!docId) return
    setSelectedIds((prev) =>
      prev.includes(docId) ? prev.filter((id) => id !== docId) : [...prev, docId],
    )
  }

  /**
   * Selects or deselects all currently visible (filtered) rows.
   */
  const toggleSelectAll = () => {
    if (visibleDocIds.length === 0) return
    if (allVisibleSelected) {
      setSelectedIds((prev) => prev.filter((id) => !visibleDocIds.includes(id)))
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        for (const id of visibleDocIds) next.add(id)
        return Array.from(next)
      })
    }
  }

  /**
   * Cycles sort for a column: none → asc → desc → none.
   * @param {string} field
   */
  const handleSort = (field) => {
    setSortConfig((prev) => {
      if (prev.field !== field) {
        return { field, direction: 'asc' }
      }
      if (prev.direction === 'asc') {
        return { field, direction: 'desc' }
      }
      if (prev.direction === 'desc') {
        return { field: null, direction: null }
      }
      return { field, direction: 'asc' }
    })
  }

  /**
   * Duplicates a single test case in Firestore.
   * @param {Record<string, unknown>} testCase
   */
  const handleDuplicate = async (testCase) => {
    const uid = user?.uid
    if (!uid || !testCase?.id) {
      showToast('You must be signed in to duplicate a test case.', 'error')
      return
    }
    if (!projectId) {
      showToast('No active project.', 'error')
      return
    }
    setDuplicatingId(String(testCase.id))
    try {
      const who =
        user?.displayName && String(user.displayName).trim() !== ''
          ? String(user.displayName)
          : user?.email
            ? String(user.email)
            : 'Unknown'
      const result = await duplicateTestCase(uid, testCase, who, projectId)
      if (!result.success) {
        console.error('[TestCaseTable] duplicateTestCase:', result.error)
        showToast(result.error || 'Failed to duplicate test case. Try again.', 'error')
        return
      }
      const src =
        testCase.title != null && String(testCase.title).trim() !== ''
          ? String(testCase.title)
          : testCase.testTitle != null
            ? String(testCase.testTitle)
            : 'Untitled'
      const actor = buildActor()
      const newDocId = typeof result.id === 'string' ? result.id : ''
      const newHuman =
        typeof result.testCaseId === 'string' && result.testCaseId.trim() !== ''
          ? result.testCaseId.trim()
          : ''
      const sourceRef =
        testCase.testCaseId != null && String(testCase.testCaseId).trim() !== ''
          ? String(testCase.testCaseId).trim()
          : String(testCase.id ?? '')
      if (actor && newDocId) {
        void logActivity({
          action: 'testcase.duplicated',
          entityType: 'testCase',
          entityId: newDocId,
          entityRef: newHuman,
          actor,
          metadata: {
            sourceRef,
            title: `Copy of ${src}`,
          },
        })
      }
      showToast(`"Copy of ${src}" duplicated successfully`, 'success')
    } catch (err) {
      console.error('[TestCaseTable] handleDuplicate:', err)
      showToast('Failed to duplicate test case. Try again.', 'error')
    } finally {
      setDuplicatingId(null)
    }
  }

  /**
   * Opens confirmation for bulk status update.
   * @param {string} newStatus
   */
  const handleBulkUpdate = (newStatus) => {
    if (selectedIds.length === 0) return
    setConfirmDialog({
      status: newStatus,
      count: Math.round(selectedIds.length),
      docIds: [...selectedIds],
    })
  }

  /**
   * Applies bulk status after user confirms.
   */
  const confirmBulkUpdate = async () => {
    if (!confirmDialog || !confirmDialog.docIds || confirmDialog.docIds.length === 0) return
    const uid = user?.uid
    if (!uid) {
      showToast('You must be signed in to update test cases.', 'error')
      return
    }
    if (!projectId) {
      showToast('No active project.', 'error')
      return
    }

    const { status, count, docIds } = confirmDialog
    const displayLabel = statusDisplayLabel(status)

    setBulkLoading(true)
    setBulkTargetStatus(status)
    try {
      const result = await bulkUpdateStatus(uid, docIds, status, projectId)
      if (!result.success) {
        showToast(result.error || 'Failed to update. Please try again.', 'error')
        return
      }
      const actor = buildActor()
      if (actor) {
        const normalizedTo = status === 'Not Run' ? 'Not Executed' : String(status)
        void logActivity({
          action: 'testcase.bulk_status_changed',
          entityType: 'bulkUpdate',
          entityId: 'bulk',
          entityRef: 'Multiple',
          actor,
          changes: {
            field: 'status',
            from: 'mixed',
            to: normalizedTo,
            count: Math.round(docIds.length),
          },
        })
      }
      setConfirmDialog(null)
      setSelectionMode(false)
      setSelectedIds([])
      showToast(
        `Updated ${Math.round(count)} test case(s) to ${displayLabel}`,
        toastVariantForStatus(status),
      )
    } catch (err) {
      console.error('[TestCaseTable] confirmBulkUpdate:', err)
      showToast('Failed to update. Please try again.', 'error')
    } finally {
      setBulkLoading(false)
      setBulkTargetStatus(null)
    }
  }

  const cancelConfirm = () => {
    if (bulkLoading) return
    setConfirmDialog(null)
  }

  /**
   * Confirms delete from modal and calls Firestore delete.
   */
  const confirmDeleteTestCase = async () => {
    if (!deleteTarget || deleteTarget.id == null) return
    const docId = String(deleteTarget.id)
    setDeleteSubmitting(true)
    try {
      const result = await onDelete(docId)
      if (result && result.success === false) {
        showToast(
          typeof result.error === 'string' ? result.error : 'Could not delete test case.',
          'error',
        )
        return
      }
      setDeleteTarget(null)
    } catch (err) {
      console.error('[TestCaseTable] confirmDeleteTestCase:', err)
      showToast('Could not delete test case. Try again.', 'error')
    } finally {
      setDeleteSubmitting(false)
    }
  }

  const deleteModalDeleting =
    deleteSubmitting ||
    (Boolean(deleteTarget?.id) && deletingDocIds.has(String(deleteTarget.id)))

  const hasRowsToShow = !loading && shown > 0
  const bulkDisabled = nSelected === 0 || bulkLoading

  const sortChipVisible =
    Boolean(sortConfig.field && sortConfig.direction) && !loading && total > 0

  const detailPortal =
    selectedTestCase &&
    typeof document !== 'undefined' &&
    createPortal(
      <>
        <button
          type="button"
          className="fixed inset-0 z-[35] cursor-default border-0 bg-black/25 p-0"
          aria-label="Close test case details"
          onClick={() => setSelectedTestCase(null)}
        />
        <TestCaseDetailPanel
          testCase={selectedTestCase}
          onClose={() => setSelectedTestCase(null)}
          onCommentPosted={refreshCommentCounts}
        />
      </>,
      document.body,
    )

  const confirmModal =
    confirmDialog &&
    typeof document !== 'undefined' &&
    createPortal(
      <div
        className="fixed inset-0 z-[120] flex items-center justify-center px-4"
        style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
        role="presentation"
        onClick={cancelConfirm}
      >
        <div
          className="w-full max-w-[320px] rounded-[10px] border-[0.5px] border-[#B0C0E0] bg-white p-5 shadow-lg"
          role="dialog"
          aria-modal="true"
          aria-labelledby="bulk-confirm-title"
          onClick={(e) => e.stopPropagation()}
        >
          <h2 id="bulk-confirm-title" className="text-[13px] font-medium text-[#1A3263]">
            Update {Math.round(confirmDialog.count)} test case
            {Math.round(confirmDialog.count) === 1 ? '' : 's'} to &quot;
            {statusDisplayLabel(confirmDialog.status)}&quot;?
          </h2>
          <p className="mt-1 text-[11px] text-[#5A6E9A]">
            This will apply to every selected row.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              disabled={bulkLoading}
              onClick={cancelConfirm}
              className="rounded-md border-[0.5px] border-[#B0C0E0] bg-white px-3 py-1.5 text-[11px] font-medium text-[#5A6E9A] hover:bg-[#EEF2FB] disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={bulkLoading}
              onClick={() => void confirmBulkUpdate()}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-medium disabled:opacity-50 ${confirmUpdateButtonClass(confirmDialog.status)}`}
            >
              {bulkLoading && bulkTargetStatus === confirmDialog.status && (
                <span
                  className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent"
                  aria-hidden
                />
              )}
              Update {Math.round(confirmDialog.count)} Cases
            </button>
          </div>
        </div>
      </div>,
      document.body,
    )

  return (
    <div className="text-[#1A3263]" data-tour="testcase-table">
      {error ? (
        <div
          className="mb-4 rounded-lg px-4 py-3 text-sm border-l-4 bg-red-50 border-red-500 text-red-800 border border-red-200"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-xl border border-[#B0C0E0] bg-white shadow-sm py-16 px-6 text-center">
          <span
            className="inline-block w-10 h-10 border-2 border-[#1A3263] border-t-transparent rounded-full animate-spin"
            aria-hidden
          />
          <p className="text-[#5A6E9A] text-sm mt-4 font-mono">Loading test cases…</p>
        </div>
      ) : null}

      {!loading ? (
        <div className="flex flex-col lg:flex-row flex-wrap gap-3 mb-4 items-stretch lg:items-end">
          <label className="flex flex-col gap-1 flex-1 min-w-[12rem]">
            <span className="text-xs uppercase tracking-wider text-[#5A6E9A] font-mono">
              Search
            </span>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Title, module, ID, assigned to…"
              className={searchClass}
              autoComplete="off"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-wider text-[#5A6E9A] font-mono">
              Status
            </span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={filterBarClass}
            >
              {STATUS_FILTER_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-wider text-[#5A6E9A] font-mono">
              Priority
            </span>
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className={filterBarClass}
            >
              {PRIORITY_FILTER_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}

      {!loading && total > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h2 className="text-sm font-semibold text-[#1A3263]">
            All Test Cases ({Math.round(total)})
          </h2>
          {canBulkUpdate ? (
            <button
              type="button"
              onClick={toggleSelectionMode}
              className={`inline-flex items-center gap-1 rounded-md border-[0.5px] px-[10px] py-[5px] text-[11px] font-medium transition ${
                selectionMode
                  ? 'border-[#FCA5A5] bg-white text-[#DC2626]'
                  : 'border-[#B0C0E0] bg-white text-[#5A6E9A] hover:border-[#1A3263] hover:bg-[#EEF2FB]'
              }`}
            >
              {selectionMode ? (
                <>
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    className="h-3.5 w-3.5"
                    aria-hidden
                  >
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                  Cancel
                </>
              ) : (
                <>
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    className="h-3.5 w-3.5"
                    aria-hidden
                  >
                    <rect x="3" y="5" width="4" height="4" rx="1" />
                    <rect x="3" y="11" width="4" height="4" rx="1" />
                    <rect x="3" y="17" width="4" height="4" rx="1" />
                    <path d="M10 7h11M10 13h11M10 19h11" />
                  </svg>
                  Select
                </>
              )}
            </button>
          ) : null}
        </div>
      ) : null}

      {sortChipVisible && sortConfig.field && sortConfig.direction ? (
        <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border-[0.5px] border-[#B0C0E0] bg-[#EEF2FB] px-2.5 py-[3px] text-[10px] text-[#1A3263]">
          <span className="inline-flex items-center gap-1">
            {sortConfig.direction === 'asc' ? '↑' : '↓'} Sorted by:{' '}
            {SORT_FIELD_LABELS[sortConfig.field] ?? sortConfig.field} ({sortConfig.direction})
          </span>
          <button
            type="button"
            className="cursor-pointer text-[12px] leading-none text-[#5A6E9A] hover:text-[#1A3263]"
            aria-label="Clear sort"
            onClick={() => setSortConfig({ field: null, direction: null })}
          >
            ×
          </button>
        </div>
      ) : null}

      {selectionMode && hasRowsToShow ? (
        <div
          className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border-[0.5px] border-[#B0C0E0] bg-[#EEF2FB] px-[14px] py-2"
        >
          <label className="inline-flex cursor-pointer items-center gap-2">
            <span
              className={`relative flex h-[14px] w-[14px] shrink-0 items-center justify-center rounded border-[0.5px] ${
                allVisibleSelected
                  ? 'border-[#122247] bg-[#1A3263]'
                  : someVisibleSelected
                    ? 'border-[#1A3263] bg-[#D6E0F5]'
                    : 'border-[#B0C0E0] bg-white'
              }`}
            >
              <input
                ref={selectAllRef}
                type="checkbox"
                checked={allVisibleSelected}
                onChange={toggleSelectAll}
                className="absolute h-full w-full cursor-pointer opacity-0"
                aria-label="Select all visible test cases"
              />
              {allVisibleSelected && (
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="white"
                  strokeWidth="3"
                  className="h-2.5 w-2.5 pointer-events-none"
                  aria-hidden
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
              {someVisibleSelected && !allVisibleSelected && (
                <span className="pointer-events-none text-[10px] font-bold text-[#1A3263]">
                  —
                </span>
              )}
            </span>
            <span className="text-[12px] text-[#1A3263]">
              {nSelectedRounded > 0 ? `${nSelectedRounded} selected` : 'Select all'}
            </span>
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-[11px] text-[#5A6E9A]">Update status to:</span>
            <button
              type="button"
              disabled={bulkDisabled}
              onClick={() => handleBulkUpdate('Pass')}
              className="inline-flex items-center gap-1 rounded-md border-[0.5px] border-[#16A34A] bg-[#DCFCE7] px-[10px] py-[5px] text-[11px] font-medium text-[#166534] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {bulkLoading && bulkTargetStatus === 'Pass' ? (
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-[#166534] border-t-transparent" />
              ) : (
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#16A34A"
                  strokeWidth="2"
                  className="h-3 w-3"
                  aria-hidden
                >
                  <path d="M5 12l5 5L20 7" />
                </svg>
              )}
              Pass
            </button>
            <button
              type="button"
              disabled={bulkDisabled}
              onClick={() => handleBulkUpdate('Fail')}
              className="inline-flex items-center gap-1 rounded-md border-[0.5px] border-[#DC2626] bg-[#FEE2E2] px-[10px] py-[5px] text-[11px] font-medium text-[#991B1B] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {bulkLoading && bulkTargetStatus === 'Fail' ? (
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-[#991B1B] border-t-transparent" />
              ) : (
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#DC2626"
                  strokeWidth="2"
                  className="h-3 w-3"
                  aria-hidden
                >
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              )}
              Fail
            </button>
            <button
              type="button"
              disabled={bulkDisabled}
              onClick={() => handleBulkUpdate('Blocked')}
              className="inline-flex items-center gap-1 rounded-md border-[0.5px] border-[#D97706] bg-[#FEF3C7] px-[10px] py-[5px] text-[11px] font-medium text-[#92400E] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {bulkLoading && bulkTargetStatus === 'Blocked' ? (
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-[#92400E] border-t-transparent" />
              ) : (
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#D97706"
                  strokeWidth="2"
                  className="h-3 w-3"
                  aria-hidden
                >
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 8v5M12 16h.01" />
                </svg>
              )}
              Blocked
            </button>
            <button
              type="button"
              disabled={bulkDisabled}
              onClick={() => handleBulkUpdate('Not Run')}
              className="inline-flex items-center gap-1 rounded-md border-[0.5px] border-[#B0C0E0] bg-[#EEF2FB] px-[10px] py-[5px] text-[11px] font-medium text-[#1A3263] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {bulkLoading && bulkTargetStatus === 'Not Run' ? (
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-[#1A3263] border-t-transparent" />
              ) : (
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#9CA3AF"
                  strokeWidth="2"
                  className="h-3 w-3"
                  aria-hidden
                >
                  <path d="M5 12h14" />
                </svg>
              )}
              Not Run
            </button>
          </div>
        </div>
      ) : null}

      {!loading ? (
        <p className="text-sm text-[#5A6E9A] mb-3">
          Showing {Math.round(shown)} of {Math.round(total)} test case{total === 1 ? '' : 's'}
        </p>
      ) : null}

      {/* Empty state: truly no test cases in the project */}
      {!loading && total === 0 ? (
        <div className="rounded-xl border border-[#B0C0E0] bg-white shadow-sm py-16 px-6 text-center">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="#B0C0E0"
            strokeWidth="1.8"
            className="mx-auto h-10 w-10 mb-4"
            aria-hidden
          >
            <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            <path d="M12 11v4M12 9h.01" />
          </svg>
          <h2 className="text-base font-semibold text-[#1A3263] mb-1">No test cases yet</h2>
          <p className="text-sm text-[#5A6E9A] max-w-sm mx-auto mb-5">
            Create your first test case manually or let AI generate them for you.
          </p>
          {canCreate && (
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                id="empty-state-create-manually-btn"
                onClick={() => {
                  /* navigate to New tab handled by parent — emit a custom event */
                  window.dispatchEvent(new CustomEvent('testforge:navigate', { detail: 'new' }))
                }}
                className="px-5 py-2.5 rounded-lg bg-white border-[0.5px] border-[#B0C0E0] text-[#1A3263] text-sm font-semibold hover:bg-[#EEF2FB] hover:border-[#4169C4] transition"
              >
                + Create Manually
              </button>
              {aiCtx && canAIGenerate && (
                <button
                  type="button"
                  id="empty-state-ai-generate-btn"
                  onClick={aiCtx.openModal}
                  className="px-5 py-2.5 rounded-lg bg-[#1A3263] hover:bg-[#122247] text-white text-sm font-semibold transition"
                >
                  ✨ Generate with AI
                </button>
              )}
            </div>
          )}
        </div>
      ) : null}

      {/* Empty state: test cases exist but filters hide them all */}
      {!loading && total > 0 && shown === 0 ? (
        <div className="rounded-xl border border-[#B0C0E0] bg-white shadow-sm py-12 px-6 text-center">
          <div className="text-3xl mb-3" aria-hidden>🔍</div>
          <p className="text-[#5A6E9A] text-sm max-w-md mx-auto">
            No test cases match the current filters.
          </p>
        </div>
      ) : null}

      {!loading && shown > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-[#D6E0F5] shadow-sm">
          <table className="w-full min-w-[1040px] border-collapse text-left">
            <thead className="sticky top-0 z-10 bg-[#1A3263] text-white shadow-sm">
              <tr>
                {selectionMode ? (
                  <th className="w-10 py-2 px-2 border-b border-[#D6E0F5]" aria-label="Select" />
                ) : null}
                {TABLE_HEADER_COLS.map((col) => {
                  const sf = col.sortField
                  const sortable = col.sortable && sf
                  const activeDir =
                    sortable && sortConfig.field === sf ? sortConfig.direction : null
                  if (!sortable) {
                    return (
                      <th
                        key={col.label}
                        className="py-2 px-3 text-xs uppercase tracking-wider font-mono border-b border-[#D6E0F5] whitespace-nowrap text-white font-medium"
                      >
                        {col.label}
                      </th>
                    )
                  }
                  return (
                    <th key={col.label} className="border-b border-[#D6E0F5] p-0">
                      <button
                        type="button"
                        onClick={() => handleSort(sf)}
                        title="Click to sort"
                        className="flex w-full items-center gap-1 py-2 px-3 text-left text-xs uppercase tracking-wider font-mono font-medium text-white hover:bg-[#122247] select-none cursor-pointer"
                      >
                        {col.label}
                        <SortHeaderIcons activeDirection={activeDir} />
                      </button>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {filtered.map((tc) => (
                <TestCaseRow
                  key={tc?.id ?? tc?.testCaseId ?? JSON.stringify(tc)}
                  testCase={tc}
                  onEdit={onEdit}
                  onRequestDelete={(row) => setDeleteTarget(row)}
                  onDuplicate={canDuplicate ? handleDuplicate : undefined}
                  showEdit={canEdit}
                  showDelete={canDelete}
                  canAssign={canAssign}
                  isDeleting={deletingDocIds && tc?.id ? deletingDocIds.has(String(tc.id)) : false}
                  isDuplicating={Boolean(tc?.id && duplicatingId === String(tc.id))}
                  selectionMode={selectionMode && canBulkUpdate}
                  selected={Boolean(tc?.id && selectedIds.includes(String(tc.id)))}
                  onToggleSelect={toggleRow}
                  commentCount={tc?.id != null ? commentCounts[String(tc.id)] ?? 0 : 0}
                  onOpenDetail={(row) => setSelectedTestCase(row)}
                  detailOpenDisabled={Boolean(selectionMode && canBulkUpdate)}
                />
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {confirmModal}
      {detailPortal}

      <DeleteConfirmModal
        testCase={deleteTarget}
        onClose={() => {
          if (!deleteModalDeleting) setDeleteTarget(null)
        }}
        onConfirm={() => void confirmDeleteTestCase()}
        isDeleting={deleteModalDeleting}
      />
    </div>
  )
}
