import { layoutMjml } from './layout'
import { renderMjml, RenderedEmail } from './renderer'

export interface PasswordResetData {
  firstName: string
  resetUrl: string
  expiresInLabel: string
}

export function passwordResetEmail(data: PasswordResetData): { subject: string } & RenderedEmail {
  const subject = 'Reset your password'
  const mjml = layoutMjml({
    previewText: 'Reset your password',
    heading: `Hi ${data.firstName}, reset your password`,
    paragraphs: [
      'We received a request to reset your password. Click the button below to choose a new one.',
      `This link expires in ${data.expiresInLabel}. If you didn't request this, you can ignore this email.`
    ],
    ctaLabel: 'Reset password',
    ctaUrl: data.resetUrl,
    footer: 'Sent by Luggage Tracker. If you did not request this, please contact your administrator.'
  })
  const rendered = renderMjml(
    mjml,
    `Hi ${data.firstName},\n\nReset your password using the link below. The link expires in ${data.expiresInLabel}.\n\n${data.resetUrl}\n\nIf you didn't request this, ignore this email.`
  )
  return { subject, ...rendered }
}
