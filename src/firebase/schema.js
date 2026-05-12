/**
 * @fileoverview Firestore schema documentation and path/field constants for QA TestForge.
 *
 * =============================================================================
 * STEP 2 — SCHEMA RATIONALE (high level)
 * =============================================================================
 *
 * Why Firestore instead of Realtime Database?
 * ------------------------------------------
 * - **Document model** maps naturally to “test case” and “template” records with many
 *   named fields, validation, and future queries (e.g. by status, suite, dates).
 * - **Offline persistence** and batched writes are first-class in the client SDK.
 * - **Security rules** can scope reads/writes by path (`users/{uid}/...`) without relying
 *   solely on client-supplied `ownerId` fields (though we still store `ownerId` on docs
 *   for debugging and optional collection-group queries later).
 * - **Indexes** and compound queries are explicit and manageable as the app grows.
 *
 * Realtime DB is still fine for sync-heavy, deeply nested JSON with fewer constraints;
 * this app is closer to “CRUD + lists + auth,” which fitsFirestore better.
 *
 * Why nest under `users/{uid}/...` (subcollections)?
 * -------------------------------------------------
 * - **Security rules** are trivial and safe: only the authenticated user may access paths
 *   where `request.auth.uid == userId`.
 * - **Multi-tenant isolation**: no risk of listing another user’s cases because there is
 *   no shared top-level `testCases` collection keyed only by a field.
 * - **Lifecycle**: exporting or deleting a user’s cloud-owned data is scoped to one tree.
 * - **Trade-off**: you cannot query “all test cases in the project” without admin SDK or
 *   collection groups — not required for this product.
 *
 * Alternative (flat collections): `testCases/{id}` with `ownerId` + composite indexes.
 * That scales for very large multi-tenant SaaS but needs stricter rules and index hygiene.
 *
 * Data layout
 * -----------
 *   users/{userId}                    → profile document (optional fields, see PROFILE_FIELDS)
 *   testCases/{docId}                 → **workspace-wide** test case library (all roles read; Admin/QA Lead write)
 *   users/{userId}/templates/{docId} → one document per custom template
 *
 * Document IDs are Firestore-generated unless you pass a custom ID in helpers that support it.
 * The human-readable `testCaseId` (e.g. TC-001) is stored **as a field** alongside `id` / doc id
 * returned from reads so Step 3 can keep the current UI behavior.
 *
 * =============================================================================
 * DEPLOY RULES & VERIFY (before Step 3)
 * =============================================================================
 * 1. Install Firebase CLI: `npm i -g firebase-tools` then `firebase login`.
 * 2. In project root: `firebase use --add` and select your Firebase project.
 * 3. Deploy rules + indexes: `firebase deploy --only firestore:rules,firestore:indexes`
 * 4. In Firebase Console → Firestore Database:
 *    - Confirm rules show your deployed version (no “test mode” for production).
 *    - Under **Data**, you should see no collections until the app writes; optionally
 *      create one manual doc under `users/{yourAuthUid}/testCases` with the console
 *      to verify rules allow your user only.
 * 5. Rules simulator (Console → Firestore → Rules → Rules playground): simulate `get`/`create`
 *    on `users/{uid}/testCases/{id}` as authenticated uid matching path.
 *
 * @see ../firestore.js for all read/write helpers
 */

/** Logical schema version stored on documents when we need migrations later. */
export const SCHEMA_VERSION = 1

/** Top-level collection for per-user data. */
export const COL_USERS = 'users'

/**
 * Top-level workspace test case library (path: testCases/{docId}).
 * All signed-in users read the same collection; Admin/QA Lead create/update/delete.
 */
export const COL_TEST_CASES_ROOT = 'testCases'

/** Subcollection name (legacy segment name only; live data uses {@link COL_TEST_CASES_ROOT}). */
export const SUB_TEST_CASES = 'testCases'

/** Subcollection name for templates (path: users/{uid}/templates/{docId}). */
export const SUB_TEMPLATES = 'templates'

/** Subcollection name for test runs (path: users/{uid}/testRuns/{docId}). */
export const SUB_TEST_RUNS = 'testRuns'

/** Subcollection name for per-run test results (path: users/{uid}/testRunResults/{docId}). */
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
 * Optional user profile fields on `users/{uid}` (single doc).
 * Auth profile (email, displayName, photoURL) usually comes from Firebase Auth; this doc
 * can cache preferences or extra QA-specific settings later.
 *
 * @type {readonly string[]}
 */
export const PROFILE_DOCUMENT_FIELDS = Object.freeze([
  'schemaVersion',
  'displayName',
  'email',
  'photoURL',
  'preferences',
  'updatedAt',
])
