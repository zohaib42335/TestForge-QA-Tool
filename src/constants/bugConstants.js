/**
 * @fileoverview Display constants for the Bug Tracker feature.
 * Maps bug statuses, severities, and priorities to UI color classes.
 */

/**
 * CSS badge color classes per bug status.
 * Values are plain CSS class strings (not Tailwind) so they work with the
 * existing project styling approach.
 *
 * @type {Record<import('../types/bug.types.js').BugStatus, { bg: string, text: string, border: string }>}
 */
export const STATUS_COLORS = {
  Open:          { bg: 'bg-red-100',    text: 'text-red-700',    border: 'border-red-200'    },
  'In Progress': { bg: 'bg-blue-100',   text: 'text-blue-700',   border: 'border-blue-200'   },
  Fixed:         { bg: 'bg-green-100',  text: 'text-green-700',  border: 'border-green-200'  },
  Closed:        { bg: 'bg-gray-100',   text: 'text-gray-600',   border: 'border-gray-200'   },
  "Won't Fix":   { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-200' },
}

/**
 * CSS badge color classes per bug severity.
 *
 * @type {Record<import('../types/bug.types.js').BugSeverity, { bg: string, text: string, border: string }>}
 */
export const SEVERITY_COLORS = {
  Critical: { bg: 'bg-red-100',    text: 'text-red-700',    border: 'border-red-200'    },
  High:     { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-200' },
  Medium:   { bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-200' },
  Low:      { bg: 'bg-gray-100',   text: 'text-gray-600',   border: 'border-gray-200'   },
}

/**
 * Maps a test case priority string to a bug severity string.
 *
 * @type {Record<string, import('../types/bug.types.js').BugSeverity>}
 */
export const PRIORITY_MAP = {
  Critical: 'Critical',
  High:     'High',
  Medium:   'Medium',
  Low:      'Low',
}

/**
 * All valid bug statuses in display order.
 * @type {import('../types/bug.types.js').BugStatus[]}
 */
export const BUG_STATUSES = ['Open', 'In Progress', 'Fixed', 'Closed', "Won't Fix"]

/**
 * All valid severity/priority levels in display order.
 * @type {import('../types/bug.types.js').BugSeverity[]}
 */
export const BUG_SEVERITIES = ['Critical', 'High', 'Medium', 'Low']

/**
 * Common environment options shown in dropdowns.
 * @type {string[]}
 */
export const BUG_ENVIRONMENTS = ['Local', 'Staging', 'Production', 'QA', 'Development']
