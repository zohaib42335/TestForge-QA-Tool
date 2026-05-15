/**
 * @fileoverview Firestore schema documentation and path/field constants for QA TestForge.
 *
 * =============================================================================
 * PROJECT / WORKSPACE MODEL
 * =============================================================================
 *
 * Each **project** is the tenant boundary for QA data. A user belongs to **at most one**
 * project at a time; `users/{uid}.projectId` is the source of truth for membership
 * (`null` means the user must create or join a workspace).
 *
 * - **Owner** (creator): creates the project on first login when they have no `projectId`.
 * - **Invitees**: join via `projects/{projectId}/invites/{inviteId}`; they cannot create
 *   a new project while the product enforces a single membership (see security rules).
 *
 * Paths
 * -----
 *
 * **Project** — `projects/{projectId}`
 * - `name`, `description` (optional), `slug`, `ownerId`, `createdAt`, `updatedAt`
 * - `plan`: `'free'` | `'pro'` (default `'free'`), `logoUrl` (optional)
 * - `settings`: `allowMemberInvites` (default false), `requireApproval`
 *
 * **Members** — `projects/{projectId}/members/{uid}`
 * - `uid`, `email`, `displayName`, `photoURL`, `role`, `joinedAt`, `invitedBy`, `status`
 *
 * **Invites** — `projects/{projectId}/invites/{inviteId}`
 * - `email`, `role`, `invitedBy`, `invitedAt`, `status`, `token`, `expiresAt`
 *
 * **User profile** — `users/{uid}`
 * - `projectId` (string | null), `role`, `onboardingComplete`, `createdAt`, `lastLoginAt`, …
 *
 * **Data under the project** (see `firestore.rules` for full list)
 * - `testCases`, `testRuns`, `bugs` (+ `bugs/{id}/comments`), `notificationSettings`,
 *   `aiGenerationLogs`, `aiPromptTemplates`, `meta`, `integrations`
 *
 * **Per-user data** (not tenant-scoped)
 * - `users/{uid}/templates`
 *
 * Deploy: `firebase deploy --only firestore:rules,firestore:indexes`
 *
 * @see ./firestore.js for read/write helpers
 */

/** Logical schema version stored on documents when we need migrations later. */
export const SCHEMA_VERSION = 1

/** Top-level collection for per-user data. */
export const COL_USERS = 'users'

/** Top-level projects/workspaces collection (path: projects/{projectId}). */
export const COL_PROJECTS = 'projects'

/**
 * Top-level workspace test case library (path: testCases/{docId}).
 * Target layout: `projects/{projectId}/testCases/{docId}`. This constant remains for legacy paths.
 */
export const COL_TEST_CASES_ROOT = 'testCases'

/** Subcollection name (legacy segment name only; live data uses {@link COL_TEST_CASES_ROOT}). */
export const SUB_TEST_CASES = 'testCases'

/** Subcollection name for templates (path: users/{uid}/templates/{docId}). */
export const SUB_TEMPLATES = 'templates'

/** Subcollection name for test runs (path: `projects/{projectId}/testRuns/{docId}`). */
export const SUB_TEST_RUNS = 'testRuns'

/** Subcollection name for per-run test results (path: `projects/{projectId}/testRunResults/{docId}`). */
export const SUB_TEST_RUN_RESULTS = 'testRunResults'

/** Top-level collection for thread comments on test cases (path: comments/{docId}). */
export const COL_COMMENTS = 'comments'

/** Top-level append-only activity / audit log (path: activityLogs/{docId}). */
export const COL_ACTIVITY_LOGS = 'activityLogs'

/**
 * Returns Firestore path to the user root document (profile).
 * @param {string} userId - Firebase Auth uid
 * @returns {string}
 */
export function pathUserDoc(userId) {
  return `${COL_USERS}/${userId}`
}

/**
 * Collection reference path string to user's test cases (for documentation only).
 * @param {string} userId
 * @returns {string}
 */
export function pathUserTestCases(userId) {
  return `${COL_USERS}/${userId}/${SUB_TEST_CASES}`
}

/**
 * @returns {string} Firestore path segment for the shared test case collection (`testCases`).
 */
export function pathWorkspaceTestCases() {
  return COL_TEST_CASES_ROOT
}

/**
 * @param {string} projectId
 * @returns {string}
 */
export function pathProjectDoc(projectId) {
  return `${COL_PROJECTS}/${projectId}`
}

/**
 * @param {string} projectId
 * @param {string} subCollection
 * @returns {string}
 */
export function pathProjectSubcollection(projectId, subCollection) {
  return `${COL_PROJECTS}/${projectId}/${subCollection}`
}

/**
 * Collection reference path string to user's templates.
 * @param {string} userId
 * @returns {string}
 */
export function pathUserTemplates(userId) {
  return `${COL_USERS}/${userId}/${SUB_TEMPLATES}`
}

/**
 * Standard fields persisted on each test case document (camelCase, aligned with app + export).
 * Timestamps `createdAt` / `updatedAt` are server-written in firestore.js.
 * `ownerId` duplicates Auth uid for rules helpers and future collectionGroup queries.
 *
 * @type {readonly string[]}
 */
export const TEST_CASE_DOCUMENT_FIELDS = Object.freeze([
  'schemaVersion',
  'ownerId',
  'testCaseId',
  'module',
  'title',
  'description',
  'preconditions',
  'testSteps',
  'expectedResult',
  'actualResult',
  'status',
  'priority',
  'severity',
  'testType',
  'environment',
  'assignedTo',
  'createdBy',
  'createdDate',
  'executionDate',
  'comments',
  'automationStatus',
  'bugId',
  'createdAt',
  'updatedAt',
])

/**
 * Template documents: metadata + `defaults` map mirroring a subset of test case fields.
 *
 * @type {readonly string[]}
 */
export const TEMPLATE_DOCUMENT_FIELDS = Object.freeze([
  'schemaVersion',
  'ownerId',
  'name',
  'description',
  'defaults',
  'createdAt',
  'updatedAt',
])

/**
 * User profile fields on `users/{uid}` (single doc). `projectId` is the source of truth
 * for which workspace the user belongs to (at most one).
 *
 * @type {readonly string[]}
 */
export const PROFILE_DOCUMENT_FIELDS = Object.freeze([
  'schemaVersion',
  'uid',
  'email',
  'displayName',
  'photoURL',
  'projectId',
  'role',
  'onboardingComplete',
  'createdAt',
  'lastLoginAt',
  'preferences',
  'updatedAt',
  'createdDate',
  'assignedBy',
])
