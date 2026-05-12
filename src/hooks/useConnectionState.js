/**
 * @fileoverview Tracks Firebase connectivity for UI indicators.
 * Preferentially subscribes to Realtime Database `/.info/connected`, which mirrors the
 * client’s connection to Firebase backends. Falls back to the browser’s `online` / `offline`
 * events if RTDB is unavailable (e.g. missing `databaseURL` or RTDB not provisioned).
 *
 * @returns {{ isOnline: boolean }}
 */

import { useEffect, useState } from 'react'
import { getDatabase, onValue, ref } from 'firebase/database'
import { getFirebaseApp, isFirebaseConfigured } from '../firebase/config.js'

/**
 * Live connection hint for the app shell (Firestore offline cache works independently).
 *
 * @returns {{ isOnline: boolean }}
 */
export function useConnectionState() {
  const [isOnline, setIsOnline] = useState(
    () => typeof navigator !== 'undefined' && navigator.onLine,
  )

  useEffect(() => {
    const onBrowserOnline = () => setIsOnline(true)
    const onBrowserOffline = () => setIsOnline(false)

    if (typeof window !== 'undefined') {
      window.addEventListener('online', onBrowserOnline)
      window.addEventListener('offline', onBrowserOffline)
    }

    const app = getFirebaseApp()
    /** @type {(() => void) | null} */
    let rtdbUnsub = null

    if (app && isFirebaseConfigured) {
      try {
        const rtdb = getDatabase(app)
        const connectedRef = ref(rtdb, '.info/connected')
        rtdbUnsub = onValue(
          connectedRef,
          (snap) => {
            setIsOnline(!!snap.val())
          },
          (err) => {
            console.warn('[useConnectionState] .info/connected listener failed.', err)
          },
        )
      } catch (e) {
        console.warn(
          '[useConnectionState] Could not subscribe to .info/connected; using browser online state only.',
          e,
        )
      }
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', onBrowserOnline)
        window.removeEventListener('offline', onBrowserOffline)
      }
      if (typeof rtdbUnsub === 'function') {
        rtdbUnsub()
      }
    }
  }, [])

  return { isOnline }
}
