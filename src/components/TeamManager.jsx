import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import { useAuth } from '../context/AuthContext.jsx'
import { useRole } from '../hooks/useRole'
import { ROLES } from '../constants/rbac.ts'
import { useToast } from './Toast.jsx'
import { getDb } from '../firebase/firestore.js'
import { getRelativeTime } from '../utils/relativeTime.js'
import { PermissionGate } from './common/PermissionGate'
import RoleBadge from './common/RoleBadge'
import InviteMemberModal from './modals/InviteMemberModal'
import { sendInviteEmail } from '../services/emailService'
import { useProject } from '../contexts/ProjectContext'

function initialsFromName(name, email) {
  const n = String(name ?? '').trim()
  if (n) {
    const parts = n.split(/\s+/).filter(Boolean)
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
    return n.slice(0, 2).toUpperCase()
  }
  const e = String(email ?? '').trim()
  return e ? e.slice(0, 2).toUpperCase() : '?'
}

function toIso(tsLike) {
  if (!tsLike) return ''
  if (typeof tsLike === 'string') return tsLike
  if (typeof tsLike.toDate === 'function') return tsLike.toDate().toISOString()
  if (tsLike instanceof Date) return tsLike.toISOString()
  return ''
}

function buildInviteLink(projectId, invite) {
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? String(window.location.origin).replace(/\/+$/, '')
      : 'https://testforge.app'
  const token = String(invite?.token ?? invite?.id ?? '').trim()
  const pid = String(projectId ?? '').trim()
  if (!token || !pid) return ''
  return `${origin}/invite/${encodeURIComponent(token)}?project=${encodeURIComponent(pid)}`
}

function normalizeRole(raw) {
  const v = raw == null ? '' : String(raw)
  if (v === 'Tester') return 'Member'
  return ROLES.includes(v) ? v : 'Member'
}

function daysUntilExpiry(invite) {
  const ex = invite?.expiresAt
  if (!ex) return null
  const ms = typeof ex.toMillis === 'function' ? ex.toMillis() : Date.parse(String(ex))
  if (!Number.isFinite(ms)) return null
  return Math.max(0, Math.ceil((ms - Date.now()) / (24 * 60 * 60 * 1000)))
}

export default function TeamManager({ projectId }) {
  const { user } = useAuth()
  const { project } = useProject()
  const { userRole, isOwner, isAdmin, hasPermission, loading: roleLoading } = useRole()
  const showToast = useToast()

  const [members, setMembers] = useState([])
  const [pendingInvites, setPendingInvites] = useState([])
  const [search, setSearch] = useState('')
  const [updatingUid, setUpdatingUid] = useState(null)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [listError, setListError] = useState('')

  useEffect(() => {
    const db = getDb()
    if (!db || !projectId) {
      setMembers([])
      setPendingInvites([])
      return
    }

    const membersRef = collection(db, `projects/${projectId}/members`)
    const unsubMembers = onSnapshot(
      query(membersRef, orderBy('joinedAt', 'asc')),
      (snap) => {
        setMembers(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
        setListError('')
      },
      (err) => {
        setListError(err instanceof Error ? err.message : 'Could not load members.')
      },
    )

    const invitesRef = collection(db, `projects/${projectId}/invites`)
    const unsubInvites = onSnapshot(
      query(invitesRef, where('status', '==', 'pending')),
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
        rows.sort((a, b) => {
          const aIso = toIso(a.invitedAt)
          const bIso = toIso(b.invitedAt)
          return bIso.localeCompare(aIso)
        })
        setPendingInvites(rows)
      },
      () => {
        setPendingInvites([])
      },
    )

    return () => {
      unsubMembers()
      unsubInvites()
    }
  }, [projectId])

  const memberByUid = useMemo(() => {
    const map = new Map()
    members.forEach((m) => map.set(String(m.uid ?? m.id ?? ''), m))
    return map
  }, [members])

  const filteredMembers = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return members
    return members.filter((m) => {
      const name = String(m.displayName ?? '').toLowerCase()
      const email = String(m.email ?? '').toLowerCase()
      return name.includes(q) || email.includes(q)
    })
  }, [members, search])

  const canManageTeam = hasPermission('team_manage')
  const canInvite = hasPermission('team_manage')
  const currentUid = user?.uid ?? ''

  const roleOptions = useMemo(() => {
    if (isOwner) return [...ROLES]
    if (isAdmin) return [...ROLES]
    return []
  }, [isOwner, isAdmin])

  const getOptionDisableReason = useCallback(
    (targetMember, candidateRole) => {
      const targetUid = String(targetMember.uid ?? targetMember.id ?? '')
      const targetRole = normalizeRole(targetMember.role)
      if (targetUid === currentUid) return 'You cannot change your own role.'
      if (isAdmin && candidateRole === 'Owner') return 'Only Owner can assign Owner role.'
      if (isAdmin && targetRole === 'Admin') return 'Admin cannot change another Admin role.'
      if (targetRole === 'Owner') return 'Owner role cannot be changed.'
      return ''
    },
    [currentUid, isAdmin],
  )

  const canRemoveMember = useCallback(
    (targetMember) => {
      const targetUid = String(targetMember.uid ?? targetMember.id ?? '')
      const targetRole = normalizeRole(targetMember.role)
      if (!targetUid || targetUid === currentUid) return false
      if (isOwner) return targetRole !== 'Owner'
      if (isAdmin) return targetRole !== 'Owner' && targetRole !== 'Admin'
      return false
    },
    [currentUid, isAdmin, isOwner],
  )

  const handleRoleChange = useCallback(
    async (targetMember, newRole) => {
      const db = getDb()
      if (!db || !projectId) return
      const targetUid = String(targetMember.uid ?? targetMember.id ?? '')
      const oldRole = normalizeRole(targetMember.role)
      if (!targetUid || !newRole || oldRole === newRole) return

      const reason = getOptionDisableReason(targetMember, newRole)
      if (reason) {
        showToast(reason, 'error')
        return
      }

      setUpdatingUid(targetUid)
      try {
        await updateDoc(doc(db, `projects/${projectId}/members/${targetUid}`), {
          role: newRole,
          updatedAt: serverTimestamp(),
        })
        showToast(`Role updated to ${newRole}`, 'success')
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Failed to update role.', 'error')
      } finally {
        setUpdatingUid(null)
      }
    },
    [getOptionDisableReason, projectId, showToast],
  )

  const handleRemoveMember = useCallback(
    async (member) => {
      const db = getDb()
      if (!db || !projectId) return
      const uid = String(member.uid ?? member.id ?? '')
      const name = String(member.displayName || member.email || 'Member')

      if (!canRemoveMember(member)) {
        showToast('You cannot remove this member.', 'error')
        return
      }

      const ok = window.confirm(`Remove ${name} from this project?`)
      if (!ok) return

      try {
        await deleteDoc(doc(db, `projects/${projectId}/members/${uid}`))
        showToast(`${name} removed`, 'success')
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Failed to remove member.', 'error')
      }
    },
    [canRemoveMember, projectId, showToast],
  )

  const handleResendInvite = useCallback(
    async (inviteId) => {
      const db = getDb()
      if (!db || !projectId) return
      const invite = pendingInvites.find((i) => i.id === inviteId)
      try {
        await updateDoc(doc(db, `projects/${projectId}/invites/${inviteId}`), {
          invitedAt: serverTimestamp(),
          expiresAt: Timestamp.fromMillis(Date.now() + 7 * 24 * 60 * 60 * 1000),
        })

        // Send email via EmailJS
        if (invite && String(invite.email ?? '').trim()) {
          const link = buildInviteLink(projectId, invite)
          const inviterName = user?.displayName ?? user?.email ?? 'A teammate'
          const projName = project?.name ?? 'TestForge'
          const sent = await sendInviteEmail({
            toEmail: String(invite.email),
            invitedByName: inviterName,
            projectName: projName,
            role: String(invite.role ?? 'Member'),
            inviteLink: link,
          })
          if (sent) {
            showToast(`Invite resent to ${invite.email}`, 'success')
          } else {
            showToast('Invite renewed but email failed. Share the link manually.', 'warning')
          }
        } else {
          showToast('Invite renewed', 'success')
        }
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Failed to resend invite.', 'error')
      }
    },
    [pendingInvites, projectId, project, user, showToast],
  )

  const handleCancelInvite = useCallback(
    async (inviteId) => {
      const db = getDb()
      if (!db || !projectId) return
      try {
        await updateDoc(doc(db, `projects/${projectId}/invites/${inviteId}`), {
          status: 'cancelled',
          cancelledAt: serverTimestamp(),
        })
        showToast('Invite cancelled', 'success')
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Failed to cancel invite.', 'error')
      }
    },
    [projectId, showToast],
  )

  const handleCopyInviteLink = useCallback(
    async (invite) => {
      const link = buildInviteLink(projectId, invite)
      if (!link) {
        showToast('Could not build invite link.', 'error')
        return
      }
      try {
        if (navigator?.clipboard?.writeText) {
          await navigator.clipboard.writeText(link)
        } else {
          const ta = document.createElement('textarea')
          ta.value = link
          ta.setAttribute('readonly', '')
          ta.style.position = 'absolute'
          ta.style.left = '-9999px'
          document.body.appendChild(ta)
          ta.select()
          document.execCommand('copy')
          document.body.removeChild(ta)
        }
        showToast('Invite link copied', 'success')
      } catch {
        showToast('Failed to copy link.', 'error')
      }
    },
    [projectId, showToast],
  )

  if (roleLoading) {
    return (
      <div className="mx-auto max-w-5xl rounded-xl border border-[#B0C0E0] bg-white px-6 py-10 text-sm text-[#5A6E9A]">
        Loading team access...
      </div>
    )
  }

  if (!canManageTeam) {
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-[#B0C0E0] bg-white px-6 py-10 text-center text-sm text-[#5A6E9A]">
        You do not have access to team management.
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#B0C0E0] pb-3">
        <div>
          <h2 className="text-[20px] font-semibold text-[#1A3263]">Team Members</h2>
          <p className="mt-1 text-[12px] text-[#5A6E9A]">{members.length} total members</p>
        </div>

        <PermissionGate permission="team_manage">
          <button
            type="button"
            onClick={() => setInviteOpen(true)}
            className="rounded-lg bg-[#1A3263] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#122247]"
          >
            Invite Member
          </button>
        </PermissionGate>
      </div>

      <label className="block">
        <span className="sr-only">Search members</span>
        <input
          type="search"
          placeholder="Search by name or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border-[0.5px] border-[#B0C0E0] bg-white px-3 py-2 text-[13px] text-[#1A3263] outline-none transition placeholder:text-[#5A6E9A] focus:border-[#1A3263] focus:ring-2 focus:ring-[rgba(26,50,99,0.15)]"
        />
      </label>

      {listError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {listError}
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-[#B0C0E0] bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-[#D6E0F5] bg-[#EEF2FB] text-xs uppercase tracking-wide text-[#5A6E9A]">
            <tr>
              <th className="px-4 py-3">Member</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Joined</th>
              <PermissionGate permission="team_manage">
                <th className="px-4 py-3">Actions</th>
              </PermissionGate>
            </tr>
          </thead>
          <tbody>
            {filteredMembers.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-[#5A6E9A]">
                  No team members found.
                </td>
              </tr>
            ) : (
              filteredMembers.map((m) => {
                const uid = String(m.uid ?? m.id ?? '')
                const name = String(m.displayName ?? '').trim() || 'Team member'
                const email = String(m.email ?? '').trim()
                const role = normalizeRole(m.role)
                const joined = toIso(m.joinedAt) || toIso(m.createdAt) || toIso(m.createdDate)
                const self = uid === currentUid
                const rowRoleLocked = role === 'Owner' || (isAdmin && role === 'Admin') || self

                return (
                  <tr key={uid || email || name} className="border-b border-[#EEF2FB] last:border-0">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {m.photoURL ? (
                          <img src={String(m.photoURL)} alt="" className="h-9 w-9 rounded-full object-cover" />
                        ) : (
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#D6E0F5] text-xs font-semibold text-[#1A3263]">
                            {initialsFromName(name, email)}
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="truncate font-medium text-[#1A3263]">
                            {name} {self ? <span className="text-[#5A6E9A]">(You)</span> : null}
                          </p>
                          <p className="truncate text-xs text-[#5A6E9A]">{email || 'No email'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <RoleBadge role={role} />
                    </td>
                    <td className="px-4 py-3 text-xs text-[#5A6E9A]">{joined ? getRelativeTime(joined) : '—'}</td>
                    <PermissionGate permission="team_manage">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <select
                            value={role}
                            disabled={rowRoleLocked || updatingUid === uid}
                            onChange={(e) => {
                              void handleRoleChange(m, e.target.value)
                            }}
                            title={
                              rowRoleLocked
                                ? self
                                  ? 'Owner cannot change their own role.'
                                  : role === 'Owner'
                                    ? 'Owner role cannot be changed.'
                                    : 'Admin cannot change another Admin role.'
                                : 'Change role'
                            }
                            className="rounded-md border border-[#B0C0E0] px-2 py-1 text-xs text-[#1A3263] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {roleOptions.map((optionRole) => {
                              const disableReason = getOptionDisableReason(m, optionRole)
                              const disabled = Boolean(disableReason)
                              return (
                                <option
                                  key={optionRole}
                                  value={optionRole}
                                  disabled={disabled}
                                  title={disableReason || ''}
                                >
                                  {optionRole}
                                </option>
                              )
                            })}
                          </select>
                          <button
                            type="button"
                            title={
                              canRemoveMember(m)
                                ? `Remove ${name}`
                                : 'You cannot remove this member with your current role.'
                            }
                            disabled={!canRemoveMember(m)}
                            onClick={() => {
                              void handleRemoveMember(m)
                            }}
                            className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            🗑
                          </button>
                        </div>
                      </td>
                    </PermissionGate>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      <PermissionGate permission="team_manage">
        <div className="rounded-xl border border-[#B0C0E0] bg-white p-4">
          <h3 className="text-[15px] font-semibold text-[#1A3263]">Pending Invites</h3>
          {pendingInvites.length === 0 ? (
            <p className="mt-2 text-sm text-[#5A6E9A]">No pending invites</p>
          ) : (
            <ul className="mt-3 divide-y divide-[#EEF2FB]">
              {pendingInvites.map((invite) => {
                const invitedByUid = String(invite.invitedBy ?? '')
                const inviter = memberByUid.get(invitedByUid)
                const inviterName = String(inviter?.displayName ?? inviter?.email ?? 'Unknown')
                const inviteRole = normalizeRole(invite.role)
                const invitedAt = toIso(invite.invitedAt)
                const openInvite =
                  invite.openInvite === true || !String(invite.email ?? '').trim()
                const expDays = daysUntilExpiry(invite)
                return (
                  <li key={invite.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[#1A3263]">
                        {openInvite ? 'Open invite' : String(invite.email ?? '')}
                      </p>
                      <p className="mt-1 text-xs text-[#5A6E9A]">
                        Invited by {inviterName}
                        {invitedAt ? ` · ${getRelativeTime(invitedAt)}` : ''}
                        {expDays != null ? ` · Expires in ${expDays} day${expDays === 1 ? '' : 's'}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <RoleBadge role={inviteRole} />
                      <button
                        type="button"
                        onClick={() => {
                          void handleResendInvite(String(invite.id))
                        }}
                        className="rounded-md border border-[#B0C0E0] px-2.5 py-1 text-xs text-[#1A3263] transition hover:bg-[#EEF2FB]"
                      >
                        Resend
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void handleCopyInviteLink(invite)
                        }}
                        className="rounded-md border border-[#B0C0E0] px-2.5 py-1 text-xs text-[#1A3263] transition hover:bg-[#EEF2FB]"
                      >
                        Copy Link
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void handleCancelInvite(String(invite.id))
                        }}
                        className="rounded-md border border-red-200 px-2.5 py-1 text-xs text-red-600 transition hover:bg-red-50"
                      >
                        Revoke
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </PermissionGate>

      <InviteMemberModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        currentRole={userRole}
      />
    </div>
  )
}
