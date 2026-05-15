/// <reference types="vite/client" />
import emailjs from '@emailjs/browser'

const SERVICE_ID = import.meta.env.VITE_EMAILJS_SERVICE_ID ?? ''
const TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID ?? ''
const PUBLIC_KEY = import.meta.env.VITE_EMAILJS_PUBLIC_KEY ?? ''

export interface InviteEmailParams {
  toEmail: string
  invitedByName: string
  projectName: string
  role: string
  inviteLink: string
}

/**
 * Send an invite email via EmailJS.
 * Returns true on success, false on failure.
 * Email failure should never block the invite creation flow.
 */
export async function sendInviteEmail(params: InviteEmailParams): Promise<boolean> {
  if (!SERVICE_ID || !TEMPLATE_ID || !PUBLIC_KEY) {
    console.warn('[emailService] EmailJS env vars not configured — skipping email send.')
    return false
  }

  try {
    await emailjs.send(
      SERVICE_ID,
      TEMPLATE_ID,
      {
        to_email: params.toEmail,
        invited_by: params.invitedByName,
        project_name: params.projectName,
        role: params.role,
        invite_link: params.inviteLink,
      },
      PUBLIC_KEY,
    )
    return true
  } catch (error) {
    // Email failure should never block the invite creation
    console.error('[emailService] EmailJS send failed:', error)
    return false
  }
}
