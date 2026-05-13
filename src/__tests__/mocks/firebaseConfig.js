/** Jest stub: real config uses Vite `import.meta.env`, which Node/Jest cannot parse. */

export const isFirebaseConfigured = false
export const firebaseConfigurationError = ''
export const getFirebaseApp = jest.fn(() => null)
export const getFirebaseAuth = jest.fn(() => null)
export const getFirebaseFunctions = jest.fn(() => null)
export const getFirebaseStorage = jest.fn(() => null)
export const ensureFirestoreOfflinePersistence = jest.fn(() => Promise.resolve())
export const getFirebaseWebConfig = jest.fn(() => ({
  ok: false,
  message: 'Jest: Firebase not configured.',
}))
