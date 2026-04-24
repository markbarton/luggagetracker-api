import { escapeHtml } from './renderer'

export interface LayoutInput {
  previewText: string
  heading: string
  paragraphs: string[]
  ctaLabel: string
  ctaUrl: string
  footer: string
}

export function layoutMjml(input: LayoutInput): string {
  const appName = process.env.APP_NAME || 'Luggage Tracker'
  const paragraphsMjml = input.paragraphs
    .map(p => `<mj-text font-size="14px" line-height="22px" color="#333333">${escapeHtml(p)}</mj-text>`)
    .join('\n')

  return `<mjml>
  <mj-head>
    <mj-title>${escapeHtml(input.heading)}</mj-title>
    <mj-preview>${escapeHtml(input.previewText)}</mj-preview>
    <mj-attributes>
      <mj-all font-family="Helvetica, Arial, sans-serif" />
    </mj-attributes>
  </mj-head>
  <mj-body background-color="#f4f4f7">
    <mj-section padding="32px 0 16px 0">
      <mj-column>
        <mj-text font-size="18px" font-weight="600" color="#222222" align="center">${escapeHtml(appName)}</mj-text>
      </mj-column>
    </mj-section>
    <mj-section background-color="#ffffff" padding="24px" border-radius="8px">
      <mj-column>
        <mj-text font-size="22px" font-weight="600" color="#111111">${escapeHtml(input.heading)}</mj-text>
        ${paragraphsMjml}
        <mj-button background-color="#1f6feb" color="#ffffff" font-size="15px" border-radius="6px" padding="24px 0 8px 0" href="${encodeURI(input.ctaUrl)}">
          ${escapeHtml(input.ctaLabel)}
        </mj-button>
        <mj-text font-size="12px" color="#666666" padding-top="16px">If the button doesn't work, copy and paste this link into your browser:</mj-text>
        <mj-text font-size="12px" color="#1f6feb">${escapeHtml(input.ctaUrl)}</mj-text>
      </mj-column>
    </mj-section>
    <mj-section padding="24px 0">
      <mj-column>
        <mj-text font-size="12px" color="#888888" align="center">${escapeHtml(input.footer)}</mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>`
}
