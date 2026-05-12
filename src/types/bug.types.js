/**
 * @fileoverview Type definitions for the Bug Tracker feature.
 * @typedef {Object} Bug
 * @property {string} id - Firestore document ID
 * @property {string} bugId - Human-readable ID e.g. "BUG-001"
 * @property {string} title
 * @property {string} description
 * @property {string[]} stepsToReproduce
 * @property {BugSeverity} severity
 * @property {BugStatus} status
 * @property {BugPriority} priority
 * @property {string[]} linkedTestCaseIds
 * @property {string|null} linkedTestRunId
 * @property {string} environment
 * @property {string|null} assignedTo
 * @property {string} reportedBy
 * @property {import('firebase/firestore').Timestamp|null} createdAt
 * @property {import('firebase/firestore').Timestamp|null} updatedAt
 * @property {import('firebase/firestore').Timestamp|null} resolvedAt
 * @property {string[]} tags
 * @property {string[]} attachments
 */

/**
 * @typedef {'Open'|'In Progress'|'Fixed'|'Closed'|"Won't Fix"} BugStatus
 */

/**
 * @typedef {'Critical'|'High'|'Medium'|'Low'} BugSeverity
 */

/**
 * @typedef {'Critical'|'High'|'Medium'|'Low'} BugPriority
 */

/**
 * @typedef {Object} BugComment
 * @property {string} id - Firestore document ID
 * @property {string} text
 * @property {string} createdBy - Firebase UID
 * @property {import('firebase/firestore').Timestamp|null} createdAt
 */

// This file provides JSDoc typedefs only — no runtime exports needed.
export {}
