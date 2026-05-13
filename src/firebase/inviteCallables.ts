import { httpsCallable } from 'firebase/functions'

export type GenerateInviteLinkResult = {
  inviteLink: string
  token: string
}

export type AcceptInviteResult = {
  projectId: string
  role: string
  projectName: string
}

export async function callGenerateInviteLink(params: {
  projectId: string
  email: string | null
  role: string
}): Promise<GenerateInviteLinkResult> {
  const { getFirebaseFunctions } = await import('./config.js')
  const fns = getFirebaseFunctions()
  if (!fns) {
    throw new Error('Firebase Functions is not configured.')
  }
  const fn = httpsCallable(fns, 'generateInviteLink')
  const res = await fn(params)
  return res.data as GenerateInviteLinkResult
}

export async function callAcceptInvite(token: string): Promise<AcceptInviteResult> {
  const { getFirebaseFunctions } = await import('./config.js')
  const fns = getFirebaseFunctions()
  if (!fns) {
    throw new Error('Firebase Functions is not configured.')
  }
  const fn = httpsCallable(fns, 'acceptInvite')
  const res = await fn({ token })
  return res.data as AcceptInviteResult
}
