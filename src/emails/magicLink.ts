import { layoutMjml } from './layout'
import { renderMjml, RenderedEmail } from './renderer'

export interface MagicLinkData {
  firstName: string
  magicUrl: string
  expiresInLabel: string
}

export function magicLinkEmail(data: MagicLinkData): { subject: string } & RenderedEmail {
  const subject = 'Your sign-in link'
  const mjml = layoutMjml({
    previewText: 'Sign in to Luggage Tracker',
    heading: `Hi ${data.firstName}, sign in`,
    paragraphs: [
      'Click the button below to sign in. No password needed.',
      `This link expires in ${data.expiresInLabel} and can only be used once.`,
      "If you didn't request this, you can safely ignore this email."
    ],
    ctaLabel: 'Sign in',
    ctaUrl: data.magicUrl,
    footer: 'Sent by Luggage Tracker.'
  })
  const rendered = renderMjml(
    mjml,
    `Hi ${data.firstName},\n\nSign in using the link below. The link expires in ${data.expiresInLabel} and can only be used once.\n\n${data.magicUrl}\n\nIf you didn't request this, ignore this email.`
  )
  return { subject, ...rendered }
}
