import {
  collection,
  doc,
  getDocs,
  serverTimestamp,
  updateDoc,
  getDoc,
} from 'firebase/firestore'
import { getDb } from '../firebase/firestore.js'
import type { Role } from '../constants/rbac'

type MigrationResult = {
  scannedProjects: number
  scannedMembers: number
  updatedMembers: number
}

function normalizeLegacyRole(raw: unknown): Role {
  const v = raw == null ? '' : String(raw)
  if (v === 'Tester') return 'Member'
  if (v === 'Owner' || v === 'Admin' || v === 'QA Lead' || v === 'Member' || v === 'Viewer')
    return v
  return 'Member'
}

/**
 * One-time migration:
 * - For each project the caller can read, update `projects/{projectId}/members/*`:
 *   - creatorUid -> Owner (only if missing/incorrect)
 *   - legacy "Tester" -> "Member"
 *   - set joinedAt if missing
 *
 * This is intentionally defensive and safe to re-run.
 *
 * IMPORTANT: should only be callable by an Owner (enforced here + by rules).
 */
export async function migrateRoles(projectId: string, callerUid: string): Promise<MigrationResult> {
  if (!projectId || !callerUid) {
    throw new Error('projectId and callerUid are required.')
  }
  const db = getDb()
  if (!db) throw new Error('Firestore is not available.')

  const callerRef = doc(db, `projects/${projectId}/members/${callerUid}`)
  const callerSnap = await getDoc(callerRef)
  if (!callerSnap.exists()) throw new Error('You are not a member of this project.')
  const callerRole = normalizeLegacyRole(callerSnap.data()?.role)
  if (callerRole !== 'Owner') throw new Error('Only the Owner can run the migration.')

  const projectsSnap = await getDocs(collection(db, 'projects'))

  let scannedProjects = 0
  let scannedMembers = 0
  let updatedMembers = 0

  for (const proj of projectsSnap.docs) {
    scannedProjects += 1
    const pId = proj.id
    const creatorUid = proj.data()?.creatorUid
    const membersCol = collection(db, `projects/${pId}/members`)
    let membersSnap
    try {
      membersSnap = await getDocs(membersCol)
    } catch {
      // Not a member or rules deny; skip silently.
      continue
    }

    for (const mem of membersSnap.docs) {
      scannedMembers += 1
      const data = mem.data() || {}
      const uid = data.uid ?? mem.id
      const currentRole = normalizeLegacyRole(data.role)
      const shouldBeOwner = creatorUid && String(uid) === String(creatorUid)

      /** @type {Partial<{ role: Role, joinedAt: any }>} */
      const patch: any = {}

      if (shouldBeOwner && currentRole !== 'Owner') {
        patch.role = 'Owner'
      } else if (!shouldBeOwner && currentRole === 'Owner') {
        // Preserve Owner if already set; but enforce single-owner invariant by demoting non-creator Owners.
        patch.role = 'Admin'
      } else if (data.role === 'Tester') {
        patch.role = 'Member'
      }

      if (!('joinedAt' in data) || data.joinedAt == null) {
        patch.joinedAt = serverTimestamp()
      }

      if (Object.keys(patch).length > 0) {
        await updateDoc(mem.ref, patch)
        updatedMembers += 1
      }
    }
  }

  return { scannedProjects, scannedMembers, updatedMembers }
}

