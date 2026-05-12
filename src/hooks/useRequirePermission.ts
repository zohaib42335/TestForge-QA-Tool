import { useEffect, useMemo } from 'react'
import type { Permission } from '../constants/rbac'
import { useRole } from './useRole'

export function useRequirePermission(permission: Permission) {
  const { hasPermission, loading } = useRole()

  const allowed = useMemo(() => {
    if (loading) return false
    return hasPermission(permission)
  }, [hasPermission, loading, permission])

  useEffect(() => {
    if (loading) return
    if (allowed) return
    if (typeof window === 'undefined') return
    if (window.location.pathname === '/unauthorized') return
    window.location.assign('/unauthorized')
  }, [allowed, loading])

  return { allowed, loading }
}

