import { useAuth } from '../context/AuthContext.jsx'
import { useUserSetup } from '../hooks/useUserSetup'

/** Runs post-login Firestore user doc sync and entry navigation (see useUserSetup). */
export function UserSetupRunner() {
  const { user, loading } = useAuth()
  useUserSetup(user, loading)
  return null
}
