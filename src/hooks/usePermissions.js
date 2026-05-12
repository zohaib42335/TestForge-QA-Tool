/**
 * @fileoverview Permission flags for the signed-in user (reads AuthContext / Firestore profile).
 */

import { useAuth } from '../context/AuthContext.jsx'

/**
 * Returns RBAC permission flags derived from the Firestore user profile.
 *
 * @returns {Object}
 */
const usePermissions = () => {
  const {
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
    userProfile,
    isAdmin,
    isQALead,
    isTester,
  } = useAuth()

  return {
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
    userProfile,
    isAdmin,
    isQALead,
    isTester,
    role:
      userProfile && typeof userProfile.role === 'string'
        ? userProfile.role === 'Tester'
          ? 'Member'
          : userProfile.role
        : 'Member',
  }
}

export default usePermissions
