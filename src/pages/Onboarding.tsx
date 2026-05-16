import React, { useEffect, useMemo, useState } from 'react'
import {
  Link,
  Navigate,
  useNavigate,
  useSearchParams,
} from 'react-router-dom'
import {
  Timestamp,
  addDoc,
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import type { User } from 'firebase/auth'
import { useAuth } from '../context/AuthContext.jsx'
import { getDb } from '../firebase/firestore.js'
import { COL_PROJECTS, COL_USERS } from '../firebase/schema.js'
import { getFirebaseStorage } from '../firebase/config.js'
import {
  clearPendingInviteFromStorage,
  readPendingInviteFromStorage,
} from '../utils/pendingInviteStorage.js'
import { LogoStacked } from '../components/Logo.jsx'
import { snapshotExists } from '../utils/firestoreSnapshot.js'
import { sendInviteEmail } from '../services/emailService'

const inputClass =
  'w-full rounded-lg border-[0.5px] border-[#B0C0E0] bg-white px-3 py-2.5 text-sm text-[#1A3263] outline-none transition placeholder:text-[#8A9BBF] hover:border-[#8A9BBF] focus:border-[#1A3263] focus:ring-2 focus:ring-[rgba(26,50,99,0.15)]'
const labelClass = 'mb-1.5 block text-sm font-medium text-[#1A3263]'
const primaryBtnClass =
  'w-full rounded-lg bg-[#1A3263] py-3 text-sm font-semibold text-white transition hover:bg-[#122247] disabled:cursor-not-allowed disabled:opacity-60'
const outlineBtnClass =
  'rounded-lg border-[0.5px] border-[#B0C0E0] bg-white py-3 text-sm font-semibold text-[#1A3263] transition hover:border-[#1A3263] hover:bg-[#EEF2FB]'
const pageShellClass =
  'flex min-h-screen flex-col items-center bg-[#EEF2FB] px-4 py-12 text-[#1A3263]'
const cardClass =
  'w-full max-w-lg rounded-2xl border border-[#B0C0E0] bg-white p-8 shadow-sm'

const INVITE_ROLES = ['Admin', 'QA Lead', 'Member', 'Viewer'] as const
type InviteRole = (typeof INVITE_ROLES)[number]

type JobTitle =
  | 'QA Engineer'
  | 'QA Lead / Manager'
  | 'Developer'
  | 'Product Manager'

type InviteChip = { email: string; role: InviteRole }

type ResolvedInvite = {
  projectId: string
  inviteId: string
  email: string
  openInvite: boolean
  role: string
  status: string
  token: string
  invitedBy: string
  invitedAt?: Timestamp
  expiresAt?: Timestamp | null
  projectName?: string
  invitedByName?: string
}

function slugify(name: string): string {
  const s = name
    .toLowerCase()
    .trim()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return s || 'workspace'
}

function randomSuffix(): string {
  return String(Math.floor(100 + Math.random() * 900))
}

function isExpired(ts: Timestamp | undefined | null): boolean {
  if (!ts || typeof ts.toMillis !== 'function') return false
  return ts.toMillis() < Date.now()
}

function normalizeEmail(e: string): string {
  return e.trim().toLowerCase()
}

function IconUpload(props: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={props.className} aria-hidden>
      <path d="M12 16V4m0 0l4 4m-4-4L8 8M4 20h16" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function IconChecklist(props: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={props.className} aria-hidden>
      <path d="M9 5H5v4M9 19H5v-4M19 9h-4M19 15h-4M9 9l2 2 4-4" strokeLinecap="round" />
    </svg>
  )
}
function IconShield(props: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={props.className} aria-hidden>
      <path d="M12 3l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V7l8-4z" strokeLinejoin="round" />
    </svg>
  )
}
function IconCode(props: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={props.className} aria-hidden>
      <path d="M8 9l-3 3 3 3M16 9l3 3-3 3M14 5l-4 14" strokeLinecap="round" />
    </svg>
  )
}
function IconChart(props: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={props.className} aria-hidden>
      <path d="M4 19V5M8 17V9m4 8V7m4 10v-6" strokeLinecap="round" />
    </svg>
  )
}

function StepDots({ step }: { step: 1 | 2 | 3 }) {
  return (
    <div className="mb-8 flex justify-center gap-2">
      {([1, 2, 3] as const).map((n) => (
        <div
          key={n}
          className={`h-2.5 w-2.5 rounded-full transition ${
            n === step ? 'scale-125 bg-[#1A3263]' : 'bg-[#B0C0E0]'
          }`}
          title={`Step ${n}`}
        />
      ))}
    </div>
  )
}

function BrandHeader() {
  return (
    <div className="mb-8 flex flex-col items-center">
      <LogoStacked size="lg" />
    </div>
  )
}

async function isSlugTaken(db: ReturnType<typeof getDb>, slug: string): Promise<boolean> {
  if (!db) return false
  const q = query(collection(db, COL_PROJECTS), where('slug', '==', slug), limit(1))
  const snap = await getDocs(q)
  return !snap.empty
}

async function ensureUniqueSlug(db: ReturnType<typeof getDb>, baseSlug: string): Promise<string> {
  let slug = baseSlug
  for (let i = 0; i < 12; i++) {
    if (!(await isSlugTaken(db, slug))) return slug
    slug = `${baseSlug}-${randomSuffix()}`
  }
  return `${baseSlug}-${Date.now()}`
}

async function resolveInviteForUser(
  db: NonNullable<ReturnType<typeof getDb>>,
  user: User,
  inviteParam: string,
  projectParam: string,
): Promise<ResolvedInvite | null | 'not_found'> {
  const emailLower = normalizeEmail(user.email ?? '')

  const tryDoc = async (pid: string, inv: string) => {
    const ref = doc(db, COL_PROJECTS, pid, 'invites', inv)
    const snap = await getDoc(ref)
    if (!snapshotExists(snap)) return null
    const d = snap.data()
    const openInvite = d.openInvite === true
    return {
      projectId: pid,
      inviteId: snap.id,
      email: String(d.email ?? ''),
      openInvite,
      role: String(d.role ?? 'Member'),
      status: String(d.status ?? ''),
      token: String(d.token ?? ''),
      invitedBy: String(d.invitedBy ?? ''),
      invitedAt: d.invitedAt as Timestamp | undefined,
      expiresAt: (d.expiresAt as Timestamp | undefined) ?? null,
      projectName: d.projectName != null ? String(d.projectName) : undefined,
      invitedByName: d.invitedByName != null ? String(d.invitedByName) : undefined,
    } as ResolvedInvite
  }

  if (projectParam) {
    const direct = await tryDoc(projectParam, inviteParam)
    if (direct) return direct
    const q = query(
      collection(db, COL_PROJECTS, projectParam, 'invites'),
      where('token', '==', inviteParam),
      limit(1),
    )
    const alt = await getDocs(q)
    if (!alt.empty) {
      const docSnap = alt.docs[0]
      const d = docSnap.data()
      return {
        projectId: projectParam,
        inviteId: docSnap.id,
        email: String(d.email ?? ''),
        openInvite: d.openInvite === true,
        role: String(d.role ?? 'Member'),
        status: String(d.status ?? ''),
        token: String(d.token ?? ''),
        invitedBy: String(d.invitedBy ?? ''),
        invitedAt: d.invitedAt as Timestamp | undefined,
        expiresAt: (d.expiresAt as Timestamp | undefined) ?? null,
        projectName: d.projectName != null ? String(d.projectName) : undefined,
        invitedByName: d.invitedByName != null ? String(d.invitedByName) : undefined,
      }
    }
    return 'not_found'
  }

  const cg = query(
    collectionGroup(db, 'invites'),
    where('token', '==', inviteParam),
    limit(5),
  )
  const snap = await getDocs(cg)
  for (const docSnap of snap.docs) {
    const d = docSnap.data()
    const openInvite = d.openInvite === true
    const invited = normalizeEmail(String(d.email ?? ''))
    if (!openInvite && (!emailLower || invited !== emailLower)) continue
    const pathParts = docSnap.ref.path.split('/')
    const pid = pathParts[1]
    return {
      projectId: pid,
      inviteId: docSnap.id,
      email: String(d.email ?? ''),
      openInvite,
      role: String(d.role ?? 'Member'),
      status: String(d.status ?? ''),
      token: String(d.token ?? ''),
      invitedBy: String(d.invitedBy ?? ''),
      invitedAt: d.invitedAt as Timestamp | undefined,
      expiresAt: (d.expiresAt as Timestamp | undefined) ?? null,
      projectName: d.projectName != null ? String(d.projectName) : undefined,
      invitedByName: d.invitedByName != null ? String(d.invitedByName) : undefined,
    }
  }
  return 'not_found'
}

export default function Onboarding() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user } = useAuth()

  const inviteFromUrl = String(searchParams.get('invite') ?? '').trim()
  const projectFromUrl = String(searchParams.get('project') ?? '').trim()

  const [pending] = useState(() => readPendingInviteFromStorage())
  const isPathB = Boolean(inviteFromUrl || pending?.invite)

  const [checkingUser, setCheckingUser] = useState(!!user)
  const [alreadyInProject, setAlreadyInProject] = useState(false)

  const [pathBState, setPathBState] = useState<
    'loading' | 'guest' | 'invalid' | 'expired' | 'accepted' | 'ready' | 'wrong_email'
  >('loading')
  const [resolvedInvite, setResolvedInvite] = useState<ResolvedInvite | null>(null)
  const [pathBError, setPathBError] = useState('')
  const [pathBBusy, setPathBBusy] = useState(false)

  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [workspaceName, setWorkspaceName] = useState('')
  const [workspaceDescription, setWorkspaceDescription] = useState('')
  const [slugPreview, setSlugPreview] = useState('')
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null)
  const [jobTitle, setJobTitle] = useState<JobTitle | null>(null)
  const [inviteRows, setInviteRows] = useState<InviteChip[]>([])
  const [inviteInput, setInviteInput] = useState('')
  const [pathAError, setPathAError] = useState('')
  const [pathABusy, setPathABusy] = useState(false)

  useEffect(() => {
    setSlugPreview(slugify(workspaceName))
  }, [workspaceName])

  useEffect(() => {
    if (!logoFile) {
      setLogoPreviewUrl(null)
      return
    }
    const url = URL.createObjectURL(logoFile)
    setLogoPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [logoFile])

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      if (!user) {
        setCheckingUser(false)
        if (isPathB) setPathBState('guest')
        else setPathBState('loading')
        return
      }
      setCheckingUser(true)
      const db = getDb()
      if (!db) {
        setCheckingUser(false)
        return
      }
      try {
        const snap = await getDoc(doc(db, COL_USERS, user.uid))
        if (cancelled) return
        const pid = snapshotExists(snap) ? snap.get('projectId') : null
        const hasProject =
          pid != null && typeof pid === 'string' && String(pid).trim() !== ''
        if (hasProject) {
          setAlreadyInProject(true)
          setCheckingUser(false)
          return
        }
        if (isPathB) {
          const inv = inviteFromUrl || pending?.invite || ''
          const proj = projectFromUrl || pending?.project || ''
          if (!inv) {
            setPathBState('invalid')
            setCheckingUser(false)
            return
          }
          const res = await resolveInviteForUser(db, user, inv, proj)
          if (cancelled) return
          if (res === 'not_found' || res === null) {
            setPathBState('invalid')
            setCheckingUser(false)
            return
          }
          const em = normalizeEmail(user.email ?? '')
          if (!res.openInvite && normalizeEmail(res.email) !== em) {
            setPathBState('wrong_email')
            setCheckingUser(false)
            return
          }
          if (res.status === 'accepted') {
            setPathBState('accepted')
            setCheckingUser(false)
            return
          }
          if (res.status === 'cancelled') {
            setPathBState('invalid')
            setCheckingUser(false)
            return
          }
          if (isExpired(res.expiresAt ?? undefined)) {
            setPathBState('expired')
            setCheckingUser(false)
            return
          }
          setResolvedInvite(res)
          setPathBState('ready')
        }
      } catch (e) {
        console.error(e)
        if (!cancelled && isPathB) setPathBState('invalid')
      } finally {
        if (!cancelled) setCheckingUser(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [user, isPathB, inviteFromUrl, projectFromUrl, pending?.invite, pending?.project])

  const returnToOnboarding = useMemo(() => {
    const inv = inviteFromUrl || pending?.invite || ''
    const proj = projectFromUrl || pending?.project || ''
    if (inv && proj) return `/onboarding?invite=${encodeURIComponent(inv)}&project=${encodeURIComponent(proj)}`
    if (inv) return `/onboarding?invite=${encodeURIComponent(inv)}`
    return '/onboarding'
  }, [inviteFromUrl, projectFromUrl, pending?.invite, pending?.project])

  if (user && alreadyInProject) {
    return <Navigate to="/dashboard" replace />
  }

  if (!user && !isPathB) {
    return <Navigate to={`/login?returnTo=${encodeURIComponent('/onboarding')}`} replace />
  }

  if (checkingUser && user && isPathB) {
    return (
      <div className={`${pageShellClass} justify-center`}>
        <span className="h-10 w-10 animate-spin rounded-full border-2 border-[#1A3263] border-t-transparent" />
        <p className="mt-4 text-sm text-[#5A6E9A]">Loading invite…</p>
      </div>
    )
  }

  const handlePathBAccept = async () => {
    if (!user || !resolvedInvite) return
    const db = getDb()
    if (!db) return
    setPathBBusy(true)
    setPathBError('')
    try {
      const { projectId, inviteId, role, projectName } = resolvedInvite
      const batch = writeBatch(db)

      // 1. Create member document
      const memberRef = doc(db, COL_PROJECTS, projectId, 'members', user.uid)
      batch.set(memberRef, {
        uid: user.uid,
        email: user.email ?? '',
        displayName: user.displayName || user.email || 'Member',
        photoURL: user.photoURL ?? null,
        role,
        joinedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        invitedBy: resolvedInvite.invitedBy || null,
        status: 'active',
        inviteId,
      })

      // 2. Update user profile
      const userRef = doc(db, COL_USERS, user.uid)
      batch.set(
        userRef,
        {
          projectId,
          role,
          onboardingComplete: true,
          lastLoginAt: serverTimestamp(),
        },
        { merge: true },
      )

      // 3. Mark invite as accepted
      const inviteRef = doc(db, COL_PROJECTS, projectId, 'invites', inviteId)
      batch.update(inviteRef, {
        status: 'accepted',
        acceptedAt: serverTimestamp(),
        acceptedBy: user.uid,
        updatedAt: serverTimestamp(),
      })

      await batch.commit()
      clearPendingInviteFromStorage()
      navigate('/dashboard', { replace: true })
    } catch (e) {
      setPathBError(e instanceof Error ? e.message : 'Could not accept invite.')
    } finally {
      setPathBBusy(false)
    }
  }

  const handlePathBDecline = async () => {
    if (!user || !resolvedInvite) {
      navigate('/login', { replace: true })
      return
    }
    const db = getDb()
    if (!db) {
      navigate('/login', { replace: true })
      return
    }
    setPathBBusy(true)
    try {
      await updateDoc(
        doc(db, COL_PROJECTS, resolvedInvite.projectId, 'invites', resolvedInvite.inviteId),
        { status: 'cancelled', cancelledAt: serverTimestamp() },
      )
    } catch {
      // still leave
    } finally {
      clearPendingInviteFromStorage()
      setPathBBusy(false)
      navigate('/login', { replace: true })
    }
  }

  const finalizeWorkspace = async (withInvites: boolean) => {
    if (!user) return
    const db = getDb()
    const storage = getFirebaseStorage()
    if (!db) {
      setPathAError('Firestore is not available.')
      return
    }
    const name = workspaceName.trim()
    if (!name) {
      setPathAError('Workspace name is required.')
      return
    }
    let slug = slugPreview || slugify(name)
    slug = await ensureUniqueSlug(db, slug)

    setPathABusy(true)
    setPathAError('')
    try {
      const projectCol = collection(db, COL_PROJECTS)
      const projectRef = await addDoc(projectCol, {
        name,
        description: workspaceDescription.trim() || '',
        slug,
        ownerId: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        plan: 'free',
        logoUrl: null,
        settings: {
          allowMemberInvites: false,
          requireApproval: false,
        },
      })
      const projectId = projectRef.id

      if (logoFile && storage) {
        try {
          const storageRef = ref(storage, `${COL_PROJECTS}/${projectId}/logo`)
          await uploadBytes(storageRef, logoFile, { contentType: logoFile.type || 'image/jpeg' })
          const logoUrl = await getDownloadURL(storageRef)
          await updateDoc(doc(db, COL_PROJECTS, projectId), { logoUrl, updatedAt: serverTimestamp() })
        } catch (e) {
          console.warn('[onboarding] logo upload skipped', e)
        }
      }

      const batch = writeBatch(db)
      const memberRef = doc(db, COL_PROJECTS, projectId, 'members', user.uid)
      batch.set(memberRef, {
        uid: user.uid,
        email: user.email ?? '',
        displayName: user.displayName ?? '',
        photoURL: user.photoURL ?? null,
        role: 'Owner',
        joinedAt: serverTimestamp(),
        invitedBy: null,
        status: 'active',
      })
      const userRef = doc(db, COL_USERS, user.uid)
      const userPatch: Record<string, unknown> = {
        projectId,
        role: 'Owner',
        onboardingComplete: true,
        lastLoginAt: serverTimestamp(),
      }
      if (jobTitle) userPatch.jobTitle = jobTitle
      batch.set(
        userRef,
        {
          uid: user.uid,
          email: user.email ?? '',
          displayName: user.displayName ?? '',
          photoURL: user.photoURL ?? null,
          ...userPatch,
        },
        { merge: true },
      )

      await batch.commit()

      if (withInvites && inviteRows.length > 0) {
        const origin =
          typeof window !== 'undefined' && window.location?.origin
            ? String(window.location.origin).replace(/\/+$/, '')
            : 'https://testforge.app'
        const inviteEmails: { email: string; role: string; link: string }[] = []

        for (const row of inviteRows) {
          const em = normalizeEmail(row.email)
          if (!em || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) continue
          const token = crypto.randomUUID()
          const invRef = doc(collection(db, COL_PROJECTS, projectId, 'invites'))
          await setDoc(invRef, {
            email: em,
            role: row.role,
            invitedBy: user.uid,
            invitedAt: serverTimestamp(),
            status: 'pending',
            token,
            expiresAt: Timestamp.fromMillis(Date.now() + 7 * 24 * 60 * 60 * 1000),
            projectName: name,
            invitedByName: user.displayName || user.email || 'Owner',
          })
          inviteEmails.push({
            email: em,
            role: row.role,
            link: `${origin}/invite/${encodeURIComponent(token)}?project=${encodeURIComponent(projectId)}`,
          })
        }

        // Send emails via EmailJS in parallel (non-blocking)
        if (inviteEmails.length > 0) {
          const inviterName = user.displayName || user.email || 'Owner'
          void Promise.allSettled(
            inviteEmails.map((inv) =>
              sendInviteEmail({
                toEmail: inv.email,
                invitedByName: inviterName,
                projectName: name,
                role: inv.role,
                inviteLink: inv.link,
              }),
            ),
          )
        }
      }

      navigate('/dashboard', { replace: true })
    } catch (e) {
      const code =
        e && typeof e === 'object' && 'code' in e ? String((e as { code: string }).code) : ''
      const msg = e instanceof Error ? e.message : 'Something went wrong.'
      if (code === 'permission-denied') {
        setPathAError('Permission denied. Sign out and sign back in, or contact support.')
      } else {
        setPathAError(msg)
      }
    } finally {
      setPathABusy(false)
    }
  }

  const onStep1Continue = async () => {
    const name = workspaceName.trim()
    if (!name) {
      setPathAError('Please enter a workspace name.')
      return
    }
    const db = getDb()
    if (!db) {
      setPathAError('Firestore is not available.')
      return
    }
    setPathABusy(true)
    setPathAError('')
    try {
      let base = slugPreview || slugify(name)
      if (await isSlugTaken(db, base)) {
        base = `${base}-${randomSuffix()}`
        if (await isSlugTaken(db, base)) {
          base = await ensureUniqueSlug(db, base)
        }
        setSlugPreview(base)
      }
      setStep(2)
    } catch (e) {
      setPathAError(e instanceof Error ? e.message : 'Could not validate workspace name.')
    } finally {
      setPathABusy(false)
    }
  }

  const addInviteChip = () => {
    const em = normalizeEmail(inviteInput)
    if (!em || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) return
    if (inviteRows.some((r) => r.email === em)) return
    setInviteRows((r) => [...r, { email: em, role: 'Member' }])
    setInviteInput('')
  }

  if (isPathB) {
    const guestCard = (
      <div className={cardClass}>
        <h1 className="text-xl font-semibold text-neutral-900">You&apos;re invited</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Sign in or create an account with the email this invite was sent to, then accept from this page.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            to={`/signup?returnTo=${encodeURIComponent(returnToOnboarding)}`}
            className={`${primaryBtnClass} px-4 text-center`}
          >
            Sign up to accept
          </Link>
          <Link
            to={`/login?returnTo=${encodeURIComponent(returnToOnboarding)}`}
            className="rounded-lg border border-neutral-200 px-4 py-3 text-center text-sm font-semibold text-neutral-800 hover:bg-neutral-50"
          >
            Log in to accept
          </Link>
        </div>
      </div>
    )

    const err = (title: string, body: string) => (
      <div className={cardClass}>
        <h1 className="text-xl font-semibold text-red-700">{title}</h1>
        <p className="mt-2 text-sm text-neutral-600">{body}</p>
        <Link to="/login" className="mt-6 inline-block text-sm font-semibold text-violet-600 hover:underline">
          Back to login
        </Link>
      </div>
    )

    return (
      <div className={pageShellClass}>
        <BrandHeader />
        {pathBState === 'guest' && guestCard}
        {pathBState === 'invalid' && err('This invite link is invalid', 'Check the link or ask your admin for a new invite.')}
        {pathBState === 'expired' && err('This invite link has expired', 'Invites expire after 7 days. Request a new one from your workspace admin.')}
        {pathBState === 'accepted' && err('You have already joined this project', 'You can open your dashboard to continue.')}
        {pathBState === 'wrong_email' &&
          err(
            'Wrong account',
            `Sign in with the email address this invite was sent to, or ask for a new invite.`,
          )}
        {pathBState === 'ready' && resolvedInvite && (
          <div className={cardClass}>
            <p className="text-xs font-medium uppercase tracking-wide text-violet-600">Invitation</p>
            <h1 className="mt-1 text-xl font-semibold text-neutral-900">
              Join {resolvedInvite.projectName || 'a workspace'}
            </h1>
            <p className="mt-2 text-sm text-neutral-600">
              You&apos;ve been invited to join this team on TestForge.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-800">
                {resolvedInvite.role}
              </span>
              <span className="text-sm text-neutral-500">
                Invited by {resolvedInvite.invitedByName || 'a teammate'}
              </span>
            </div>
            {pathBError ? (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {pathBError}
              </div>
            ) : null}
            <button
              type="button"
              disabled={pathBBusy}
              onClick={() => void handlePathBAccept()}
              className={`mt-6 ${primaryBtnClass}`}
            >
              {pathBBusy ? 'Joining…' : 'Accept invite'}
            </button>
            <button
              type="button"
              disabled={pathBBusy}
              onClick={() => void handlePathBDecline()}
              className="mt-4 w-full text-center text-sm font-medium text-neutral-500 hover:text-neutral-800"
            >
              Decline
            </button>
          </div>
        )}
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return (
    <div className={pageShellClass}>
      <BrandHeader />

      <div className={cardClass}>
        <StepDots step={step} />

        {step === 1 && (
          <>
            <h1 className="text-xl font-semibold text-[#1A3263]">Create your workspace</h1>
            <p className="mt-2 text-sm text-[#5A6E9A]">
              This is where your team will manage test cases, runs, and bugs.
            </p>
            <div className="mt-6 space-y-4">
              <div>
                <label className={labelClass}>Workspace name *</label>
                <input
                  value={workspaceName}
                  onChange={(e) => setWorkspaceName(e.target.value)}
                  placeholder="e.g. Acme QA Team, MyApp Testing"
                  className={inputClass}
                />
                <p className="mt-1.5 text-xs text-[#5A6E9A]">
                  testforge.app/<span className="font-mono text-[#1A3263]">{slugPreview || 'your-slug'}</span>
                </p>
              </div>
              <div>
                <label className={labelClass}>Description (optional)</label>
                <textarea
                  value={workspaceDescription}
                  onChange={(e) => setWorkspaceDescription(e.target.value)}
                  placeholder="What are you testing?"
                  rows={3}
                  className={inputClass}
                />
              </div>
            </div>
            {pathAError ? (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {pathAError}
              </div>
            ) : null}
            <button
              type="button"
              disabled={pathABusy}
              onClick={() => void onStep1Continue()}
              className={`mt-6 ${primaryBtnClass}`}
            >
              {pathABusy ? 'Checking…' : 'Continue →'}
            </button>
          </>
        )}

        {step === 2 && (
          <>
            <h1 className="text-xl font-semibold text-[#1A3263]">Customize your workspace</h1>
            <div className="mt-6">
              <p className="text-sm font-medium text-neutral-800">Workspace logo (optional)</p>
              <label className="mt-3 flex h-20 w-20 cursor-pointer flex-col items-center justify-center rounded-full border-2 border-dashed border-neutral-300 bg-neutral-50 text-neutral-500 hover:border-violet-400 hover:text-violet-600">
                {logoPreviewUrl ? (
                  <img src={logoPreviewUrl} alt="" className="h-full w-full rounded-full object-cover" />
                ) : (
                  <>
                    <IconUpload className="h-6 w-6" />
                    <span className="mt-1 text-[10px]">Click to upload</span>
                  </>
                )}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    setLogoFile(f ?? null)
                  }}
                />
              </label>
              <button
                type="button"
                className="mt-2 text-xs font-medium text-violet-600 hover:underline"
                onClick={() => setLogoFile(null)}
              >
                Skip for now
              </button>
            </div>

            <div className="mt-8">
              <p className="text-sm font-medium text-neutral-800">What best describes you?</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {(
                  [
                    { v: 'QA Engineer' as JobTitle, label: 'QA Engineer', Icon: IconChecklist },
                    { v: 'QA Lead / Manager' as JobTitle, label: 'QA Lead / Manager', Icon: IconShield },
                    { v: 'Developer' as JobTitle, label: 'Developer', Icon: IconCode },
                    { v: 'Product Manager' as JobTitle, label: 'Product Manager', Icon: IconChart },
                  ] as const
                ).map(({ v, label, Icon }) => {
                  const sel = jobTitle === v
                  return (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setJobTitle(v)}
                      className={`flex items-start gap-2 rounded-xl border p-3 text-left text-xs font-medium transition ${
                        sel ? 'border-[#1A3263] bg-[#EEF2FB] text-[#1A3263]' : 'border-[#B0C0E0] hover:border-[#8A9BBF]'
                      }`}
                    >
                      <Icon className="mt-0.5 h-5 w-5 shrink-0 text-[#1A3263]" />
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="mt-8 flex gap-3">
              <button
                type="button"
                onClick={() => setStep(1)}
                className={`flex-1 ${outlineBtnClass}`}
              >
                ← Back
              </button>
              <button
                type="button"
                onClick={() => setStep(3)}
                className={`flex-1 ${primaryBtnClass}`}
              >
                Continue →
              </button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <h1 className="text-xl font-semibold text-[#1A3263]">Invite your team</h1>
            <p className="mt-2 text-sm text-[#5A6E9A]">
              Add teammates to collaborate. You can always do this later.
            </p>
            <div className="mt-4">
              <input
                value={inviteInput}
                onChange={(e) => setInviteInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addInviteChip()
                  }
                }}
                placeholder="email@company.com — press Enter"
                className={inputClass}
              />
              <div className="mt-3 flex flex-col gap-2">
                {inviteRows.map((row) => (
                  <div
                    key={row.email}
                    className="flex flex-wrap items-center gap-2 rounded-lg border border-neutral-100 bg-neutral-50 px-2 py-2"
                  >
                    <span className="flex-1 text-sm text-neutral-800">{row.email}</span>
                    <select
                      value={row.role}
                      onChange={(e) => {
                        const role = e.target.value as InviteRole
                        setInviteRows((rows) =>
                          rows.map((r) => (r.email === row.email ? { ...r, role } : r)),
                        )
                      }}
                      className="rounded border border-neutral-200 bg-white px-2 py-1 text-xs"
                    >
                      {INVITE_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      aria-label="Remove"
                      className="text-neutral-400 hover:text-red-600"
                      onClick={() =>
                        setInviteRows((rows) => rows.filter((r) => r.email !== row.email))
                      }
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
            {pathAError ? (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {pathAError}
              </div>
            ) : null}
            <button
              type="button"
              disabled={pathABusy}
              onClick={() => void finalizeWorkspace(true)}
              className={`mt-6 flex items-center justify-center gap-2 ${primaryBtnClass}`}
            >
              {pathABusy ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Working…
                </>
              ) : (
                'Create workspace & send invites'
              )}
            </button>
            <button
              type="button"
              disabled={pathABusy}
              onClick={() => void finalizeWorkspace(false)}
              className="mt-4 w-full text-center text-sm font-semibold text-[#1A3263] hover:underline disabled:opacity-60"
            >
              Skip for now →
            </button>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="flex-1 rounded-lg border border-neutral-200 py-2 text-sm font-semibold text-neutral-800 hover:bg-neutral-50"
              >
                ← Back
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
