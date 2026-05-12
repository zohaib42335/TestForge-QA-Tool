import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { collection, doc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore'
import { v4 as uuidv4 } from 'uuid'
import type { Role } from '../../constants/rbac'
import { getDb } from '../../firebase/firestore.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../Toast.jsx'

type Props = {
  open: boolean
  onClose: () => void
  projectId: string | null | undefined
  currentRole: Role | null
}

const OWNER_INVITE_ROLES: Role[] = ['Admin', 'QA Lead', 'Member', 'Viewer']
const ADMIN_INVITE_ROLES: Role[] = ['QA Lead', 'Member', 'Viewer']

export default function InviteMemberModal({ open, onClose, projectId, currentRole }: Props) {
  const { user } = useAuth()
  const showToast = useToast()

  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('Member')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [inlineError, setInlineError] = useState('')

  const allowedRoles = useMemo(() => {
    if (currentRole === 'Owner') return OWNER_INVITE_ROLES
    if (currentRole === 'Admin') return ADMIN_INVITE_ROLES
    return []
  }, [currentRole])

  if (!open || typeof document === 'undefined') return null

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setInlineError('')

    const db = getDb()
    const normalizedEmail = email.trim().toLowerCase()
    if (!db || !projectId || !user?.uid) return
    if (!normalizedEmail) {
      setInlineError('Email is required.')
      return
    }
    if (!allowedRoles.includes(role)) {
      setInlineError('Invalid role for your access level.')
      return
    }

    setSubmitting(true)
    try {
      const membersSnap = await getDocs(collection(db, `projects/${projectId}/members`))
      const alreadyMember = membersSnap.docs.some(
        (d) => String(d.data()?.email ?? '').trim().toLowerCase() === normalizedEmail,
      )
      if (alreadyMember) {
        setInlineError('This person is already a member')
        return
      }

      const inviteRef = doc(collection(db, `projects/${projectId}/invites`))
      await setDoc(inviteRef, {
        email: normalizedEmail,
        role,
        invitedBy: user.uid,
        invitedAt: serverTimestamp(),
        status: 'pending',
        token: uuidv4(),
        message: message.trim(),
      })

      showToast(`Invite sent to ${normalizedEmail}`, 'success')
      setEmail('')
      setRole(allowedRoles[0] ?? 'Member')
      setMessage('')
      onClose()
    } catch (err) {
      setInlineError(err instanceof Error ? err.message : 'Failed to create invite.')
    } finally {
      setSubmitting(false)
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center bg-black/45 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-lg rounded-xl border border-[#B0C0E0] bg-white p-5 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="invite-member-title"
        onClick={(evt) => evt.stopPropagation()}
      >
        <h3 id="invite-member-title" className="text-lg font-semibold text-[#1A3263]">
          Invite Member
        </h3>

        <form className="mt-4 space-y-3" onSubmit={onSubmit}>
          <div>
            <label className="mb-1 block text-xs font-medium text-[#1A3263]">Email address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com"
              className="w-full rounded-lg border border-[#B0C0E0] px-3 py-2 text-sm text-[#1A3263] outline-none focus:border-[#1A3263]"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-[#1A3263]">Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="w-full rounded-lg border border-[#B0C0E0] px-3 py-2 text-sm text-[#1A3263] outline-none focus:border-[#1A3263]"
            >
              {allowedRoles.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-[#1A3263]">Personal message (optional)</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-[#B0C0E0] px-3 py-2 text-sm text-[#1A3263] outline-none focus:border-[#1A3263]"
              placeholder="Welcome to the project..."
            />
          </div>

          {inlineError ? <p className="text-sm text-red-600">{inlineError}</p> : null}

          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[#B0C0E0] px-4 py-2 text-sm text-[#5A6E9A] transition hover:bg-[#EEF2FB]"
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-[#1A3263] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#122247] disabled:opacity-60"
            >
              {submitting ? 'Sending...' : 'Send Invite'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  )
}

