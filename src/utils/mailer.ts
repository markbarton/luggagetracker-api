import nodemailer, { Transporter } from 'nodemailer'
import logger from '../logger'

let transporter: Transporter | null = null

function bool(value: string | undefined): boolean {
  return value === 'true' || value === '1'
}

function getTransporter(): Transporter {
  if (transporter) return transporter
  const {
    CUSTOM_SMTP_HOST,
    CUSTOM_SMTP_PORT,
    CUSTOM_SMTP_USER,
    CUSTOM_SMTP_PASS,
    CUSTOM_SMTP_SECURE
  } = process.env

  if (!CUSTOM_SMTP_HOST) {
    throw new Error('CUSTOM_SMTP_HOST is not set')
  }

  transporter = nodemailer.createTransport({
    host: CUSTOM_SMTP_HOST,
    port: CUSTOM_SMTP_PORT ? Number(CUSTOM_SMTP_PORT) : 587,
    secure: bool(CUSTOM_SMTP_SECURE),
    auth: CUSTOM_SMTP_USER
      ? { user: CUSTOM_SMTP_USER, pass: CUSTOM_SMTP_PASS }
      : undefined
  })
  return transporter
}

export interface SendEmailArgs {
  to: string
  subject: string
  html: string
  text: string
}

export async function sendEmail(args: SendEmailArgs): Promise<void> {
  const from = process.env.CUSTOM_SMTP_FROM
  if (!from) throw new Error('CUSTOM_SMTP_FROM is not set')

  await getTransporter().sendMail({
    from,
    to: args.to,
    subject: args.subject,
    html: args.html,
    text: args.text
  })
  logger.debug(`sendEmail: delivered to=${args.to} subject="${args.subject}"`)
}

export function webBaseUrl(): string {
  const raw = process.env.CUSTOM_WEB_BASE_URL
  if (!raw) throw new Error('CUSTOM_WEB_BASE_URL is not set')
  return raw.replace(/\/$/, '')
}
