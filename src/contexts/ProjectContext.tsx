import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
} from 'firebase/firestore'
import type { Role } from '../constants/rbac'
import { useAuth } from '../context/AuthContext.jsx'
import { getDb } from '../firebase/firestore.js'
import { callAcceptInvite } from '../firebase/inviteCallables'
import { COL_PROJECTS, COL_USERS } from '../firebase/schema.js'
import { snapshotExists } from '../utils/firestoreSnapshot.js'

export type Project = {
  id: string
  name?: string
  description?: string
  slug?: string
  ownerId?: string
  plan?: string
  logoUrl?: string | null
  settings?: {
    allowMemberInvites?: boolean
    requireApproval?: boolean
  }
  [key: string]: unknown
}

export type Member = {
  id: string
  uid?: string
  email?: string
  displayName?: string
  photoURL?: string | null
  role?: string
  joinedAt?: unknown
  invitedBy?: string | null
  status?: string
  [key: string]: unknown
}

function normalizeRole(raw: unknown): Role | null {
  const v = raw == null ? '' : String(raw)
  if (v === 'Tester') return 'Member'
  if (v === 'Owner' || v === 'Admin' || v === 'QA Lead' || v === 'Member' || v === 'Viewer') {
    return v
  }
  return null
}

type ProjectContextValue = {
  projectId: string | null
  project: Project | null
  userRole: Role | null
  memberData: Member | null
  loading: boolean
  error: string | null
  inviteMember: (
    email: string | null,
    role: string,
  ) => Promise<{ inviteLink: string; token: string }>
  acceptInviteToken: (token: string) => Promise<{
    projectId: string
    role: string
    projectName: string
  }>
}

const ProjectContext = createContext<ProjectContextValue>({
  projectId: null,
  project: null,
  userRole: null,
  memberData: null,
  loading: true,
  error: null,
  inviteMember: async () => {
    throw new Error('useProject must be used within ProjectProvider.')
  },
  acceptInviteToken: async () => {
    throw new Error('useProject must be used within ProjectProvider.')
  },
})

export function ProjectProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [projectId, setProjectId] = useState<string | null>(null)
  const [project, setProject] = useState<Project | null>(null)
  const [memberData, setMemberData] = useState<Member | null>(null)
  const [userRole, setUserRole] = useState<Role | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) {
      setProjectId(null)
      setProject(null)
      setMemberData(null)
      setUserRole(null)
      setLoading(false)
      setError(null)
      return
    }

    const db = getDb()
    if (!db) {
      setProjectId(null)
      setProject(null)
      setMemberData(null)
      setUserRole(null)
      setLoading(false)
      setError('Firestore is not available.')
      return
    }

    setLoading(true)
    setError(null)

    const userRef = doc(db, COL_USERS, user.uid)
    const unsubUser = onSnapshot(
      userRef,
      (snap) => {
        if (!snapshotExists(snap)) {
          setProjectId(null)
          setLoading(false)
          return
        }
        const d = snap.data()
        const pid =
          d.projectId != null && String(d.projectId).trim() !== ''
            ? String(d.projectId).trim()
            : null
        setProjectId(pid)
      },
      (err) => {
        setError(err.message || 'Could not read user profile.')
        setLoading(false)
      },
    )

    return () => unsubUser()
  }, [user?.uid])

  useEffect(() => {
    if (!user || !projectId) {
      setProject(null)
      setMemberData(null)
      setUserRole(null)
      if (user && !projectId) {
        setLoading(false)
      }
      return
    }

    const db = getDb()
    if (!db) return

    setLoading(true)
    const pref = doc(db, 'projects', projectId)
    const mref = doc(db, 'projects', projectId, 'members', user.uid)

    const offP = onSnapshot(
      pref,
      (snap) => {
        setProject(
          snapshotExists(snap) ? { id: snap.id, ...(snap.data() as Record<string, unknown>) } : null,
        )
      },
      (err) => setError(err.message || 'Could not read project.'),
    )

    const offM = onSnapshot(
      mref,
      (snap) => {
        if (!snapshotExists(snap)) {
          setMemberData(null)
          setUserRole(null)
        } else {
          const data = snap.data()
          setMemberData({ id: snap.id, ...(data as Record<string, unknown>) })
          setUserRole(normalizeRole(data.role))
        }
        setLoading(false)
      },
      (err) => {
        setError(err.message || 'Could not read membership.')
        setLoading(false)
      },
    )

    return () => {
      offP()
      offM()
    }
  }, [user?.uid, projectId])

  const inviteMember = useCallback(
    async (email: string | null, role: string) => {
      if (!projectId) {
        throw new Error('No active project.')
      }
      const db = getDb()
      if (!db) throw new Error('Firestore is not available.')

      const normalized =
        email != null && String(email).trim() !== '' ? String(email).trim().toLowerCase() : null

      // Check for existing pending invite
      if (normalized) {
        const pendingQ = query(
          collection(db, COL_PROJECTS, projectId, 'invites'),
          where('email', '==', normalized),
          where('status', '==', 'pending'),
          limit(1),
        )
        const pendingSnap = await getDocs(pendingQ)
        if (!pendingSnap.empty) {
          const existing = pendingSnap.docs[0]
          const token = String(existing.get('token') ?? '').trim()
          const origin = window.location?.origin?.replace(/\/+$/, '') || 'https://testforge.app'
          return { inviteLink: `${origin}/invite/${token}`, token }
        }

        // Check if already a member
        const membersQ = query(
          collection(db, COL_PROJECTS, projectId, 'members'),
          where('email', '==', normalized),
          limit(1),
        )
        const membersSnap = await getDocs(membersQ)
        if (!membersSnap.empty) {
          throw new Error('User is already a member.')
        }
      }

      // Create invite document directly in Firestore
      const token = crypto.randomUUID()
      const openInvite = normalized == null
      const inviteRef = doc(collection(db, COL_PROJECTS, projectId, 'invites'))

      const inviteData: Record<string, unknown> = {
        token,
        email: normalized,
        openInvite,
        role,
        invitedBy: user?.uid ?? null,
        invitedAt: serverTimestamp(),
        expiresAt: Timestamp.fromMillis(Date.now() + 7 * 24 * 60 * 60 * 1000),
        status: 'pending',
      }
      if (project?.name) inviteData.projectName = project.name
      if (user?.displayName || user?.email) {
        inviteData.invitedByName = user.displayName || user.email
      }

      await setDoc(inviteRef, inviteData)

      const origin = window.location?.origin?.replace(/\/+$/, '') || 'https://testforge.app'
      return {
        inviteLink: `${origin}/invite/${token}`,
        token,
      }
    },
    [projectId, project, user],
  )

  const acceptInviteToken = useCallback(async (token: string) => {
    return callAcceptInvite(String(token ?? '').trim())
  }, [])

  const value = useMemo(
    () => ({
      projectId,
      project,
      userRole,
      memberData,
      loading,
      error,
      inviteMember,
      acceptInviteToken,
    }),
    [projectId, project, userRole, memberData, loading, error, inviteMember, acceptInviteToken],
  )

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>
}

export function useProject() {
  return useContext(ProjectContext)
}
