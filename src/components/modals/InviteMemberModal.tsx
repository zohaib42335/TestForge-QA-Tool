import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Role } from '../../constants/rbac'
import { useProject } from '../../contexts/ProjectContext'
import { useToast } from '../Toast.jsx'

type Props = {
  open: boolean
  onClose: () => void
  currentRole: Role | null
}

type InviteRole = 'Admin' | 'QA Lead' | 'Member' | 'Viewer'

type EmailChip = { email: string; role: InviteRole }

const OWNER_INVITE_ROLES: InviteRole[] = ['Admin', 'QA Lead', 'Member', 'Viewer']
const ADMIN_INVITE_ROLES: InviteRole[] = ['QA Lead', 'Member', 'Viewer']

function callableMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message?: string }).message ?? 'Request failed.')
  }
  return 'Request failed.'
}

export default function InviteMemberModal({ open, onClose, currentRole }: Props) {
  const { projectId, inviteMember } = useProject()
  const showToast = useToast()

  const [tab, setTab] = useState<'email' | 'link'>('email')
  const [emailInput, setEmailInput] = useState('')
  const [chips, setChips] = useState<EmailChip[]>([])
  const [shareRole, setShareRole] = useState<InviteRole>('Member')
  const [submitting, setSubmitting] = useState(false)
  const [inlineError, setInlineError] = useState('')

  const [emailResults, setEmailResults] = useState<{ email: string; inviteLink: string }[] | null>(null)
  const [shareLinkResult, setShareLinkResult] = useState<{ inviteLink: string; token: string } | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState('')

  const allowedRoles = useMemo(() => {
    if (currentRole === 'Owner') return OWNER_INVITE_ROLES
    if (currentRole === 'Admin') return ADMIN_INVITE_ROLES
    return []
  }, [currentRole])

  useEffect(() => {
    if (!open) {
      setTab('email')
      setEmailInput('')
      setChips([])
      setShareRole('Member')
      setInlineError('')
      setEmailResults(null)
      setShareLinkResult(null)
      setQrDataUrl('')
    }
  }, [open])

  useEffect(() => {
    const link = shareLinkResult?.inviteLink
    if (!link) {
      setQrDataUrl('')
      return
    }
    let cancelled = false
    void import('qrcode')
      .then((mod) => {
        const QR = mod.default ?? mod
        return QR.toDataURL(link, { width: 168, margin: 1 })
      })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url)
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl('')
      })
    return () => {
      cancelled = true
    }
  }, [shareLinkResult?.inviteLink])

  const addChipFromInput = useCallback(() => {
    const raw = emailInput.trim().toLowerCase()
    if (!raw) return
    const simple = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!simple.test(raw)) {
      setInlineError('Enter a valid email address.')
      return
    }
    setInlineError('')
    setChips((prev) => {
      if (prev.some((c) => c.email === raw)) return prev
      const defaultRole = (allowedRoles.includes('Member') ? 'Member' : allowedRoles[0]) ?? 'Member'
      return [...prev, { email: raw, role: defaultRole }]
    })
    setEmailInput('')
  }, [emailInput, allowedRoles])

  const sendEmailInvites = async () => {
    setInlineError('')
    if (!projectId) {
      setInlineError('No active project.')
      return
    }
    if (chips.length === 0) {
      setInlineError('Add at least one email.')
      return
    }
    setSubmitting(true)
    setEmailResults(null)
    try {
      const out: { email: string; inviteLink: string }[] = []
      for (const c of chips) {
        if (!allowedRoles.includes(c.role)) {
          setInlineError(`Role ${c.role} is not allowed for your access level.`)
          setSubmitting(false)
          return
        }
        try {
          const r = await inviteMember(c.email, c.role)
          out.push({ email: c.email, inviteLink: r.inviteLink })
        } catch (e) {
          setInlineError(callableMessage(e))
          setSubmitting(false)
          return
        }
      }
      setEmailResults(out)
      showToast(`Invites sent to ${out.length} people`, 'success')
    } finally {
      setSubmitting(false)
    }
  }

  const generateShareLink = async (isRegenerate: boolean) => {
    setInlineError('')
    if (!projectId) {
      setInlineError('No active project.')
      return
    }
    if (!allowedRoles.includes(shareRole)) {
      setInlineError('Invalid role for your access level.')
      return
    }
    setSubmitting(true)
    try {
      const r = await inviteMember(null, shareRole)
      setShareLinkResult(r)
      if (isRegenerate) {
        showToast('New invite link generated', 'success')
      }
    } catch (e) {
      setInlineError(callableMessage(e))
    } finally {
      setSubmitting(false)
    }
  }

  const copyText = async (text: string) => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
      } else {
        const ta = document.createElement('textarea')
        ta.value = text
        ta.setAttribute('readonly', '')
        ta.style.position = 'absolute'
        ta.style.left = '-9999px'
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
      }
      showToast('Copied to clipboard', 'success')
    } catch {
      showToast('Failed to copy', 'error')
    }
  }

  if (!open || typeof document === 'undefined') return null

  if (allowedRoles.length === 0) {
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
          onClick={(e) => e.stopPropagation()}
        >
          <p className="text-sm text-[#5A6E9A]">You do not have permission to invite members.</p>
          <button
            type="button"
            className="mt-4 rounded-lg border border-[#B0C0E0] px-4 py-2 text-sm text-[#1A3263]"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>,
      document.body,
    )
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center bg-black/45 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-[#B0C0E0] bg-white p-5 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="invite-member-title"
        onClick={(evt) => evt.stopPropagation()}
      >
        <h3 id="invite-member-title" className="text-lg font-semibold text-[#1A3263]">
          Invite Member
        </h3>

        <div className="mt-4 flex gap-2 border-b border-[#EEF2FB] pb-2">
          <button
            type="button"
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              tab === 'email' ? 'bg-[#1A3263] text-white' : 'text-[#5A6E9A] hover:bg-[#EEF2FB]'
            }`}
            onClick={() => setTab('email')}
          >
            Invite by Email
          </button>
          <button
            type="button"
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              tab === 'link' ? 'bg-[#1A3263] text-white' : 'text-[#5A6E9A] hover:bg-[#EEF2FB]'
            }`}
            onClick={() => setTab('link')}
          >
            Share Link
          </button>
        </div>

        {tab === 'email' ? (
          <div className="mt-4 space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-[#1A3263]">Email addresses</label>
              <p className="mb-1 text-[11px] text-[#5A6E9A]">Type an email and press Enter to add.</p>
              <input
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addChipFromInput()
                  }
                }}
                placeholder="name@company.com"
                className="w-full rounded-lg border border-[#B0C0E0] px-3 py-2 text-sm text-[#1A3263] outline-none focus:border-[#1A3263]"
              />
            </div>
            {chips.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {chips.map((c) => (
                  <li
                    key={c.email}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#EEF2FB] bg-[#F8FAFF] px-3 py-2"
                  >
                    <span className="text-sm font-medium text-[#1A3263]">{c.email}</span>
                    <div className="flex items-center gap-2">
                      <select
                        value={c.role}
                        onChange={(e) => {
                          const role = e.target.value as InviteRole
                          setChips((prev) =>
                            prev.map((x) => (x.email === c.email ? { ...x, role } : x)),
                          )
                        }}
                        className="rounded-md border border-[#B0C0E0] px-2 py-1 text-xs text-[#1A3263]"
                      >
                        {allowedRoles.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="text-xs text-red-600 hover:underline"
                        onClick={() => setChips((prev) => prev.filter((x) => x.email !== c.email))}
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}

            <button
              type="button"
              disabled={submitting || chips.length === 0}
              onClick={() => void sendEmailInvites()}
              className="w-full rounded-lg bg-[#1A3263] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#122247] disabled:opacity-60"
            >
              {submitting ? 'Sending…' : 'Send Invites'}
            </button>

            {emailResults && emailResults.length > 0 ? (
              <div className="rounded-lg border border-[#D6E0F5] bg-[#EEF2FB] p-3">
                <p className="text-sm font-medium text-[#1A3263]">
                  Invites sent to {emailResults.length} people — copy links below:
                </p>
                <ul className="mt-2 max-h-40 space-y-2 overflow-y-auto">
                  {emailResults.map((row) => (
                    <li key={row.email} className="text-xs text-[#1A3263]">
                      <div className="font-medium">{row.email}</div>
                      <div className="mt-1 flex gap-1">
                        <input
                          readOnly
                          className="min-w-0 flex-1 rounded border border-[#B0C0E0] bg-white px-2 py-1 text-[11px]"
                          value={row.inviteLink}
                        />
                        <button
                          type="button"
                          className="shrink-0 rounded border border-[#B0C0E0] px-2 py-1 text-[11px] text-[#1A3263] hover:bg-white"
                          onClick={() => void copyText(row.inviteLink)}
                        >
                          Copy
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-[#1A3263]">Role for this link</label>
              <select
                value={shareRole}
                onChange={(e) => setShareRole(e.target.value as InviteRole)}
                className="w-full rounded-lg border border-[#B0C0E0] px-3 py-2 text-sm text-[#1A3263] outline-none focus:border-[#1A3263]"
              >
                {allowedRoles.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              disabled={submitting}
              onClick={() => void generateShareLink(false)}
              className="w-full rounded-lg bg-[#1A3263] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#122247] disabled:opacity-60"
            >
              {submitting ? 'Generating…' : 'Generate Link'}
            </button>
            {shareLinkResult ? (
              <div className="space-y-2 rounded-lg border border-[#D6E0F5] bg-[#EEF2FB] p-3">
                <div className="flex gap-2">
                  <input
                    readOnly
                    className="min-w-0 flex-1 rounded border border-[#B0C0E0] bg-white px-2 py-2 text-xs text-[#1A3263]"
                    value={shareLinkResult.inviteLink}
                  />
                  <button
                    type="button"
                    className="shrink-0 rounded-lg border border-[#B0C0E0] px-3 py-2 text-xs font-semibold text-[#1A3263] hover:bg-white"
                    onClick={() => void copyText(shareLinkResult.inviteLink)}
                  >
                    Copy
                  </button>
                </div>
                <p className="text-[11px] text-[#5A6E9A]">Link expires in 7 days</p>
                {qrDataUrl ? (
                  <div className="flex justify-center pt-1">
                    <img src={qrDataUrl} alt="Invite QR code" className="h-40 w-40 rounded-md border border-[#B0C0E0] bg-white p-1" />
                  </div>
                ) : null}
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => void generateShareLink(true)}
                  className="w-full rounded-lg border border-[#B0C0E0] px-4 py-2 text-sm font-medium text-[#1A3263] hover:bg-white disabled:opacity-60"
                >
                  Regenerate
                </button>
              </div>
            ) : null}
          </div>
        )}

        {inlineError ? <p className="mt-2 text-sm text-red-600">{inlineError}</p> : null}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[#B0C0E0] px-4 py-2 text-sm text-[#5A6E9A] transition hover:bg-[#EEF2FB]"
            disabled={submitting}
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
