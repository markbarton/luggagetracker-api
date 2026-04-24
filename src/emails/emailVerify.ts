import { layoutMjml } from './layout'
import { renderMjml, RenderedEmail } from './renderer'

export interface EmailVerifyData {
  firstName: string
  verifyUrl: string
  expiresInLabel: string
}

export function emailVerifyEmail(data: EmailVerifyData): { subject: string } & RenderedEmail {
  const subject = 'Verify your email address'
  const mjml = layoutMjml({
    previewText: 'Verify your email address',
    heading: `Hi ${data.firstName}, confirm your email`,
    paragraphs: [
      'Please verify your email address by clicking the button below.',
      `This link expires in ${data.expiresInLabel}.`
    ],
    ctaLabel: 'Verify email',
    ctaUrl: data.verifyUrl,
    footer: 'Sent by Luggage Tracker.'
  })
  const rendered = renderMjml(
    mjml,
    `Hi ${data.firstName},\n\nVerify your email using the link below. The link expires in ${data.expiresInLabel}.\n\n${data.verifyUrl}`
  )
  return { subject, ...rendered }
}
