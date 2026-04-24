import mjml2html from 'mjml'
import logger from '../logger'

export interface RenderedEmail {
  html: string
  text: string
}

export function renderMjml(mjml: string, textFallback: string): RenderedEmail {
  const { html, errors } = mjml2html(mjml, { validationLevel: 'soft' })
  if (errors && errors.length) {
    for (const e of errors) {
      logger.debug(`mjml render warning: ${e.formattedMessage ?? e.message}`)
    }
  }
  return { html, text: textFallback }
}

export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
