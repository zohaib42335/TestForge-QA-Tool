/**
 * @fileoverview Firebase Web SDK initialization using Vite environment variables.
 * Call `ensureFirestoreOfflinePersistence()` once at app startup (see `main.jsx`) before
 * heavy Firestore usage so IndexedDB persistence can attach cleanly.
 */

import { initializeApp, getApps } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions'
import {
  getFirestore,
  enableMultiTabIndexedDbPersistence,
  enableIndexedDbPersistence,
} from 'firebase/firestore'

/**
 * Reads a trimmed env value or null if missing.
 * @param {string} key
 * @returns {string|null}
 */
function readEnv(key) {
  try {
    const v = import.meta.env[key]
    if (v == null || String(v).trim() === '') return null
    return String(v).trim()
  } catch {
    return null
  }
}

/**
 * Validates Firebase web config from `.env` (VITE_* keys).
 * @returns {{ ok: true, config: import('firebase/app').FirebaseOptions } | { ok: false, message: string }}
 */
export function getFirebaseWebConfig() {
  const apiKey = readEnv('VITE_FIREBASE_API_KEY')
  const authDomain = readEnv('VITE_FIREBASE_AUTH_DOMAIN')
  const projectId = readEnv('VITE_FIREBASE_PROJECT_ID')
  const storageBucket = readEnv('VITE_FIREBASE_STORAGE_BUCKET')
  const messagingSenderId = readEnv('VITE_FIREBASE_MESSAGING_SENDER_ID')
  const appId = readEnv('VITE_FIREBASE_APP_ID')
  const databaseURL =
    readEnv('VITE_FIREBASE_DATABASE_URL') ||
    (projectId ? `https://${projectId}-default-rtdb.firebaseio.com` : null)

  /** @type {string[]} */
  const missing = []
  if (!apiKey) missing.push('VITE_FIREBASE_API_KEY')
  if (!authDomain) missing.push('VITE_FIREBASE_AUTH_DOMAIN')
  if (!projectId) missing.push('VITE_FIREBASE_PROJECT_ID')
  if (!storageBucket) missing.push('VITE_FIREBASE_STORAGE_BUCKET')
  if (!messagingSenderId) missing.push('VITE_FIREBASE_MESSAGING_SENDER_ID')
  if (!appId) missing.push('VITE_FIREBASE_APP_ID')

  if (missing.length > 0) {
    return {
      ok: false,
      message: `Firebase is not configured. Add these to .env and restart the dev server: ${missing.join(', ')}.`,
    }
  }

  /** @type {import('firebase/app').FirebaseOptions} */
  const config = {
    apiKey,
    authDomain,
    projectId,
    storageBucket,
    messagingSenderId,
    appId,
  }
  if (databaseURL) {
    config.databaseURL = databaseURL
  }

  return { ok: true, config }
}

const _cfg = getFirebaseWebConfig()

/** @type {boolean} */
export const isFirebaseConfigured = _cfg.ok

/** @type {string} */
export const firebaseConfigurationError = _cfg.ok ? '' : _cfg.message

/** @type {import('firebase/app').FirebaseApp|null} */
let firebaseApp = null

/** @type {Promise<void>|null} */
let persistenceInitPromise = null

/**
 * Returns the singleton Firebase app, or null if env is incomplete.
 * @returns {import('firebase/app').FirebaseApp|null}
 */
export function getFirebaseApp() {
  if (!_cfg.ok) return null
  if (!firebaseApp) {
    firebaseApp =
      getApps().length > 0 ? getApps()[0] : initializeApp(_cfg.config)
  }
  return firebaseApp
}

/**
 * Enables Firestore offline persistence (multi-tab IndexedDB when supported).
 * Safe to call once at startup; repeated calls return the same promise.
 *
 * Caveats (Firebase):
 * - Only one persistence mode per origin; multiple tabs coordinate via multi-tab manager.
 * - `failed-precondition` usually means another tab holds the persistence lock — data still works.
 * - `unimplemented` means the browser/environment cannot use IndexedDB persistence.
 *
 * @returns {Promise<void>}
 */
export function ensureFirestoreOfflinePersistence() {
  if (!_cfg.ok) return Promise.resolve()
  if (persistenceInitPromise) return persistenceInitPromise

  persistenceInitPromise = (async () => {
    const app = getFirebaseApp()
    if (!app) return
    const db = getFirestore(app)
    try {
      await enableMultiTabIndexedDbPersistence(db)
    } catch (err) {
      const code =
        err && typeof err === 'object' && 'code' in err ? String(err.code) : ''
      if (code === 'unimplemented') {
        try {
          await enableIndexedDbPersistence(db)
        } catch (e2) {
          console.warn('[firebase] enableIndexedDbPersistence:', e2)
        }
      } else if (code === 'failed-precondition') {
        console.warn(
          '[firebase] Multi-tab persistence could not be enabled in this context (e.g. another tab or Private Browsing). Firestore still works; cache may be limited.',
        )
      } else {
        console.warn('[firebase] enableMultiTabIndexedDbPersistence:', err)
      }
    }
  })()

  return persistenceInitPromise
}

/**
 * Returns the Firebase Auth instance, or null if not configured.
 * @returns {import('firebase/auth').Auth|null}
 */
export function getFirebaseAuth() {
  const app = getFirebaseApp()
  if (!app) return null
  return getAuth(app)
}

/**
 * Returns the Firebase Cloud Functions instance, or null if not configured.
 * In Vite dev mode, automatically connects to the local Functions emulator
 * so the ANTHROPIC_API_KEY in functions/.env is used instead of Secret Manager.
 * @returns {import('firebase/functions').Functions|null}
 */
let _fnsInstance = null
export function getFirebaseFunctions() {
  const app = getFirebaseApp()
  if (!app) return null
  if (_fnsInstance) return _fnsInstance
  _fnsInstance = getFunctions(app)
  // Connect to the local emulator when running `npm run dev`
  if (import.meta.env.DEV) {
    try {
      connectFunctionsEmulator(_fnsInstance, 'localhost', 5001)
    } catch {
      // already connected (hot-reload safe)
    }
  }
  return _fnsInstance
}
