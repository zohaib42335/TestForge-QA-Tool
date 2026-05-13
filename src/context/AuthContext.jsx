/**
 * @fileoverview Firebase Authentication context: Google popup + email/password,
 * plus Firestore user profile and RBAC permission flags.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from 'firebase/auth'
import { doc, getDoc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore'
import {
  getFirebaseAuth,
  isFirebaseConfigured,
  firebaseConfigurationError,
} from '../firebase/config.js'
import { getDb } from '../firebase/firestore.js'
import { COL_USERS } from '../firebase/schema.js'
import { hasPermission } from '../constants/rbac.ts'

/**
 * @param {unknown} err
 * @returns {string}
 */
export function mapFirebaseAuthError(err) {
  const code =
    err && typeof err === 'object' && 'code' in err ? String(err.code) : ''
  const fallback =
    err && typeof err === 'object' && 'message' in err
      ? String(err.message)
      : 'Authentication failed. Please try again.'

  /** @type {Record<string, string>} */
  const map = {
    'auth/invalid-email': 'Invalid email address.',
    'auth/user-disabled': 'This account has been disabled.',
    'auth/user-not-found': 'No account found with this email.',
    'auth/wrong-password': 'Incorrect password.',
    'auth/invalid-credential':
      'Invalid email or password. If you use Google sign-in, try that instead.',
    'auth/email-already-in-use': 'That email is already registered. Sign in instead.',
    'auth/weak-password': 'Password must be at least 6 characters.',
    'auth/popup-closed-by-user': 'Sign-in was cancelled.',
    'auth/popup-blocked': 'Pop-up was blocked. Allow pop-ups for this site and try again.',
    'auth/network-request-failed': 'Network error. Check your connection and try again.',
    'auth/too-many-requests': 'Too many attempts. Wait a moment and try again.',
    'auth/operation-not-allowed':
      'This sign-in method is disabled in Firebase Console. Enable Email/Password and Google.',
    'auth/account-exists-with-different-credential':
      'An account already exists with this email using a different sign-in method.',
  }

  return map[code] || fallback
}

/** @type {import('react').Context<AuthContextValue|null>} */
const AuthContext = createContext(null)

/**
 * @typedef {Object} AuthContextValue
 * @property {import('firebase/auth').User|null} user - Firebase auth user (same as currentUser)
 * @property {import('firebase/auth').User|null} currentUser - Alias of `user`
 * @property {boolean} loading - True until first auth state is known
 * @property {string} configError - Non-empty if Firebase env vars are missing
 * @property {string} authError - Last operation error (user-facing); clear with clearAuthError
 * @property {() => void} clearAuthError
 * @property {() => Promise<void>} signInWithGoogle
 * @property {(email: string, password: string) => Promise<void>} signInWithEmailPassword
 * @property {(email: string, password: string, displayName: string) => Promise<void>} registerWithEmailPassword
 * @property {() => Promise<void>} signOutUser
 * @property {Record<string, unknown>|null} userProfile - Firestore users/{uid} document
 * @property {boolean} roleLoading - True while loading or creating the Firestore profile
 * @property {string} workspaceError - Non-empty if profile bootstrap failed
 * @property {() => Promise<void>} retryWorkspaceProfile - Re-run profile load for current user
 * @property {boolean} isAdmin
 * @property {boolean} isQALead
 * @property {boolean} isTester
 * @property {boolean} canCreate
 * @property {boolean} canEdit
 * @property {boolean} canDelete
 * @property {boolean} canManageRoles
 * @property {boolean} canImport
 * @property {boolean} canExport
 * @property {boolean} canCreateRun
 * @property {boolean} canDeleteRun
 * @property {boolean} canExecuteRun
 * @property {boolean} canBulkUpdate
 * @property {boolean} canDuplicate
 * @property {boolean} canManageTemplates
 */

/**
 * @param {{ children: import('react').ReactNode }} props
 */
export function AuthProvider({ children }) {
  /** @type {[import('firebase/auth').User|null, React.Dispatch<React.SetStateAction<import('firebase/auth').User|null>>]} */
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [userProfile, setUserProfile] = useState(/** @type {Record<string, unknown>|null} */ (null))
  const [roleLoading, setRoleLoading] = useState(true)
  const [workspaceError, setWorkspaceError] = useState('')
  const [configError] = useState(
    isFirebaseConfigured ? '' : firebaseConfigurationError,
  )
  const [authError, setAuthError] = useState('')

  const profileFetchGeneration = useRef(0)
  const lastProfileUid = useRef(/** @type {string|null} */ (null))

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setLoading(false)
      setUser(null)
      setUserProfile(null)
      setRoleLoading(false)
      setWorkspaceError('')
      return
    }

    const auth = getFirebaseAuth()
    if (!auth) {
      setLoading(false)
      setAuthError('Firebase Auth could not be initialized.')
      setUserProfile(null)
      setRoleLoading(false)
      setWorkspaceError('')
      return
    }

    const unsub = onAuthStateChanged(
      auth,
      (nextUser) => {
        setUser(nextUser)
        setLoading(false)

        if (!nextUser) {
          lastProfileUid.current = null
          setUserProfile(null)
          setRoleLoading(false)
          setWorkspaceError('')
          return
        }

        if (lastProfileUid.current !== nextUser.uid) {
          lastProfileUid.current = nextUser.uid
          setUserProfile(null)
        }
      },
      (err) => {
        profileFetchGeneration.current += 1
        setAuthError(mapFirebaseAuthError(err))
        setUser(null)
        setUserProfile(null)
        setWorkspaceError('')
        setRoleLoading(false)
        setLoading(false)
      },
    )

    return () => unsub()
  }, [])

  useEffect(() => {
    if (!isFirebaseConfigured) {
      return
    }

    if (!user) {
      setUserProfile(null)
      setRoleLoading(false)
      return
    }

    const db = getDb()
    if (!db) {
      setWorkspaceError('Firestore is not available.')
      setRoleLoading(false)
      return
    }

    const gen = (profileFetchGeneration.current += 1)
    setRoleLoading(true)
    setWorkspaceError('')

    const ref = doc(db, COL_USERS, user.uid)
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (gen !== profileFetchGeneration.current) return
        setUserProfile(snap.exists() ? { id: snap.id, ...snap.data() } : null)
        setWorkspaceError('')
        setRoleLoading(false)
      },
      (err) => {
        if (gen !== profileFetchGeneration.current) return
        console.error('[AuthContext] users/{uid} snapshot:', err)
        setWorkspaceError(
          err instanceof Error ? err.message : 'Could not load your profile.',
        )
        setRoleLoading(false)
      },
    )

    return () => {
      profileFetchGeneration.current += 1
      unsub()
    }
  }, [user?.uid])

  const retryWorkspaceProfile = useCallback(async () => {
    if (!isFirebaseConfigured) {
      setWorkspaceError(configError || firebaseConfigurationError)
      return
    }
    const auth = getFirebaseAuth()
    const u = auth?.currentUser
    if (!u) {
      setWorkspaceError('You are not signed in.')
      return
    }
    const db = getDb()
    if (!db) {
      setWorkspaceError('Firestore is not available.')
      return
    }
    setWorkspaceError('')
    try {
      const snap = await getDoc(doc(db, COL_USERS, u.uid))
      setUserProfile(snap.exists() ? { id: snap.id, ...snap.data() } : null)
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Could not load your workspace profile. Please try again.'
      console.error('[AuthContext] retryWorkspaceProfile:', err)
      setWorkspaceError(msg)
    }
  }, [configError])

  const clearAuthError = useCallback(() => setAuthError(''), [])

  /**
   * @returns {Promise<void>}
   */
  const signInWithGoogle = useCallback(async () => {
    setAuthError('')
    if (!isFirebaseConfigured) {
      setAuthError(configError || firebaseConfigurationError)
      return
    }
    const auth = getFirebaseAuth()
    if (!auth) {
      setAuthError('Firebase Auth is not available.')
      return
    }
    try {
      const provider = new GoogleAuthProvider()
      provider.setCustomParameters({ prompt: 'select_account' })
      await signInWithPopup(auth, provider)
    } catch (err) {
      setAuthError(mapFirebaseAuthError(err))
    }
  }, [configError])

  /**
   * @param {string} email
   * @param {string} password
   * @returns {Promise<void>}
   */
  const signInWithEmailPassword = useCallback(async (email, password) => {
    setAuthError('')
    if (!isFirebaseConfigured) {
      setAuthError(configError || firebaseConfigurationError)
      return
    }
    const auth = getFirebaseAuth()
    if (!auth) {
      setAuthError('Firebase Auth is not available.')
      return
    }
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password)
    } catch (err) {
      setAuthError(mapFirebaseAuthError(err))
    }
  }, [configError])

  /**
   * @param {string} email
   * @param {string} password
   * @param {string} displayName - Shown in the app and activity log (not your email)
   * @returns {Promise<void>}
   */
  const registerWithEmailPassword = useCallback(async (email, password, displayName) => {
    setAuthError('')
    if (!isFirebaseConfigured) {
      setAuthError(configError || firebaseConfigurationError)
      return
    }
    const auth = getFirebaseAuth()
    if (!auth) {
      setAuthError('Firebase Auth is not available.')
      return
    }
    const name = displayName == null ? '' : String(displayName).trim()
    if (!name) {
      setAuthError('Please enter your name.')
      return
    }
    try {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password)
      if (cred.user) {
        await updateProfile(cred.user, { displayName: name })
        const db = getDb()
        if (db) {
          await setDoc(
            doc(db, COL_USERS, cred.user.uid),
            {
              uid: cred.user.uid,
              email: cred.user.email ?? '',
              displayName: name,
              photoURL: cred.user.photoURL ?? null,
              projectId: null,
              onboardingComplete: false,
              createdAt: serverTimestamp(),
              lastLoginAt: serverTimestamp(),
            },
            { merge: true },
          )
        }
      }
    } catch (err) {
      setAuthError(mapFirebaseAuthError(err))
    }
  }, [configError])

  /**
   * @returns {Promise<void>}
   */
  const signOutUser = useCallback(async () => {
    setAuthError('')
    if (!isFirebaseConfigured) return
    const auth = getFirebaseAuth()
    if (!auth) return
    try {
      await signOut(auth)
      if (typeof window !== 'undefined') {
        window.location.replace('/login')
      }
    } catch (err) {
      setAuthError(mapFirebaseAuthError(err))
    }
  }, [])

  const {
    isAdmin,
    isQALead,
    isTester,
    canCreate,
    canEdit,
    canDelete,
    canManageRoles,
    canImport,
    canExport,
    canCreateRun,
    canDeleteRun,
    canExecuteRun,
    canBulkUpdate,
    canDuplicate,
    canManageTemplates,
  } = useMemo(() => {
    const rawRole =
      userProfile && typeof userProfile.role === 'string' ? userProfile.role : ''
    // Backward compatibility: older data uses "Tester".
    /** @type {import('../constants/rbac.ts').Role} */
    const role =
      rawRole === 'Tester'
        ? 'Member'
        : rawRole === 'Owner' ||
            rawRole === 'Admin' ||
            rawRole === 'QA Lead' ||
            rawRole === 'Member' ||
            rawRole === 'Viewer'
          ? rawRole
          : 'Member'

    const admin = role === 'Admin' || role === 'Owner'
    const qaLead = role === 'QA Lead'
    const tester = role === 'Member'
    const signedInWithProfile = Boolean(
      user && userProfile && !workspaceError && !roleLoading,
    )

    return {
      isAdmin: admin,
      isQALead: qaLead,
      isTester: tester,
      canCreate: hasPermission(role, 'testcase_create'),
      canEdit: hasPermission(role, 'testcase_edit'),
      canDelete: hasPermission(role, 'testcase_delete'),
      canManageRoles: hasPermission(role, 'team_manage'),
      canImport: hasPermission(role, 'testcase_create'),
      canExport: hasPermission(role, 'report_view'),
      canCreateRun: hasPermission(role, 'run_create'),
      canDeleteRun: hasPermission(role, 'run_delete'),
      canExecuteRun: signedInWithProfile,
      canBulkUpdate: hasPermission(role, 'testcase_edit'),
      canDuplicate: hasPermission(role, 'testcase_create'),
      canManageTemplates: hasPermission(role, 'testcase_create'),
    }
  }, [user, userProfile, workspaceError, roleLoading])

  const value = useMemo(
    () => ({
      user,
      currentUser: user,
      loading,
      configError,
      authError,
      clearAuthError,
      signInWithGoogle,
      signInWithEmailPassword,
      registerWithEmailPassword,
      signOutUser,
      userProfile,
      roleLoading,
      workspaceError,
      retryWorkspaceProfile,
      isAdmin,
      isQALead,
      isTester,
      canCreate,
      canEdit,
      canDelete,
      canManageRoles,
      canImport,
      canExport,
      canCreateRun,
      canDeleteRun,
      canExecuteRun,
      canBulkUpdate,
      canDuplicate,
      canManageTemplates,
    }),
    [
      user,
      loading,
      configError,
      authError,
      clearAuthError,
      signInWithGoogle,
      signInWithEmailPassword,
      registerWithEmailPassword,
      signOutUser,
      userProfile,
      roleLoading,
      workspaceError,
      retryWorkspaceProfile,
      isAdmin,
      isQALead,
      isTester,
      canCreate,
      canEdit,
      canDelete,
      canManageRoles,
      canImport,
      canExport,
      canCreateRun,
      canDeleteRun,
      canExecuteRun,
      canBulkUpdate,
      canDuplicate,
      canManageTemplates,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

/**
 * @returns {AuthContextValue}
 */
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return ctx
}
