import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { useAuth } from '../context/AuthContext.jsx'
import {
  hasPermission as hasRolePermission,
  type Permission,
  type Role,
} from '../constants/rbac'
import { getDb } from '../firebase/firestore.js'
import { snapshotExists } from '../utils/firestoreSnapshot.js'

type RoleContextValue = {
  userRole: Role | null
  hasPermission: (permission: Permission) => boolean
  isOwner: boolean
  isAdmin: boolean
  isQALead: boolean
  isMember: boolean
  isViewer: boolean
  loading: boolean
}

const RoleContext = createContext<RoleContextValue>({
  userRole: null,
  hasPermission: () => false,
  isOwner: false,
  isAdmin: false,
  isQALead: false,
  isMember: false,
  isViewer: false,
  loading: true,
})

function normalizeRole(raw: unknown): Role | null {
  const v = raw == null ? '' : String(raw)
  if (v === 'Tester') return 'Member'
  if (v === 'Owner' || v === 'Admin' || v === 'QA Lead' || v === 'Member' || v === 'Viewer') {
    return v
  }
  return null
}

type RoleProviderProps = {
  projectId: string | null | undefined
  children: ReactNode
}

export function RoleProvider({ projectId, children }: RoleProviderProps) {
  const { user } = useAuth()
  const [userRole, setUserRole] = useState<Role | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    const uid = user?.uid ?? ''
    const pid = projectId ?? ''

    if (!uid || !pid) {
      setUserRole(null)
      setLoading(false)
      return
    }

    const db = getDb()
    if (!db) {
      setUserRole(null)
      setLoading(false)
      return
    }

    setLoading(true)
    void (async () => {
      try {
        const ref = doc(db, `projects/${pid}/members/${uid}`)
        const snap = await getDoc(ref)
        if (cancelled) return
        const role = snapshotExists(snap) ? normalizeRole(snap.data()?.role) : null
        setUserRole(role)
      } catch {
        if (cancelled) return
        setUserRole(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [projectId, user?.uid])

  const hasPermission = useCallback(
    (permission: Permission) => {
      if (!userRole) return false
      return hasRolePermission(userRole, permission)
    },
    [userRole],
  )

  const value = useMemo<RoleContextValue>(
    () => ({
      userRole,
      hasPermission,
      isOwner: userRole === 'Owner',
      isAdmin: userRole === 'Admin',
      isQALead: userRole === 'QA Lead',
      isMember: userRole === 'Member',
      isViewer: userRole === 'Viewer',
      loading,
    }),
    [hasPermission, loading, userRole],
  )

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>
}

export { RoleContext }

export function useRoleContext() {
  return useContext(RoleContext)
}

