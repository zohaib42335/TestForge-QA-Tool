import { httpsCallable } from 'firebase/functions'
import { callableErrorMessage } from '../utils/callableError.js'

export async function callDeleteProject(projectId: string): Promise<void> {
  const { getFirebaseFunctions } = await import('./config.js')
  const fns = getFirebaseFunctions()
  if (!fns) throw new Error('Firebase Functions is not configured.')
  const fn = httpsCallable(fns, 'deleteProject')
  try {
    await fn({ projectId: String(projectId ?? '').trim() })
  } catch (err) {
    throw new Error(callableErrorMessage(err, 'Could not delete workspace.'))
  }
}
