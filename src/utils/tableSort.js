/**
 * @fileoverview Sort helpers and localStorage persistence for the View All test case table.
 */

/** localStorage key for saved sort preference */
export const SORT_STORAGE_KEY = 'testforge_sort_preference'

/** @type {Record<string, string>} */
export const SORT_FIELD_LABELS = {
  testCaseId: 'Test Case ID',
  testTitle: 'Test Title',
  testSuite: 'Test Suite',
  status: 'Status',
  priority: 'Priority',
  severity: 'Severity',
  testType: 'Test Type',
  createdDate: 'Created Date',
}

/** Fields allowed in sortConfig.field (aligned with persisted JSON). */
export const SORTABLE_FIELDS = [
  'testCaseId',
  'testTitle',
  'testSuite',
  'status',
  'priority',
  'severity',
  'testType',
  'createdDate',
]

/** @type {Record<string, number>} */
export const STATUS_ORDER = {
  'Not Run': 1,
  'Not Executed': 1,
  Blocked: 2,
  Fail: 3,
  Pass: 4,
}

/** @type {Record<string, number>} */
export const PRIORITY_ORDER = {
  Critical: 1,
  High: 2,
  Medium: 3,
  Low: 4,
}

/** @type {Record<string, number>} */
export const SEVERITY_ORDER = {
  Critical: 1,
  Major: 2,
  Minor: 3,
  Trivial: 4,
}

/**
 * Reads persisted sort preference from localStorage.
 * @returns {{ field: string|null, direction: 'asc'|'desc'|null }}
 */
export function getInitialSort() {
  try {
    const saved = localStorage.getItem(SORT_STORAGE_KEY)
    if (!saved) return { field: null, direction: null }
    const p = JSON.parse(saved)
    if (p && typeof p === 'object') {
      if (p.field == null && p.direction == null) {
        return { field: null, direction: null }
      }
      const field = p.field == null ? null : String(p.field)
      const direction = p.direction == null ? null : String(p.direction)
      const okDir = direction === 'asc' || direction === 'desc'
      const okField = Boolean(field) && SORTABLE_FIELDS.includes(field)
      if (okField && okDir) return { field, direction }
    }
  } catch (err) {
    console.warn('[tableSort] getInitialSort:', err)
  }
  return { field: null, direction: null }
}

/**
 * Numeric part of TC-### for ordering.
 * @param {unknown} id
 * @returns {number}
 */
export function getNumericId(id) {
  const s = id == null ? '' : String(id)
  const match = s.match(/\d+/)
  if (!match) return 0
  const n = parseInt(match[0], 10)
  return Number.isNaN(n) ? 0 : n
}

/**
 * Resolves a comparable value from a row for the logical sort field.
 * @param {Record<string, unknown>} tc
 * @param {string} field
 * @returns {string|number}
 */
export function getSortValue(tc, field) {
  if (field === 'testTitle') {
    const v = tc?.title ?? tc?.testTitle
    return v == null ? '' : String(v)
  }
  if (field === 'testSuite') {
    const v = tc?.module ?? tc?.testSuite
    return v == null ? '' : String(v)
  }
  if (field === 'createdDate') {
    const v = tc?.createdDate
    if (v == null || v === '') return 0
    const t = new Date(String(v)).getTime()
    return Number.isNaN(t) ? 0 : t
  }
  const v = tc?.[field]
  return v == null ? '' : String(v)
}

/**
 * Returns a new array sorted by sortConfig (stable copy). If no sort, returns a shallow copy of items.
 * @param {Array<Record<string, unknown>>} items
 * @param {{ field: string|null, direction: 'asc'|'desc'|null }} sortConfig
 * @returns {Array<Record<string, unknown>>}
 */
export function sortTestCasesList(items, sortConfig) {
  const list = Array.isArray(items) ? items : []
  if (!sortConfig?.field || !sortConfig?.direction) {
    return [...list]
  }
  const field = sortConfig.field
  const dir = sortConfig.direction === 'asc' ? 1 : -1

  return [...list].sort((a, b) => {
    if (field === 'testCaseId') {
      const av = getNumericId(getSortValue(a, 'testCaseId'))
      const bv = getNumericId(getSortValue(b, 'testCaseId'))
      return (av - bv) * dir
    }
    if (field === 'status') {
      const aVal = String(getSortValue(a, 'status'))
      const bVal = String(getSortValue(b, 'status'))
      return ((STATUS_ORDER[aVal] ?? 99) - (STATUS_ORDER[bVal] ?? 99)) * dir
    }
    if (field === 'priority') {
      const aVal = String(getSortValue(a, 'priority'))
      const bVal = String(getSortValue(b, 'priority'))
      return ((PRIORITY_ORDER[aVal] ?? 99) - (PRIORITY_ORDER[bVal] ?? 99)) * dir
    }
    if (field === 'severity') {
      const aVal = String(getSortValue(a, 'severity'))
      const bVal = String(getSortValue(b, 'severity'))
      return ((SEVERITY_ORDER[aVal] ?? 99) - (SEVERITY_ORDER[bVal] ?? 99)) * dir
    }
    if (field === 'createdDate') {
      const av = /** @type {number} */ (getSortValue(a, 'createdDate'))
      const bv = /** @type {number} */ (getSortValue(b, 'createdDate'))
      return (av - bv) * dir
    }
    const aVal = String(getSortValue(a, field))
    const bVal = String(getSortValue(b, field))
    return aVal.localeCompare(bVal, undefined, { sensitivity: 'base' }) * dir
  })
}
