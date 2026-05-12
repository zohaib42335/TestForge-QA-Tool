import { useContext } from 'react'
import { RoleContext } from '../contexts/RoleContext'

export function useRole() {
  return useContext(RoleContext)
}

