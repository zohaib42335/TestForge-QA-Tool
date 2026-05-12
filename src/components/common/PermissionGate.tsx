import type { ReactNode } from 'react'
import type { Permission } from '../../constants/rbac'
import { useRole } from '../../hooks/useRole'

interface Props {
  permission: Permission
  fallback?: ReactNode
  children: ReactNode
}

export function PermissionGate({ permission, fallback = null, children }: Props) {
  const { hasPermission } = useRole()
  return hasPermission(permission) ? <>{children}</> : <>{fallback}</>
}

