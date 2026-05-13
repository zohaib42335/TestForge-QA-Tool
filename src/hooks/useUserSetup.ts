import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import type { User } from 'firebase/auth'
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { getDb } from '../firebase/firestore.js'
import { COL_USERS } from '../firebase/schema.js'
import { isFirebaseConfigured } from '../firebase/config.js'

function shouldRedirectFromPublicEntry(pathname: string) {
  const p = pathname.replace(/\/+$/, '') || '/'
  if (p === '/' || p === '/login' || p === '/signup') return true
  if (p.startsWith('/invite')) return true
  return false
}

/**
 * Runs after Firebase Auth reports a signed-in user: ensures `users/{uid}` exists,
 * updates `lastLoginAt`, and routes from public entry URLs (/login, /signup, /, /invite/*).
 */
export function useUserSetup(user: User | null, authLoading: boolean) {
  const navigate = useNavigate()
  const genRef = useRef(0)

  useEffect(() => {
    if (!isFirebaseConfigured || authLoading) return
    if (!user) return

    const db = getDb()
    if (!db) return

    const gen = ++genRef.current
    const uid = user.uid
    const userRef = doc(db, COL_USERS, uid)

    void (async () => {
      try {
        const snap = await getDoc(userRef)
        if (gen !== genRef.current) return

        if (!snap.exists()) {
          await setDoc(userRef, {
            uid,
            email: user.email ?? '',
            displayName: user.displayName ?? '',
            photoURL: user.photoURL ?? null,
            projectId: null,
            onboardingComplete: false,
            createdAt: serverTimestamp(),
            lastLoginAt: serverTimestamp(),
          })
          if (gen !== genRef.current) return
          const path =
            typeof window !== 'undefined' ? window.location.pathname || '/' : '/'
          if (shouldRedirectFromPublicEntry(path)) {
            const returnToRaw =
              typeof window !== 'undefined'
                ? new URLSearchParams(window.location.search || '').get('returnTo')
                : null
            const returnTo =
              returnToRaw &&
              returnToRaw.startsWith('/') &&
              !returnToRaw.startsWith('//') &&
              !returnToRaw.includes('://')
                ? decodeURIComponent(returnToRaw)
                : null
            navigate(returnTo || '/onboarding', { replace: true })
          }
          return
        }

        const data = snap.data()
        await updateDoc(userRef, { lastLoginAt: serverTimestamp() })
        if (gen !== genRef.current) return

        const projectIdRaw = data.projectId
        const projectId =
          typeof projectIdRaw === 'string' && projectIdRaw.trim() !== ''
            ? projectIdRaw.trim()
            : null
        const oc = data.onboardingComplete

        const path =
          typeof window !== 'undefined' ? window.location.pathname || '/' : '/'
        const fromPublic = shouldRedirectFromPublicEntry(path)
        const returnToRaw =
          typeof window !== 'undefined'
            ? new URLSearchParams(window.location.search || '').get('returnTo')
            : null
        const returnTo =
          returnToRaw &&
          returnToRaw.startsWith('/') &&
          !returnToRaw.startsWith('//') &&
          !returnToRaw.includes('://')
            ? decodeURIComponent(returnToRaw)
            : null

        if (oc === false) {
          if (fromPublic && path.replace(/\/+$/, '') !== '/onboarding') {
            navigate(returnTo || '/onboarding', { replace: true })
          }
          return
        }

        if (oc === true && projectId) {
          if (fromPublic) {
            navigate('/dashboard', { replace: true })
          }
          return
        }

        if (oc === true && !projectId) {
          if (fromPublic && path.replace(/\/+$/, '') !== '/onboarding') {
            navigate(returnTo || '/onboarding', { replace: true })
          }
          return
        }

        // `onboardingComplete` undefined — treat existing projectId as legacy complete
        if (projectId) {
          if (fromPublic) {
            navigate('/dashboard', { replace: true })
          }
          return
        }

        if (fromPublic && path.replace(/\/+$/, '') !== '/onboarding') {
          navigate(returnTo || '/onboarding', { replace: true })
        }
      } catch (e) {
        console.error('[useUserSetup]', e)
      }
    })()
  }, [user, authLoading, navigate])
}
