/**
 * TestCaseRow — Table row for a single test case.
 * @param {Object} props
 * @param {Object} props.testCase - Test case data
 * @param {Function} props.onEdit - Called with testCase when Edit clicked
 * @param {Function} props.onRequestDelete - Opens delete confirmation (parent shows modal)
 * @param {Function} [props.onDuplicate] - Called with testCase when Duplicate clicked
 * @param {boolean} [props.isDeleting]
 * @param {boolean} [props.isDuplicating]
 * @param {boolean} [props.selectionMode]
 * @param {boolean} [props.selected]
 * @param {(docId: string) => void} [props.onToggleSelect]
 */

import StatusBadge from './StatusBadge.jsx'

/**
 * @param {string} text
 * @param {number} max
 * @returns {string}
 */
function truncateTitle(text, max) {
  const s = text == null ? '' : String(text)
  if (s.length <= max) return s
  return `${s.slice(0, max)}…`
}

/**
 * @param {unknown} v
 * @returns {string}
 */
function formatCreatedDate(v) {
  if (v == null || v === '') return '—'
  const d = new Date(String(v))
  if (Number.isNaN(d.getTime())) {
    const s = String(v)
    return s.length > 12 ? s.slice(0, 10) : s || '—'
  }
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

/**
 * @param {Object} props
 * @param {Object} props.testCase
 * @param {Function} props.onEdit
 * @param {Function} props.onRequestDelete
 * @param {Function} [props.onDuplicate]
 * @param {boolean} [props.isDeleting]
 * @param {boolean} [props.isDuplicating]
 * @param {boolean} [props.selectionMode]
 * @param {boolean} [props.selected]
 * @param {(docId: string) => void} [props.onToggleSelect]
 * @param {boolean} [props.showEdit]
 * @param {boolean} [props.showDelete]
 * @param {number} [props.commentCount] - Firestore `comments` count for this row (badge when &gt; 0)
 * @param {(row: Record<string, unknown>) => void} [props.onOpenDetail] - Opens slide-out (ignored when `detailOpenDisabled`)
 * @param {boolean} [props.detailOpenDisabled] - When true, row clicks do not open the detail panel
 */
export default function TestCaseRow({
  testCase,
  onEdit,
  onRequestDelete,
  onDuplicate,
  isDeleting = false,
  isDuplicating = false,
  selectionMode = false,
  selected = false,
  onToggleSelect,
  showEdit = true,
  showDelete = true,
  commentCount = 0,
  onOpenDetail,
  detailOpenDisabled = false,
}) {
  const id = testCase?.testCaseId ?? ''
  const docId = testCase?.id ?? null
  const title = testCase?.title ?? ''
  const titleShort = truncateTitle(title, 40)

  const rowBg =
    selectionMode && selected
      ? 'bg-[#EEF2FB]'
      : selectionMode
        ? 'bg-white'
        : 'odd:bg-white even:bg-[#EEF2FB]'

  const rowClickable = typeof onOpenDetail === 'function' && !detailOpenDisabled

  /**
   * Opens the detail panel unless the click originated inside `[data-stop-row-open]`.
   * @param {Object} e - React mouse event on `<tr>`
   */
  const handleRowClick = (e) => {
    if (!rowClickable || !testCase) return
    const t = e.target
    if (!(t instanceof Element)) return
    if (t.closest('button') || t.closest('a') || t.closest('[data-stop-row-open]')) return
    onOpenDetail(testCase)
  }

  return (
    <tr
      className={`${rowBg} hover:bg-[#D6E0F5] transition ${rowClickable ? 'cursor-pointer' : ''}`}
      onClick={handleRowClick}
    >
      {selectionMode && (
        <td
          className="py-3 px-2 w-10 border-b border-[#D6E0F5] align-middle"
          data-stop-row-open
        >
          <button
            type="button"
            role="checkbox"
            aria-checked={selected}
            onClick={() => docId && onToggleSelect && onToggleSelect(String(docId))}
            className={`flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-[3px] border-[0.5px] border-[#B0C0E0] transition ${
              selected
                ? 'border-[#122247] bg-[#1A3263]'
                : 'bg-white hover:border-[#1A3263] hover:bg-[#EEF2FB]'
            }`}
          >
            {selected && (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth="3"
                className="h-2.5 w-2.5"
                aria-hidden
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </button>
        </td>
      )}
      <td className="py-3 px-4 text-sm text-[#1A3263] border-b border-[#D6E0F5] font-mono">
        {id || '—'}
      </td>
      <td className="py-3 px-4 text-sm text-[#1A3263] border-b border-[#D6E0F5]">
        {testCase?.module ?? '—'}
      </td>
      <td
        className="py-3 px-4 text-sm text-[#1A3263] border-b border-[#D6E0F5] max-w-[14rem]"
        title={title}
      >
        {titleShort || '—'}
      </td>
      <td className="py-3 px-4 text-sm border-b border-[#D6E0F5]">
        <StatusBadge value={testCase?.priority} type="priority" />
      </td>
      <td className="py-3 px-4 text-sm border-b border-[#D6E0F5]">
        <StatusBadge value={testCase?.severity} type="severity" />
      </td>
      <td className="py-3 px-4 text-sm border-b border-[#D6E0F5]">
        <StatusBadge value={testCase?.status} type="status" />
      </td>
      <td className="py-3 px-4 text-sm text-[#1A3263] border-b border-[#D6E0F5]">
        {testCase?.testType ?? '—'}
      </td>
      <td className="py-3 px-4 text-sm text-[#1A3263] border-b border-[#D6E0F5]">
        {testCase?.assignedTo ?? '—'}
      </td>
      <td className="py-3 px-4 text-sm text-[#1A3263] border-b border-[#D6E0F5] whitespace-nowrap">
        {formatCreatedDate(testCase?.createdDate)}
      </td>
      <td
        className="py-3 px-4 text-sm border-b border-[#D6E0F5] whitespace-nowrap"
        data-stop-row-open
      >
        {commentCount > 0 ? (
          <span
            className="mr-2 inline-flex items-center gap-0.5 rounded-[99px] border-[0.5px] border-[#B0C0E0] bg-[#EEF2FB] px-[6px] py-[2px] text-[10px] font-semibold text-[#1A3263]"
            title={`${commentCount} comment${commentCount === 1 ? '' : 's'}`}
          >
            <svg
              viewBox="0 0 24 24"
              className="h-3 w-3 shrink-0"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              aria-hidden
            >
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
            </svg>
            {commentCount}
          </span>
        ) : null}
        {showEdit ? (
          <button
            type="button"
            onClick={() => onEdit(testCase)}
            disabled={isDeleting || isDuplicating}
            className="mr-2 px-3 py-1 rounded-lg text-xs font-semibold text-[#1A3263] hover:text-[#122247] transition disabled:opacity-50"
          >
            Edit
          </button>
        ) : null}
        {typeof onDuplicate === 'function' && (
          <button
            type="button"
            title="Duplicate test case"
            aria-label="Duplicate test case"
            disabled={isDeleting || isDuplicating || !docId}
            onClick={() => onDuplicate(testCase)}
            className="mr-2 inline-flex h-7 w-7 items-center justify-center rounded-md border-[0.5px] border-[#B0C0E0] bg-white text-[#5A6E9A] transition ease-in-out duration-150 hover:border-[#1A3263] hover:bg-[#EEF2FB] hover:text-[#1A3263] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isDuplicating ? (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="h-[13px] w-[13px] animate-spin"
                aria-hidden
              >
                <path
                  d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  opacity="0.25"
                />
                <path d="M21 12a9 9 0 00-9-9" />
              </svg>
            ) : (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                className="h-[13px] w-[13px]"
                aria-hidden
              >
                <rect x="9" y="9" width="13" height="13" rx="2" />
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
              </svg>
            )}
          </button>
        )}
        {showDelete ? (
          <button
            type="button"
            onClick={() => typeof onRequestDelete === 'function' && onRequestDelete(testCase)}
            disabled={isDeleting || isDuplicating}
            className="px-3 py-1 rounded-lg text-xs font-semibold text-red-500 hover:text-red-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isDeleting ? 'Deleting…' : 'Delete'}
          </button>
        ) : null}
      </td>
    </tr>
  )
}
