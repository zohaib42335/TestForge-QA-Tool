/**
 * @fileoverview Firestore data-layer helpers for TestForge (Step 2 — no UI wiring yet).
 * All functions expect the **Firebase Auth uid** as `userId` (e.g. `auth.currentUser.uid`).
 * They return a consistent result object instead of throwing to keep Step 3 integration predictable.
 */

import {
  addDoc,
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  onSnapshot,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'

import { getFirebaseApp } from './config.js'
import { sanitizeActorNameForStorage } from '../utils/memberDisplay.js'
import {
  clearPendingInviteFromStorage,
  readPendingInviteFromStorage,
} from '../utils/pendingInviteStorage.js'
import {
  COL_ACTIVITY_LOGS,
  COL_COMMENTS,
  COL_PROJECTS,
  COL_USERS,
  SCHEMA_VERSION,
  SUB_TEMPLATES,
  SUB_TEST_RUN_RESULTS,
  SUB_TEST_RUNS,
} from './schema.js'

/**
 * Project-scoped test cases: `projects/{projectId}/testCases`.
 * @param {import('firebase/firestore').Firestore} db
 * @param {string|null|undefined} projectId
 * @returns {import('firebase/firestore').CollectionReference|null}
 */
function testCasesCollectionRef(db, projectId) {
  const pid = projectId != null && String(projectId).trim() !== '' ? String(projectId).trim() : ''
  if (!pid) return null
  return collection(db, COL_PROJECTS, pid, 'testCases')
}

/**
 * @typedef {Object} ServiceResult
 * @property {boolean} success
 * @property {string} [error] - Human-readable message safe to surface in UI
 * @property {string} [code] - Firebase error code when available
 */

/**
 * @typedef {Object} TestCaseFirestore
 * @property {string} id - Firestore document id
 * @property {string} [testCaseId] - Human id e.g. TC-001
 * @property {string} [module]
 * @property {string} [title]
 * @property {string} [description]
 * @property {string} [preconditions]
 * @property {string} [testSteps]
 * @property {string} [expectedResult]
 * @property {string} [actualResult]
 * @property {string} [status]
 * @property {string} [priority]
 * @property {string} [severity]
 * @property {string} [testType]
 * @property {string} [environment]
 * @property {string} [assignedTo]
 * @property {string} [createdBy]
 * @property {string} [createdDate]
 * @property {string} [executionDate]
 * @property {string} [comments]
 * @property {string} [automationStatus]
 * @property {string} [bugId]
 * @property {import('firebase/firestore').Timestamp|Date|*} [createdAt]
 * @property {import('firebase/firestore').Timestamp|Date|*} [updatedAt]
 * @property {number} [schemaVersion]
 * @property {string} [ownerId]
 */

/**
 * @typedef {Object} TemplateFirestore
 * @property {string} id
 * @property {string} name
 * @property {string} [description]
 * @property {Record<string, string>} [defaults]
 * @property {import('firebase/firestore').Timestamp|Date|*} [createdAt]
 * @property {import('firebase/firestore').Timestamp|Date|*} [updatedAt]
 * @property {number} [schemaVersion]
 * @property {string} [ownerId]
 */

/** @returns {import('firebase/firestore').Firestore|null} */
export function getDb() {
  const app = getFirebaseApp()
  if (!app) return null
  try {
    return getFirestore(app)
  } catch (e) {
    console.error('[firestore] getDb failed:', e)
    return null
  }
}

/**
 * @param {unknown} err
 * @returns {{ message: string, code?: string }}
 */
function normalizeError(err) {
  /** @type {{ message: string, code?: string }} */
  let out
  if (err && typeof err === 'object' && 'code' in err && 'message' in err) {
    const code = String(err.code)
    const message = String(err.message)
    out = { message, code }
  } else if (err instanceof Error) {
    out = { message: err.message }
  } else {
    out = { message: 'An unexpected error occurred.' }
  }

  if (out.code === 'permission-denied') {
    return {
      ...out,
      message:
        'Missing or insufficient permissions. Deploy the rules in this repo (`firebase deploy --only firestore:rules`). They must allow your signed-in user to read/write the paths your screen uses (for example `users/{yourUid}`, top-level `testCases`, and subcollections such as `testRuns` and `testRunResults`).',
    }
  }

  const msgLower = out.message.toLowerCase()
  if (
    out.code === 'unavailable' ||
    /client is offline/i.test(out.message) ||
    /failed to get document because the client is offline/i.test(out.message) ||
    (msgLower.includes('offline') && msgLower.includes('firestore'))
  ) {
    return {
      ...out,
      message:
        'You appear to be offline. Cached data is used when available; your changes will sync when you reconnect.',
    }
  }

  return out
}

/**
 * Removes keys with `undefined` so Firestore does not reject writes.
 * @param {Record<string, unknown>} obj
 * @returns {Record<string, unknown>}
 */
function stripUndefined(obj) {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined),
  )
}

/**
 * Log an activity event to Firestore.
 * Call this after every successful CRUD operation. Failures are swallowed so logging never breaks UX.
 *
 * @param {Object} params - Activity log fields
 * @param {string} params.action
 * @param {string} params.entityType
 * @param {string} [params.entityId]
 * @param {string} [params.entityRef]
 * @param {{ uid?: string, displayName?: string|null, email?: string|null, role?: string|null }} params.actor
 * @param {Record<string, unknown>|null} [params.changes]
 * @param {Record<string, unknown>|null} [params.metadata]
 * @returns {Promise<void>}
 */
export async function logActivity({
  action,
  entityType,
  entityId,
  entityRef,
  actor,
  changes = null,
  metadata = null,
}) {
  try {
    const db = getDb()
    if (!db) return

    const name = sanitizeActorNameForStorage(actor?.displayName)

    const initials = name
      .split(' ')
      .filter(Boolean)
      .map((w) => w[0])
      .join('')
      .substring(0, 2)
      .toUpperCase()

    await addDoc(collection(db, COL_ACTIVITY_LOGS), {
      action,
      entityType,
      entityId: entityId || '',
      entityRef: entityRef || '',
      actorUid: actor?.uid || 'system',
      actorName: name,
      actorInitials: initials,
      actorRole: actor?.role || 'Unknown',
      timestamp: new Date().toISOString(),
      changes,
      metadata,
    })
  } catch (err) {
    console.error('Activity log error:', err)
  }
}

/**
 * Subscribe to activity logs with optional server-side filters.
 * Note: combining multiple `where` clauses with `orderBy` may require composite indexes in Firebase.
 *
 * @param {(rows: Array<Record<string, unknown> & { id: string }>) => void} callback
 * @param {Object} [options]
 * @param {number} [options.limitCount]
 * @param {string|null} [options.entityType]
 * @param {string|null} [options.entityId]
 * @param {string|null} [options.actorUid]
 * @returns {() => void} Unsubscribe
 */
export function subscribeToActivityLogs(callback, options = {}) {
  const db = getDb()
  if (!db) {
    callback([])
    return () => {}
  }

  const {
    limitCount = 100,
    entityType = null,
    entityId = null,
    actorUid = null,
  } = options

  /** @type {import('firebase/firestore').QueryConstraint[]} */
  const constraints = []
  if (entityType) {
    constraints.push(where('entityType', '==', entityType))
  }
  if (entityId) {
    constraints.push(where('entityId', '==', entityId))
  }
  if (actorUid) {
    constraints.push(where('actorUid', '==', actorUid))
  }
  constraints.push(orderBy('timestamp', 'desc'))
  constraints.push(limit(Math.max(1, Math.min(500, Math.round(Number(limitCount)) || 100))))

  const q = query(collection(db, COL_ACTIVITY_LOGS), ...constraints)

  return onSnapshot(
    q,
    (snap) => {
      callback(
        snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })),
      )
    },
    (err) => {
      console.error('[firestore] subscribeToActivityLogs:', err)
      callback([])
    },
  )
}

/**
 * Subscribe to activity logs for a specific test case (Firestore document id).
 *
 * @param {string} testCaseId
 * @param {(rows: Array<Record<string, unknown> & { id: string }>) => void} callback
 * @returns {() => void} Unsubscribe
 */
export function subscribeToEntityLogs(testCaseId, callback) {
  const db = getDb()
  if (!db || typeof testCaseId !== 'string' || testCaseId.trim() === '') {
    callback([])
    return () => {}
  }

  const q = query(
    collection(db, COL_ACTIVITY_LOGS),
    where('entityId', '==', testCaseId.trim()),
    orderBy('timestamp', 'desc'),
    limit(50),
  )

  return onSnapshot(
    q,
    (snap) => {
      callback(
        snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })),
      )
    },
    (err) => {
      console.error('[firestore] subscribeToEntityLogs:', err)
      callback([])
    },
  )
}

/**
 * @param {string} userId
 * @returns {ServiceResult & { userId?: never }}
 */
function requireUid(userId) {
  if (typeof userId !== 'string' || userId.trim() === '') {
    return {
      success: false,
      error: 'A valid authenticated user id is required.',
      code: 'invalid-argument',
    }
  }
  return { success: true }
}

/**
 * @param {import('firebase/firestore').DocumentData} data
 * @param {string} docId
 * @returns {TestCaseFirestore}
 */
function mapTestCaseDoc(data, docId) {
  return {
    id: docId,
    ...(data && typeof data === 'object' ? data : {}),
  }
}

/**
 * @param {import('firebase/firestore').DocumentData} data
 * @param {string} docId
 * @returns {TemplateFirestore}
 */
function mapTemplateDoc(data, docId) {
  return {
    id: docId,
    ...(data && typeof data === 'object' ? data : {}),
  }
}

/**
 * Reads all project test cases, newest `updatedAt` first.
 * @param {string} userId - Firebase Auth uid (required so only signed-in callers hit Firestore)
 * @param {string|null|undefined} projectId - Firestore workspace id (`users.{projectId}`)
 * @returns {Promise<ServiceResult & { data?: TestCaseFirestore[] }>}
 */
export async function getTestCases(userId, projectId) {
  const gate = requireUid(userId)
  if (!gate.success) return gate

  const db = getDb()
  if (!db) {
    return {
      success: false,
      error: 'Firebase is not configured or Firestore failed to initialize.',
      code: 'failed-precondition',
    }
  }

  const col = testCasesCollectionRef(db, projectId)
  if (!col) {
    return { success: true, data: [] }
  }

  try {
    const q = query(col, orderBy('updatedAt', 'desc'))
    const snap = await getDocs(q)
    const items = snap.docs.map((d) => mapTestCaseDoc(d.data(), d.id))
    return { success: true, data: items }
  } catch (err) {
    const { message, code } = normalizeError(err)
    console.error('[firestore] getTestCases:', err)
    return { success: false, error: message, code }
  }
}

/**
 * Convenience wrapper for a one-time test case read.
 * Intended for export/sync flows where a snapshot listener is unnecessary.
 *
 * @param {string} userId
 * @param {string|null|undefined} [projectId]
 * @returns {Promise<ServiceResult & { data?: TestCaseFirestore[] }>}
 */
export async function getTestCasesOnce(userId, projectId) {
  return getTestCases(userId, projectId)
}

/**
 * Creates a new test case document. Returns the new Firestore document id.
 * @param {string} userId
 * @param {Record<string, unknown>} payload - Field values (strings recommended)
 * @param {string|null|undefined} projectId
 * @returns {Promise<ServiceResult & { id?: string }>}
 */
export async function addTestCase(userId, payload, projectId) {
  const gate = requireUid(userId)
  if (!gate.success) return gate

  const db = getDb()
  if (!db) {
    return {
      success: false,
      error: 'Firebase is not configured or Firestore failed to initialize.',
      code: 'failed-precondition',
    }
  }

  const col = testCasesCollectionRef(db, projectId)
  if (!col) {
    return {
      success: false,
      error: 'Project is required to save test cases.',
      code: 'failed-precondition',
    }
  }

  try {
    const body = stripUndefined({
      ...payload,
      schemaVersion: SCHEMA_VERSION,
      ownerId: userId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })

    const ref = await addDoc(col, body)
    return { success: true, id: ref.id }
  } catch (err) {
    const { message, code } = normalizeError(err)
    console.error('[firestore] addTestCase:', err)
    return { success: false, error: message, code }
  }
}

/**
 * Merges partial fields into an existing test case.
 * @param {string} userId
 * @param {string} docId - Firestore document id (**not** the human `testCaseId` unless you used it as doc id)
 * @param {Record<string, unknown>} partial
 * @param {string|null|undefined} projectId
 * @returns {Promise<ServiceResult>}
 */
export async function updateTestCase(userId, docId, partial, projectId) {
  const gate = requireUid(userId)
  if (!gate.success) return gate
  if (typeof docId !== 'string' || docId.trim() === '') {
    return {
      success: false,
      error: 'Document id is required for update.',
      code: 'invalid-argument',
    }
  }

  const db = getDb()
  if (!db) {
    return {
      success: false,
      error: 'Firebase is not configured or Firestore failed to initialize.',
      code: 'failed-precondition',
    }
  }

  const pid = projectId != null && String(projectId).trim() !== '' ? String(projectId).trim() : ''
  if (!pid) {
    return {
      success: false,
      error: 'Project is required to update test cases.',
      code: 'failed-precondition',
    }
  }

  try {
    const ref = doc(db, COL_PROJECTS, pid, 'testCases', docId)
    const body = stripUndefined({
      ...partial,
      updatedAt: serverTimestamp(),
    })
    await updateDoc(ref, body)
    return { success: true }
  } catch (err) {
    const { message, code } = normalizeError(err)
    console.error('[firestore] updateTestCase:', err)
    return { success: false, error: message, code }
  }
}

/**
 * Deletes a test case document.
 * @param {string} userId
 * @param {string} docId - Firestore document id
 * @param {string|null|undefined} projectId
 * @returns {Promise<ServiceResult>}
 */
export async function deleteTestCase(userId, docId, projectId) {
  const gate = requireUid(userId)
  if (!gate.success) return gate
  if (typeof docId !== 'string' || docId.trim() === '') {
    return {
      success: false,
      error: 'Document id is required for delete.',
      code: 'invalid-argument',
    }
  }

  const db = getDb()
  if (!db) {
    return {
      success: false,
      error: 'Firebase is not configured or Firestore failed to initialize.',
      code: 'failed-precondition',
    }
  }

  const pid = projectId != null && String(projectId).trim() !== '' ? String(projectId).trim() : ''
  if (!pid) {
    return {
      success: false,
      error: 'Project is required to delete test cases.',
      code: 'failed-precondition',
    }
  }

  try {
    const ref = doc(db, COL_PROJECTS, pid, 'testCases', docId)
    await deleteDoc(ref)
    return { success: true }
  } catch (err) {
    const { message, code } = normalizeError(err)
    console.error('[firestore] deleteTestCase:', err)
    return { success: false, error: message, code }
  }
}

/**
 * Bulk update `status` for multiple workspace test case documents (`testCases/{id}`).
 * Uses Firestore `writeBatch` (max 500 writes per commit).
 *
 * @param {string} userId - Firebase Auth uid (must be signed in)
 * @param {string[]} docIds - Firestore document IDs
 * @param {string} newStatus - Pass | Fail | Blocked | Not Run | Not Executed (`Not Run` is stored as `Not Executed`)
 * @param {string|null|undefined} projectId
 * @returns {Promise<ServiceResult>}
 */
export async function bulkUpdateStatus(userId, docIds, newStatus, projectId) {
  const gate = requireUid(userId)
  if (!gate.success) return gate

  const ids = Array.isArray(docIds)
    ? docIds.filter((id) => typeof id === 'string' && String(id).trim() !== '')
    : []
  if (ids.length === 0) return { success: true }

  const raw = newStatus == null ? '' : String(newStatus)
  const normalized = raw === 'Not Run' ? 'Not Executed' : raw
  const allowed = ['Pass', 'Fail', 'Blocked', 'Not Executed']
  if (!allowed.includes(normalized)) {
    return {
      success: false,
      error: 'Invalid status value.',
      code: 'invalid-argument',
    }
  }

  const db = getDb()
  if (!db) {
    return {
      success: false,
      error: 'Firebase is not configured or Firestore failed to initialize.',
      code: 'failed-precondition',
    }
  }

  const pid = projectId != null && String(projectId).trim() !== '' ? String(projectId).trim() : ''
  if (!pid) {
    return {
      success: false,
      error: 'Project is required to bulk-update test cases.',
      code: 'failed-precondition',
    }
  }

  const BATCH_LIMIT = 500
  /** @type {string[][]} */
  const chunks = []
  for (let i = 0; i < ids.length; i += BATCH_LIMIT) {
    chunks.push(ids.slice(i, i + BATCH_LIMIT))
  }

  const iso = new Date().toISOString()

  try {
    for (const chunk of chunks) {
      const batch = writeBatch(db)
      for (const id of chunk) {
        const ref = doc(db, COL_PROJECTS, pid, 'testCases', id)
        batch.update(ref, {
          status: normalized,
          updatedDate: iso,
          updatedAt: serverTimestamp(),
        })
      }
      await batch.commit()
    }
    return { success: true }
  } catch (err) {
    const { message, code } = normalizeError(err)
    console.error('[firestore] bulkUpdateStatus:', err)
    return { success: false, error: message, code }
  }
}

/**
 * Duplicates a test case into a new Firestore document under the project.
 *
 * @param {string} userId - Firebase Auth uid
 * @param {Record<string, unknown> & { id?: string }} testCase - Source row (must include `id`)
 * @param {string} currentUserName - Display name or email for `createdBy`
 * @param {string|null|undefined} projectId
 * @returns {Promise<ServiceResult & { id?: string, testCaseId?: string }>}
 */
export async function duplicateTestCase(userId, testCase, currentUserName, projectId) {
  const gate = requireUid(userId)
  if (!gate.success) return gate

  if (!testCase || typeof testCase !== 'object' || testCase.id == null) {
    return {
      success: false,
      error: 'A valid test case with a Firestore document id is required.',
      code: 'invalid-argument',
    }
  }

  const db = getDb()
  if (!db) {
    return {
      success: false,
      error: 'Firebase is not configured or Firestore failed to initialize.',
      code: 'failed-precondition',
    }
  }

  const col = testCasesCollectionRef(db, projectId)
  if (!col) {
    return {
      success: false,
      error: 'Project is required to duplicate test cases.',
      code: 'failed-precondition',
    }
  }

  try {
    const snap = await getDocs(col)
    let max = 0
    for (const d of snap.docs) {
      const data = d.data()
      const raw = data?.testCaseId != null ? String(data.testCaseId).trim() : ''
      const m = /^TC-(\d+)$/i.exec(raw)
      if (m) {
        const n = parseInt(m[1], 10)
        if (!Number.isNaN(n)) max = Math.max(max, n)
      }
    }
    const newTestCaseId = `TC-${String(max + 1).padStart(3, '0')}`

    const { id: _discardId, ...rawRest } = testCase
    const srcTitle =
      rawRest.title != null && String(rawRest.title).trim() !== ''
        ? String(rawRest.title)
        : rawRest.testTitle != null && String(rawRest.testTitle).trim() !== ''
          ? String(rawRest.testTitle)
          : ''
    const newTitle = srcTitle ? `Copy of ${srcTitle}` : 'Copy of Untitled'

    const body = stripUndefined({
      ...rawRest,
      testCaseId: newTestCaseId,
      title: newTitle,
      status: 'Not Executed',
      createdBy: currentUserName == null ? '' : String(currentUserName),
      createdDate: new Date().toISOString(),
      schemaVersion: SCHEMA_VERSION,
      ownerId: userId.trim(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })

    delete body.id

    const ref = await addDoc(col, body)
    return { success: true, id: ref.id, testCaseId: newTestCaseId }
  } catch (err) {
    const { message, code } = normalizeError(err)
    console.error('[firestore] duplicateTestCase:', err)
    return { success: false, error: message, code }
  }
}

/**
 * Lists all templates for a user, newest first.
 * @param {string} userId
 * @returns {Promise<ServiceResult & { data?: TemplateFirestore[] }>}
 */
export async function getTemplates(userId) {
  const gate = requireUid(userId)
  if (!gate.success) return gate

  const db = getDb()
  if (!db) {
    return {
      success: false,
      error: 'Firebase is not configured or Firestore failed to initialize.',
      code: 'failed-precondition',
    }
  }

  try {
    const col = collection(db, COL_USERS, userId, SUB_TEMPLATES)
    const q = query(col, orderBy('updatedAt', 'desc'))
    const snap = await getDocs(q)
    const items = snap.docs.map((d) => mapTemplateDoc(d.data(), d.id))
    return { success: true, data: items }
  } catch (err) {
    const { message, code } = normalizeError(err)
    console.error('[firestore] getTemplates:', err)
    return { success: false, error: message, code }
  }
}

/**
 * Creates a template document.
 * @param {string} userId
 * @param {{ name: string, description?: string, defaults?: Record<string, string> }} payload
 * @returns {Promise<ServiceResult & { id?: string }>}
 */
export async function addTemplate(userId, payload) {
  const gate = requireUid(userId)
  if (!gate.success) return gate

  if (!payload || typeof payload.name !== 'string' || payload.name.trim() === '') {
    return {
      success: false,
      error: 'Template name is required.',
      code: 'invalid-argument',
    }
  }

  const db = getDb()
  if (!db) {
    return {
      success: false,
      error: 'Firebase is not configured or Firestore failed to initialize.',
      code: 'failed-precondition',
    }
  }

  try {
    const body = stripUndefined({
      schemaVersion: SCHEMA_VERSION,
      ownerId: userId,
      name: payload.name.trim(),
      description:
        payload.description == null ? '' : String(payload.description).trim(),
      defaults:
        payload.defaults && typeof payload.defaults === 'object'
          ? payload.defaults
          : {},
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })

    const col = collection(db, COL_USERS, userId, SUB_TEMPLATES)
    const ref = await addDoc(col, body)
    return { success: true, id: ref.id }
  } catch (err) {
    const { message, code } = normalizeError(err)
    console.error('[firestore] addTemplate:', err)
    return { success: false, error: message, code }
  }
}

/**
 * Deletes a template document.
 * @param {string} userId
 * @param {string} docId
 * @returns {Promise<ServiceResult>}
 */
export async function deleteTemplate(userId, docId) {
  const gate = requireUid(userId)
  if (!gate.success) return gate
  if (typeof docId !== 'string' || docId.trim() === '') {
    return {
      success: false,
      error: 'Document id is required for delete.',
      code: 'invalid-argument',
    }
  }

  const db = getDb()
  if (!db) {
    return {
      success: false,
      error: 'Firebase is not configured or Firestore failed to initialize.',
      code: 'failed-precondition',
    }
  }

  try {
    const ref = doc(db, COL_USERS, userId, SUB_TEMPLATES, docId)
    await deleteDoc(ref)
    return { success: true }
  } catch (err) {
    const { message, code } = normalizeError(err)
    console.error('[firestore] deleteTemplate:', err)
    return { success: false, error: message, code }
  }
}

/**
 * Batch-creates test case documents for a user.
 *
 * Notes:
 * - Firestore limits a single `writeBatch` commit to 500 operations.
 * - For <= 500 rows this is a single atomic commit.
 * - For > 500 rows this helper fails fast with per-row failure metadata so UI can guide the user to split imports.
 *
 * @param {string} userId
 * @param {Array<Record<string, unknown>>} rows - Validated row objects ready to persist
 * @param {string|null|undefined} projectId
 * @returns {Promise<ServiceResult & { imported?: number, failedRows?: Array<{ rowIndex: number, reason: string }> }>}
 */
export async function addTestCasesBatch(userId, rows, projectId) {
  const gate = requireUid(userId)
  if (!gate.success) return gate

  const list = Array.isArray(rows) ? rows : []
  if (list.length === 0) {
    return { success: true, imported: 0, failedRows: [] }
  }

  if (list.length > 500) {
    return {
      success: false,
      error:
        'Import exceeds Firestore batch limit (500 writes). Split the file into smaller chunks and retry.',
      code: 'invalid-argument',
      failedRows: list.map((_, i) => ({
        rowIndex: i,
        reason: 'Exceeded Firestore writeBatch limit of 500 operations.',
      })),
    }
  }

  const db = getDb()
  if (!db) {
    return {
      success: false,
      error: 'Firebase is not configured or Firestore failed to initialize.',
      code: 'failed-precondition',
      failedRows: list.map((_, i) => ({
        rowIndex: i,
        reason: 'Firestore failed to initialize.',
      })),
    }
  }

  const col = testCasesCollectionRef(db, projectId)
  if (!col) {
    return {
      success: false,
      error: 'Project is required to import test cases.',
      code: 'failed-precondition',
      failedRows: list.map((_, i) => ({
        rowIndex: i,
        reason: 'Project is required to import test cases.',
      })),
    }
  }

  try {
    const batch = writeBatch(db)

    for (let i = 0; i < list.length; i += 1) {
      const ref = doc(col)
      const body = stripUndefined({
        ...(list[i] || {}),
        schemaVersion: SCHEMA_VERSION,
        ownerId: userId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      batch.set(ref, body)
    }

    await batch.commit()
    return { success: true, imported: list.length, failedRows: [] }
  } catch (err) {
    const { message, code } = normalizeError(err)
    console.error('[firestore] addTestCasesBatch:', err)
    return {
      success: false,
      error: message,
      code,
      failedRows: list.map((_, i) => ({
        rowIndex: i,
        reason: message,
      })),
    }
  }
}

/**
 * Deletes all documents in the workspace `testCases` collection (entire shared library).
 *
 * Notes:
 * - Firestore batch writes are limited to 500 operations.
 * - This helper deletes in chunks (multiple commits) when needed.
 * - This is not a single atomic operation for large datasets.
 * - Intended for Admin/QA Lead “clear all” only (enforce in UI + rules).
 *
 * @param {string} userId - Firebase Auth uid (caller must be signed in)
 * @param {string|null|undefined} projectId
 * @returns {Promise<ServiceResult & { deleted?: number }>}
 */
export async function deleteAllTestCases(userId, projectId) {
  const gate = requireUid(userId)
  if (!gate.success) return gate

  const db = getDb()
  if (!db) {
    return {
      success: false,
      error: 'Firebase is not configured or Firestore failed to initialize.',
      code: 'failed-precondition',
    }
  }

  const col = testCasesCollectionRef(db, projectId)
  if (!col) {
    return {
      success: false,
      error: 'Project is required to delete test cases.',
      code: 'failed-precondition',
    }
  }

  try {
    const snap = await getDocs(col)
    if (snap.empty) return { success: true, deleted: 0 }

    const docs = snap.docs
    const CHUNK = 450
    let deleted = 0

    for (let i = 0; i < docs.length; i += CHUNK) {
      const batch = writeBatch(db)
      const slice = docs.slice(i, i + CHUNK)
      for (const d of slice) batch.delete(d.ref)
      await batch.commit()
      deleted += slice.length
    }

    return { success: true, deleted }
  } catch (err) {
    const { message, code } = normalizeError(err)
    console.error('[firestore] deleteAllTestCases:', err)
    return { success: false, error: message, code }
  }
}

/**
 * Fetch all test runs for a user in real time (newest first).
 * @param {string} userId - Firebase Auth uid (must match request.auth.uid in rules)
 * @param {(runs: Array<Record<string, unknown>>) => void} callback
 * @param {(message: string) => void} [onError]
 * @returns {() => void} Unsubscribe
 */
export function subscribeToTestRuns(userId, callback, onError) {
  const gate = requireUid(userId)
  const db = getDb()
  if (!gate.success || !db) {
    callback([])
    return () => {}
  }

  const col = collection(db, COL_USERS, userId.trim(), SUB_TEST_RUNS)
  const q = query(col, orderBy('createdDate', 'desc'))

  return onSnapshot(
    q,
    (snap) => {
      callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    },
    (err) => {
      const { message } = normalizeError(err)
      console.error('[firestore] subscribeToTestRuns:', err)
      if (typeof onError === 'function') onError(message)
      callback([])
    },
  )
}

/**
 * Create a new test run and seed `testRunResults` documents in one flow.
 * @param {string} userId - Firebase Auth uid
 * @param {Record<string, unknown>} runData
 * @param {string} runData.name
 * @param {string} [runData.description]
 * @param {string[]} runData.testCaseIds
 * @param {Array<Record<string, unknown>>} runData.selectedCases
 * @param {string} [runData.createdBy]
 * @param {number} [runData.totalCases]
 * @returns {Promise<string>} New run document id
 */
export async function createTestRun(userId, runData) {
  const gate = requireUid(userId)
  if (!gate.success) {
    throw new Error(gate.error || 'You must be signed in to create a test run.')
  }
  const db = getDb()
  if (!db) {
    throw new Error('Firebase is not configured or Firestore failed to initialize.')
  }

  const uid = userId.trim()

  const selectedCases = Array.isArray(runData?.selectedCases) ? runData.selectedCases : []
  const testCaseIds = Array.isArray(runData?.testCaseIds) ? runData.testCaseIds : []
  if (selectedCases.length === 0 || testCaseIds.length === 0) {
    throw new Error('Select at least one test case.')
  }

  const totalCases =
    typeof runData.totalCases === 'number' && !Number.isNaN(runData.totalCases)
      ? runData.totalCases
      : testCaseIds.length

  try {
    const runsCol = collection(db, COL_USERS, uid, SUB_TEST_RUNS)
    const docRef = await addDoc(
      runsCol,
      stripUndefined({
        name: runData.name,
        description: runData.description == null ? '' : String(runData.description),
        testCaseIds,
        createdBy: runData.createdBy == null ? '' : String(runData.createdBy),
        createdDate: new Date().toISOString(),
        status: 'Pending',
        startedDate: null,
        completedDate: null,
        passCount: 0,
        failCount: 0,
        blockedCount: 0,
        skippedCount: 0,
        notRunCount: totalCases,
        totalCases,
      }),
    )

    const resultsCol = collection(db, COL_USERS, uid, SUB_TEST_RUN_RESULTS)
    const batch = writeBatch(db)
    selectedCases.forEach((tc, index) => {
      const ref = doc(resultsCol)
      const humanId =
        tc && tc.testCaseId != null && String(tc.testCaseId).trim() !== ''
          ? String(tc.testCaseId).trim()
          : tc && tc.id != null
            ? String(tc.id)
            : ''
      batch.set(ref, {
        runId: docRef.id,
        testCaseId: humanId,
        testCaseTitle:
          tc && tc.testTitle != null && String(tc.testTitle).trim() !== ''
            ? String(tc.testTitle)
            : tc && tc.title != null
              ? String(tc.title)
              : '',
        testSuite:
          tc && tc.testSuite != null && String(tc.testSuite).trim() !== ''
            ? String(tc.testSuite)
            : tc && tc.module != null
              ? String(tc.module)
              : '',
        priority:
          tc && tc.priority != null && String(tc.priority).trim() !== ''
            ? String(tc.priority)
            : 'Medium',
        result: 'Not Run',
        notes: '',
        executedBy: '',
        executedDate: null,
        sortIndex: index,
      })
    })
    await batch.commit()
    return docRef.id
  } catch (err) {
    const { message } = normalizeError(err)
    console.error('[firestore] createTestRun:', err)
    throw new Error(message || 'Failed to create test run.')
  }
}

/**
 * Fetch results for a specific run in real time.
 * @param {string} userId - Firebase Auth uid
 * @param {string} runId
 * @param {(rows: Array<Record<string, unknown>>) => void} callback
 * @param {(message: string) => void} [onError]
 * @returns {() => void} Unsubscribe
 */
export function subscribeToRunResults(userId, runId, callback, onError) {
  const gate = requireUid(userId)
  const db = getDb()
  if (!gate.success || !db || typeof runId !== 'string' || runId.trim() === '') {
    callback([])
    return () => {}
  }

  const col = collection(db, COL_USERS, userId.trim(), SUB_TEST_RUN_RESULTS)
  const q = query(col, where('runId', '==', runId))

  return onSnapshot(
    q,
    (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      rows.sort((a, b) => {
        const ai = typeof a.sortIndex === 'number' ? a.sortIndex : 0
        const bi = typeof b.sortIndex === 'number' ? b.sortIndex : 0
        return ai - bi
      })
      callback(rows)
    },
    (err) => {
      const { message } = normalizeError(err)
      console.error('[firestore] subscribeToRunResults:', err)
      if (typeof onError === 'function') onError(message)
      callback([])
    },
  )
}

/**
 * Subscribe to a single test run document.
 * @param {string} userId - Firebase Auth uid
 * @param {string} runId
 * @param {(run: Record<string, unknown>|null) => void} callback
 * @param {(message: string) => void} [onError]
 * @returns {() => void} Unsubscribe
 */
export function subscribeToTestRun(userId, runId, callback, onError) {
  const gate = requireUid(userId)
  const db = getDb()
  if (!gate.success || !db || typeof runId !== 'string' || runId.trim() === '') {
    callback(null)
    return () => {}
  }

  const ref = doc(db, COL_USERS, userId.trim(), SUB_TEST_RUNS, runId)
  return onSnapshot(
    ref,
    (snap) => {
      const docExists =
        typeof snap.exists === 'function' ? snap.exists() : Boolean(snap.exists)
      if (!docExists) {
        callback(null)
        return
      }
      callback({ id: snap.id, ...snap.data() })
    },
    (err) => {
      const { message } = normalizeError(err)
      console.error('[firestore] subscribeToTestRun:', err)
      if (typeof onError === 'function') onError(message)
      callback(null)
    },
  )
}

/**
 * Update a single test case result inside a run.
 * @param {string} userId - Firebase Auth uid
 * @param {string} resultDocId
 * @param {'Not Run'|'Pass'|'Fail'|'Blocked'|'Skipped'} result
 * @param {string} [notes]
 * @param {string} [executedBy]
 * @returns {Promise<void>}
 */
export async function updateTestResult(userId, resultDocId, result, notes = '', executedBy) {
  const gate = requireUid(userId)
  if (!gate.success) {
    throw new Error(gate.error || 'You must be signed in to update results.')
  }
  const db = getDb()
  if (!db) {
    throw new Error('Firebase is not configured or Firestore failed to initialize.')
  }
  if (typeof resultDocId !== 'string' || resultDocId.trim() === '') {
    throw new Error('Result id is required.')
  }

  const uid = userId.trim()

  try {
    const ref = doc(db, COL_USERS, uid, SUB_TEST_RUN_RESULTS, resultDocId)
    const payload = stripUndefined({
      result,
      notes: notes == null ? '' : String(notes),
      executedDate: new Date().toISOString(),
      executedBy:
        executedBy == null || String(executedBy).trim() === ''
          ? undefined
          : String(executedBy),
    })
    await updateDoc(ref, payload)
  } catch (err) {
    const { message } = normalizeError(err)
    console.error('[firestore] updateTestResult:', err)
    throw new Error(message || 'Failed to update test result.')
  }
}

/**
 * Update run-level counts and derived status.
 * @param {string} userId - Firebase Auth uid
 * @param {string} runId
 * @param {{
 *   passCount: number,
 *   failCount: number,
 *   blockedCount: number,
 *   skippedCount: number,
 *   notRunCount: number,
 *   totalCases?: number
 * }} stats
 * @returns {Promise<void>}
 */
export async function updateRunStats(userId, runId, stats) {
  const gate = requireUid(userId)
  if (!gate.success) {
    throw new Error(gate.error || 'You must be signed in to update run stats.')
  }
  const db = getDb()
  if (!db) {
    throw new Error('Firebase is not configured or Firestore failed to initialize.')
  }
  if (typeof runId !== 'string' || runId.trim() === '') {
    throw new Error('Run id is required.')
  }

  const uid = userId.trim()

  const notRunCount = Math.max(0, Math.round(Number(stats.notRunCount)) || 0)
  const completed = notRunCount === 0

  try {
    const ref = doc(db, COL_USERS, uid, SUB_TEST_RUNS, runId)
    await updateDoc(
      ref,
      stripUndefined({
        passCount: Math.max(0, Math.round(Number(stats.passCount)) || 0),
        failCount: Math.max(0, Math.round(Number(stats.failCount)) || 0),
        blockedCount: Math.max(0, Math.round(Number(stats.blockedCount)) || 0),
        skippedCount: Math.max(0, Math.round(Number(stats.skippedCount)) || 0),
        notRunCount,
        totalCases:
          stats.totalCases == null
            ? undefined
            : Math.max(0, Math.round(Number(stats.totalCases)) || 0),
        status: completed ? 'Completed' : 'In Progress',
        completedDate: completed ? new Date().toISOString() : null,
      }),
    )
  } catch (err) {
    const { message } = normalizeError(err)
    console.error('[firestore] updateRunStats:', err)
    throw new Error(message || 'Failed to update run stats.')
  }
}

/**
 * Start a run (set status to In Progress).
 * @param {string} userId - Firebase Auth uid
 * @param {string} runId
 * @returns {Promise<void>}
 */
export async function startTestRun(userId, runId) {
  const gate = requireUid(userId)
  if (!gate.success) {
    throw new Error(gate.error || 'You must be signed in to start a test run.')
  }
  const db = getDb()
  if (!db) {
    throw new Error('Firebase is not configured or Firestore failed to initialize.')
  }
  if (typeof runId !== 'string' || runId.trim() === '') {
    throw new Error('Run id is required.')
  }

  const uid = userId.trim()

  try {
    const ref = doc(db, COL_USERS, uid, SUB_TEST_RUNS, runId)
    await updateDoc(ref, {
      status: 'In Progress',
      startedDate: new Date().toISOString(),
    })
  } catch (err) {
    const { message } = normalizeError(err)
    console.error('[firestore] startTestRun:', err)
    throw new Error(message || 'Failed to start test run.')
  }
}

/**
 * Delete a test run and all of its result rows.
 * @param {string} userId - Firebase Auth uid
 * @param {string} runId
 * @returns {Promise<void>}
 */
export async function deleteTestRun(userId, runId) {
  const gate = requireUid(userId)
  if (!gate.success) {
    throw new Error(gate.error || 'You must be signed in to delete a test run.')
  }
  const db = getDb()
  if (!db) {
    throw new Error('Firebase is not configured or Firestore failed to initialize.')
  }
  if (typeof runId !== 'string' || runId.trim() === '') {
    throw new Error('Run id is required.')
  }

  const uid = userId.trim()

  try {
    const runRef = doc(db, COL_USERS, uid, SUB_TEST_RUNS, runId)
    await deleteDoc(runRef)

    const col = collection(db, COL_USERS, uid, SUB_TEST_RUN_RESULTS)
    const q = query(col, where('runId', '==', runId))
    const snap = await getDocs(q)
    const CHUNK = 450
    const docs = snap.docs
    for (let i = 0; i < docs.length; i += CHUNK) {
      const batch = writeBatch(db)
      const slice = docs.slice(i, i + CHUNK)
      for (const d of slice) batch.delete(d.ref)
      await batch.commit()
    }
  } catch (err) {
    const { message } = normalizeError(err)
    console.error('[firestore] deleteTestRun:', err)
    throw new Error(message || 'Failed to delete test run.')
  }
}

// ---------------------------------------------------------------------------
// User profiles & RBAC (documents at users/{uid}, same path as per-user root)
// ---------------------------------------------------------------------------

/**
 * Get or create user profile in Firestore. Called on every sign-in.
 * For this workspace model, each newly registered account owns its own project.
 *
 * @param {import('firebase/auth').User} firebaseUser - Firebase auth user object
 * @param {Object} [options]
 * @param {string} [options.initialDisplayName] - Used when creating a new profile (e.g. email registration)
 * @returns {Promise<Object>} User profile including `id` and `role`
 */
export async function getOrCreateUserProfile(firebaseUser, options = {}) {
  if (!firebaseUser || typeof firebaseUser.uid !== 'string' || firebaseUser.uid.trim() === '') {
    throw new Error('A signed-in Firebase user is required.')
  }

  const db = getDb()
  if (!db) {
    throw new Error('Firebase is not configured or Firestore failed to initialize.')
  }

  const uid = firebaseUser.uid.trim()
  const emailLower = String(firebaseUser.email ?? '').trim().toLowerCase()
  const userRef = doc(db, COL_USERS, uid)
  const userSnap = await getDoc(userRef)

  /**
   * Resolve invite context from URL:
   *   /?invite=<inviteId>&project=<projectId>
   * and validate it against pending invite + matching email.
   *
   * @returns {Promise<null | { projectId: string, inviteId: string, role: string }>}
   */
  const resolveInviteContext = async () => {
    if (typeof window === 'undefined') return null
    const sp = new URLSearchParams(window.location.search || '')
    let inviteTokenOrId = String(sp.get('invite') ?? '').trim()
    let projectId = String(sp.get('project') ?? '').trim()
    if (!inviteTokenOrId || !projectId) {
      const stored = readPendingInviteFromStorage()
      if (stored) {
        if (!inviteTokenOrId) inviteTokenOrId = stored.invite
        if (!projectId) projectId = stored.project
      }
    }
    if (!inviteTokenOrId) return null

    /** @returns {Promise<null | { projectId: string, inviteId: string, role: string, data: Record<string, unknown> }>} */
    const loadInviteInProject = async (pid) => {
      let inviteId = ''
      let data = null
      const directRef = doc(db, `projects/${pid}/invites/${inviteTokenOrId}`)
      const directSnap = await getDoc(directRef)
      if (directSnap.exists()) {
        inviteId = directSnap.id
        data = directSnap.data() || {}
      } else {
        const byToken = await getDocs(
          query(
            collection(db, `projects/${pid}/invites`),
            where('token', '==', inviteTokenOrId),
            limit(1),
          ),
        )
        if (!byToken.empty) {
          inviteId = byToken.docs[0].id
          data = byToken.docs[0].data() || {}
        }
      }
      if (!inviteId || !data) return null
      const status = String(data.status ?? '')
      const invitedEmail = String(data.email ?? '').trim().toLowerCase()
      const openInvite = data.openInvite === true
      if (status !== 'pending') return null
      if (!openInvite && (!emailLower || invitedEmail !== emailLower)) return null
      const rawRole = String(data.role ?? 'Member')
      const role =
        rawRole === 'Owner' ||
        rawRole === 'Admin' ||
        rawRole === 'QA Lead' ||
        rawRole === 'Member' ||
        rawRole === 'Viewer'
          ? rawRole
          : 'Member'
      return { projectId: pid, inviteId, role, data }
    }

    try {
      if (projectId) {
        const res = await loadInviteInProject(projectId)
        if (!res) return null
        return { projectId: res.projectId, inviteId: res.inviteId, role: res.role }
      }
      const cg = query(
        collectionGroup(db, 'invites'),
        where('token', '==', inviteTokenOrId),
        limit(5),
      )
      const snap = await getDocs(cg)
      for (const d of snap.docs) {
        const pathParts = d.ref.path.split('/')
        const pid = pathParts[1]
        const data = d.data() || {}
        const status = String(data.status ?? '')
        const invitedEmail = String(data.email ?? '').trim().toLowerCase()
        const openInvite = data.openInvite === true
        if (status !== 'pending') continue
        if (!openInvite && (!emailLower || invitedEmail !== emailLower)) continue
        const rawRole = String(data.role ?? 'Member')
        const role =
          rawRole === 'Owner' ||
          rawRole === 'Admin' ||
          rawRole === 'QA Lead' ||
          rawRole === 'Member' ||
          rawRole === 'Viewer'
            ? rawRole
            : 'Member'
        return { projectId: pid, inviteId: d.id, role }
      }
      return null
    } catch {
      return null
    }
  }

  const setInviteJoinNotice = (roleValue) => {
    if (typeof window === 'undefined') return
    const roleText = String(roleValue ?? '').trim()
    if (!roleText) return
    try {
      sessionStorage.setItem(
        'testforge_invite_join_notice',
        JSON.stringify({
          role: roleText,
          at: Date.now(),
        }),
      )
    } catch {
      // no-op
    }
  }

  const inviteContext = await resolveInviteContext()

  const docExists = typeof userSnap.exists === 'function' ? userSnap.exists() : userSnap.exists
  if (docExists) {
    const existing = { id: userSnap.id, ...userSnap.data() }
    const existingRole =
      String(existing.role ?? '') === 'Owner' ||
      String(existing.role ?? '') === 'Admin' ||
      String(existing.role ?? '') === 'QA Lead' ||
      String(existing.role ?? '') === 'Member' ||
      String(existing.role ?? '') === 'Viewer'
        ? String(existing.role)
        : 'Member'
    const effectiveRole = inviteContext?.role || existingRole
    const effectiveProjectId = inviteContext?.projectId || String(existing.projectId ?? '').trim() || uid

    if (effectiveRole !== existingRole || effectiveProjectId !== String(existing.projectId ?? '').trim()) {
      await setDoc(
        userRef,
        {
          role: effectiveRole,
          projectId: effectiveProjectId,
        },
        { merge: true },
      )
    }

    // Best-effort RBAC bootstrap.
    try {
      const bootstrapProjectId = effectiveProjectId
      const memberRef = doc(db, `projects/${bootstrapProjectId}/members/${uid}`)
      const projectRef = doc(db, `projects/${bootstrapProjectId}`)
      const bootstrapBatch = writeBatch(db)
      bootstrapBatch.set(
        projectRef,
        {
          creatorUid: inviteContext ? inviteContext.projectId : uid,
          ownerUid: inviteContext ? inviteContext.projectId : uid,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      )
      bootstrapBatch.set(
        memberRef,
        {
          uid,
          email: firebaseUser.email ?? '',
          displayName:
            existing.displayName != null ? String(existing.displayName) : firebaseUser.displayName ?? '',
          role: effectiveRole,
          joinedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          inviteId: inviteContext?.inviteId || null,
        },
        { merge: true },
      )
      if (inviteContext) {
        const inviteRef = doc(db, `projects/${inviteContext.projectId}/invites/${inviteContext.inviteId}`)
        bootstrapBatch.set(
          inviteRef,
          {
            status: 'accepted',
            acceptedBy: uid,
            acceptedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        )
      }
      await bootstrapBatch.commit()
      if (inviteContext) {
        clearPendingInviteFromStorage()
        setInviteJoinNotice(effectiveRole)
      }
    } catch (err) {
      console.warn('[firestore] RBAC bootstrap skipped for existing profile:', err)
    }
    return {
      ...existing,
      role: effectiveRole,
      projectId: effectiveProjectId,
    }
  }

  // New signup role:
  // - via invite => assigned invite role
  // - otherwise => Owner
  const role = inviteContext?.role || 'Owner'
  const projectId = inviteContext?.projectId || uid

  const fromRegistration =
    options.initialDisplayName != null && String(options.initialDisplayName).trim() !== ''
      ? String(options.initialDisplayName).trim()
      : ''
  const fromAuth =
    firebaseUser.displayName != null && String(firebaseUser.displayName).trim() !== ''
      ? String(firebaseUser.displayName).trim()
      : ''
  const displayName = fromRegistration || fromAuth || ''

  const newProfile = {
    uid,
    email: firebaseUser.email ?? '',
    displayName,
    role,
    projectId,
    createdDate: new Date().toISOString(),
    assignedBy: 'system',
    photoURL: firebaseUser.photoURL ?? null,
  }

  await setDoc(userRef, newProfile)

  // Best-effort RBAC bootstrap for project-based membership model.
  // If security rules block this (common during migration), we still allow login.
  try {
    const bootstrapProjectId = projectId
    const projectRef = doc(db, `projects/${bootstrapProjectId}`)
    const memberRef = doc(db, `projects/${bootstrapProjectId}/members/${uid}`)
    const bootstrapBatch = writeBatch(db)
    bootstrapBatch.set(
      projectRef,
      {
        creatorUid: inviteContext ? inviteContext.projectId : uid,
        ownerUid: inviteContext ? inviteContext.projectId : uid,
        name: displayName ? `${displayName}'s Project` : 'My Project',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    )
    bootstrapBatch.set(
      memberRef,
      {
        uid,
        email: firebaseUser.email ?? '',
        displayName,
        role,
        joinedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        inviteId: inviteContext?.inviteId || null,
      },
      { merge: true },
    )
    if (inviteContext) {
      const inviteRef = doc(db, `projects/${inviteContext.projectId}/invites/${inviteContext.inviteId}`)
      bootstrapBatch.set(
        inviteRef,
        {
          status: 'accepted',
          acceptedBy: uid,
          acceptedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      )
    }
    await bootstrapBatch.commit()
    if (inviteContext) {
      clearPendingInviteFromStorage()
      setInviteJoinNotice(role)
    }
  } catch (err) {
    console.warn('[firestore] RBAC bootstrap skipped for new profile:', err)
  }

  const publicName = sanitizeActorNameForStorage(newProfile.displayName)

  void logActivity({
    action: 'user.joined',
    entityType: 'user',
    entityId: uid,
    entityRef: publicName,
    actor: {
      uid,
      displayName: publicName,
      email: newProfile.email,
      role: newProfile.role,
    },
    metadata: { role: newProfile.role },
  })

  return { id: uid, ...newProfile }
}

/**
 * Sort user profile rows by `createdDate` ascending (ISO strings sort lexicographically).
 * @param {Array<Record<string, unknown>>} rows
 * @returns {Array<Record<string, unknown>>}
 */
function sortUserProfilesByCreatedDate(rows) {
  return [...rows].sort((a, b) => {
    const sa = typeof a.createdDate === 'string' ? a.createdDate : ''
    const sb = typeof b.createdDate === 'string' ? b.createdDate : ''
    return sa.localeCompare(sb)
  })
}

export function subscribeToUsers(callback, onError) {
  const db = getDb()
  if (!db) {
    callback([])
    return () => {}
  }

  // Listen on the whole `users` collection (no orderBy) so we do not depend on a
  // composite index. Sort client-side instead.
  const colRef = collection(db, COL_USERS)

  return onSnapshot(
    colRef,
    (snap) => {
      const rows = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }))
      callback(sortUserProfilesByCreatedDate(rows))
    },
    (err) => {
      const { message, code } = normalizeError(err)
      console.error('[firestore] subscribeToUsers:', err)
      if (typeof onError === 'function') {
        if (code === 'permission-denied') {
          onError(
            'Could not load team members: Firestore blocked reading the `users` collection. Deploy this project’s rules (`firebase deploy --only firestore:rules`). Rules must allow signed-in users to read each `users/{userId}` profile document (see `firestore.rules` in the repo).',
          )
        } else {
          onError(message)
        }
      }
      callback([])
    },
  )
}

/**
 * Update a user's role (Admin only in UI; rules must allow).
 *
 * @param {string} targetUid - Target user's uid
 * @param {string} newRole - "Owner" | "Admin" | "QA Lead" | "Member" | "Viewer"
 * @param {string} assignedByUid - uid of admin making the change
 * @returns {Promise<void>}
 */
export async function updateUserRole(targetUid, newRole, assignedByUid) {
  const allowed = ['Owner', 'Admin', 'QA Lead', 'Member', 'Viewer']
  if (typeof targetUid !== 'string' || targetUid.trim() === '') {
    throw new Error('Target user id is required.')
  }
  if (!allowed.includes(newRole)) {
    throw new Error('Invalid role.')
  }
  if (typeof assignedByUid !== 'string' || assignedByUid.trim() === '') {
    throw new Error('Assigning admin uid is required.')
  }

  const db = getDb()
  if (!db) {
    throw new Error('Firebase is not configured or Firestore failed to initialize.')
  }

  try {
    await updateDoc(doc(db, COL_USERS, targetUid.trim()), {
      role: newRole,
      assignedBy: assignedByUid.trim(),
    })
  } catch (err) {
    const code =
      err && typeof err === 'object' && 'code' in err ? String(err.code) : ''
    console.error('[firestore] updateUserRole:', err)
    if (code === 'permission-denied') {
      throw new Error(
        'Role update was blocked by Firestore. Open Firebase Console → Firestore → Rules and publish the rules from this repo (see firestore.rules). The `users/{userId}` rule must allow updates when the signed-in user\'s own profile has role "Admin" (not only when request.auth.uid == userId). Then run: firebase deploy --only firestore:rules',
      )
    }
    const { message } = normalizeError(err)
    throw new Error(message || 'Failed to update user role.')
  }
}

/**
 * Fetch a single user profile by uid.
 *
 * @param {string} uid - Firebase Auth uid
 * @returns {Promise<Object|null>}
 */
export async function getUserProfile(uid) {
  if (typeof uid !== 'string' || uid.trim() === '') {
    return null
  }
  const db = getDb()
  if (!db) {
    return null
  }
  try {
    const snap = await getDoc(doc(db, COL_USERS, uid.trim()))
    const exists = typeof snap.exists === 'function' ? snap.exists() : snap.exists
    return exists ? { id: snap.id, ...snap.data() } : null
  } catch (err) {
    console.error('[firestore] getUserProfile:', err)
    return null
  }
}

// ---------------------------------------------------------------------------
// Comments (top-level `comments` collection, keyed by test case Firestore doc id)
// ---------------------------------------------------------------------------

/** Max length for `comments.text` (aligned with Firestore rules). */
const MAX_COMMENT_TEXT_LENGTH = 1000

/** @type {readonly string[]} */
const COMMENT_TYPES = Object.freeze(['comment', 'note', 'failure', 'question'])

/**
 * @param {string} displayNameOrEmail
 * @returns {string}
 */
function buildAuthorInitials(displayNameOrEmail) {
  const name = String(displayNameOrEmail || 'Unknown').trim()
  const fromWords = name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
  if (fromWords.length >= 2) return fromWords.slice(0, 2).toUpperCase()
  const compact = name.replace(/\s+/g, '')
  return (compact.slice(0, 2) || '?').toUpperCase()
}

/**
 * Subscribe to comments for a specific test case (newest last in UI; ordered ascending by `createdDate`).
 *
 * @param {string} testCaseId - Firestore document id of the test case
 * @param {(rows: Array<Record<string, unknown>>) => void} callback
 * @param {(message: string) => void} [onError]
 * @returns {() => void} Unsubscribe
 */
export function subscribeToComments(testCaseId, callback, onError) {
  const db = getDb()
  if (!db || typeof testCaseId !== 'string' || testCaseId.trim() === '') {
    callback([])
    return () => {}
  }

  const q = query(
    collection(db, COL_COMMENTS),
    where('testCaseId', '==', testCaseId.trim()),
    orderBy('createdDate', 'asc'),
  )

  return onSnapshot(
    q,
    (snap) => {
      callback(
        snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })),
      )
    },
    (err) => {
      const { message } = normalizeError(err)
      console.error('[firestore] subscribeToComments:', err)
      if (typeof onError === 'function') onError(message)
      callback([])
    },
  )
}

/**
 * Add a comment document for a test case.
 *
 * @param {string} testCaseId - Firestore doc id of the test case
 * @param {string} testCaseRef - Human-readable id (e.g. TC-001)
 * @param {string} text - Body (trimmed, max 1000 chars)
 * @param {string} type - comment | note | failure | question
 * @param {{ uid: string, displayName?: string|null, email?: string|null }} author
 * @returns {Promise<void>}
 */
export async function addComment(testCaseId, testCaseRef, text, type, author) {
  if (typeof testCaseId !== 'string' || testCaseId.trim() === '') {
    throw new Error('Test case id is required.')
  }
  const body = text == null ? '' : String(text).trim()
  if (body.length === 0) {
    throw new Error('Comment text cannot be empty.')
  }
  if (body.length > MAX_COMMENT_TEXT_LENGTH) {
    throw new Error(`Comment must be at most ${MAX_COMMENT_TEXT_LENGTH} characters.`)
  }
  const t = type == null || String(type).trim() === '' ? 'comment' : String(type).trim()
  if (!COMMENT_TYPES.includes(t)) {
    throw new Error('Invalid comment type.')
  }
  if (!author || typeof author.uid !== 'string' || author.uid.trim() === '') {
    throw new Error('Author uid is required.')
  }

  const db = getDb()
  if (!db) {
    throw new Error('Firebase is not configured or Firestore failed to initialize.')
  }

  const name =
    author.displayName != null && String(author.displayName).trim() !== ''
      ? String(author.displayName).trim()
      : author.email != null && String(author.email).trim() !== ''
        ? String(author.email).trim()
        : 'Unknown'

  try {
    await addDoc(collection(db, COL_COMMENTS), {
      testCaseId: testCaseId.trim(),
      testCaseRef: testCaseRef == null ? '' : String(testCaseRef).trim(),
      authorUid: author.uid.trim(),
      authorName: name,
      authorInitials: buildAuthorInitials(name),
      text: body,
      createdDate: new Date().toISOString(),
      editedDate: null,
      isEdited: false,
      type: t,
    })
  } catch (err) {
    const { message } = normalizeError(err)
    console.error('[firestore] addComment:', err)
    throw new Error(message || 'Failed to add comment.')
  }
}

/**
 * Edit an existing comment (author or Admin in rules; caller should enforce author-only in UI for edit).
 *
 * @param {string} commentId - Firestore document id of the comment
 * @param {string} newText - Updated body
 * @returns {Promise<void>}
 */
export async function editComment(commentId, newText) {
  if (typeof commentId !== 'string' || commentId.trim() === '') {
    throw new Error('Comment id is required.')
  }
  const body = newText == null ? '' : String(newText).trim()
  if (body.length === 0) {
    throw new Error('Comment text cannot be empty.')
  }
  if (body.length > MAX_COMMENT_TEXT_LENGTH) {
    throw new Error(`Comment must be at most ${MAX_COMMENT_TEXT_LENGTH} characters.`)
  }

  const db = getDb()
  if (!db) {
    throw new Error('Firebase is not configured or Firestore failed to initialize.')
  }

  try {
    await updateDoc(doc(db, COL_COMMENTS, commentId.trim()), {
      text: body,
      editedDate: new Date().toISOString(),
      isEdited: true,
    })
  } catch (err) {
    const { message } = normalizeError(err)
    console.error('[firestore] editComment:', err)
    throw new Error(message || 'Failed to update comment.')
  }
}

/**
 * Delete a comment document.
 *
 * @param {string} commentId - Firestore document id
 * @returns {Promise<void>}
 */
export async function deleteComment(commentId) {
  if (typeof commentId !== 'string' || commentId.trim() === '') {
    throw new Error('Comment id is required.')
  }
  const db = getDb()
  if (!db) {
    throw new Error('Firebase is not configured or Firestore failed to initialize.')
  }
  try {
    await deleteDoc(doc(db, COL_COMMENTS, commentId.trim()))
  } catch (err) {
    const { message } = normalizeError(err)
    console.error('[firestore] deleteComment:', err)
    throw new Error(message || 'Failed to delete comment.')
  }
}

/**
 * One-time count of comments for a single test case.
 *
 * @param {string} testCaseId - Firestore doc id of the test case
 * @returns {Promise<number>}
 */
export async function getCommentCount(testCaseId) {
  if (typeof testCaseId !== 'string' || testCaseId.trim() === '') {
    return 0
  }
  const db = getDb()
  if (!db) return 0
  try {
    const q = query(
      collection(db, COL_COMMENTS),
      where('testCaseId', '==', testCaseId.trim()),
    )
    const snap = await getDocs(q)
    return snap.size
  } catch (err) {
    console.error('[firestore] getCommentCount:', err)
    return 0
  }
}

/**
 * Batch-fetch comment counts for many test cases using `where('testCaseId','in', chunk)` (10 ids per query; Firestore `in` limit is 30).
 *
 * On `permission-denied` (e.g. `comments` rules not deployed yet), returns partial counts already
 * accumulated and logs a warning instead of throwing so **View All** still loads.
 *
 * @param {string[]} testCaseIds - Distinct Firestore test case document ids
 * @returns {Promise<Record<string, number>>} Map of testCaseId → count
 * @throws {Error} When Firestore is unavailable or a non-permission query fails.
 */
export async function fetchCommentCountsByTestCaseIds(testCaseIds) {
  /** @type {Record<string, number>} */
  const out = {}
  const ids = Array.from(
    new Set(
      (Array.isArray(testCaseIds) ? testCaseIds : [])
        .filter((id) => typeof id === 'string' && id.trim() !== '')
        .map((id) => id.trim()),
    ),
  )
  if (ids.length === 0) return out

  const db = getDb()
  if (!db) {
    const msg = 'Firebase is not configured or Firestore failed to initialize.'
    console.error('[firestore] fetchCommentCountsByTestCaseIds:', msg)
    throw new Error(msg)
  }

  const CHUNK = 10
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK)
    try {
      const q = query(collection(db, COL_COMMENTS), where('testCaseId', 'in', chunk))
      const snap = await getDocs(q)
      snap.docs.forEach((d) => {
        const data = d.data()
        const tid = data && typeof data.testCaseId === 'string' ? data.testCaseId : ''
        if (!tid) return
        out[tid] = (out[tid] || 0) + 1
      })
    } catch (err) {
      const rawCode =
        err && typeof err === 'object' && 'code' in err ? String(/** @type {{ code?: string }} */ (err).code) : ''
      if (rawCode === 'permission-denied') {
        console.warn(
          '[firestore] fetchCommentCountsByTestCaseIds: permission denied reading `comments`. ' +
            'Deploy rules from this repo (npm run deploy:rules or firebase deploy --only firestore:rules). ' +
            'Comment badges are hidden until reads are allowed.',
        )
        return out
      }
      const { message } = normalizeError(err)
      console.error('[firestore] fetchCommentCountsByTestCaseIds:', err)
      throw new Error(message || 'Failed to load comment counts.')
    }
  }

  return out
}

