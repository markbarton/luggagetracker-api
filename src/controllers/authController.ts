import { Request, Response } from 'express'
import { ObjectId } from 'mongodb'
import logger from '../logger'
import { loginSchema, refreshSchema } from '../types/auth'
import {
  passwordResetRequestSchema,
  passwordResetConfirmSchema,
  emailVerifyConfirmSchema,
  magicLinkRequestSchema,
  magicLinkConfirmSchema
} from '../types/emailToken'
import { toPublicUser, User } from '../types/user'
import * as users from '../data/users'
import * as sessions from '../data/sessions'
import * as emailTokens from '../data/emailTokens'
import { verifyPassword, hashPassword } from '../utils/passwords'
import {
  signToken,
  verifyToken,
  webAccessTtl,
  webRefreshTtl,
  mobileAccessTtl,
  ttlToMillis
} from '../utils/jwt'
import { handleError } from '../utils/handleError'
import { formatZodError } from '../utils/formatZodError'
import { sendEmail, webBaseUrl } from '../utils/mailer'
import { generateEmailToken, hashEmailToken } from '../utils/emailTokenCrypto'
import { passwordResetEmail } from '../emails/passwordReset'
import { emailVerifyEmail } from '../emails/emailVerify'
import { magicLinkEmail } from '../emails/magicLink'

const PASSWORD_RESET_TTL = process.env.CUSTOM_EMAIL_TOKEN_PASSWORD_RESET_TTL || '1h'
const EMAIL_VERIFY_TTL = process.env.CUSTOM_EMAIL_TOKEN_EMAIL_VERIFY_TTL || '24h'
const MAGIC_LINK_TTL = process.env.CUSTOM_EMAIL_TOKEN_MAGIC_LINK_TTL || '15m'

function ttlLabel(ttl: string): string {
  const m = ttl.match(/^(\d+)([smhd])$/)
  if (!m) return ttl
  const n = Number(m[1])
  const unit = m[2]
  const word = unit === 's' ? 'second' : unit === 'm' ? 'minute' : unit === 'h' ? 'hour' : 'day'
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

async function issueWebSessionPair(
  user: User,
  deviceLabel?: string
): Promise<{ accessToken: string; refreshToken: string }> {
  if (!user._id) throw new Error('user missing _id')
  const accessTtl = webAccessTtl()
  const refreshTtl = webRefreshTtl()
  const accessExp = new Date(Date.now() + ttlToMillis(accessTtl))
  const refreshExp = new Date(Date.now() + ttlToMillis(refreshTtl))

  const accessSession = await sessions.create({
    userId: user._id,
    platform: 'web',
    kind: 'access',
    expiresAt: accessExp,
    deviceLabel
  })
  const refreshSession = await sessions.create({
    userId: user._id,
    platform: 'web',
    kind: 'refresh',
    expiresAt: refreshExp,
    deviceLabel
  })

  const base = {
    sub: user._id.toHexString(),
    clientId: user.clientId ? user.clientId.toHexString() : null,
    isSystemAdmin: user.isSystemAdmin,
    roles: user.roles,
    platform: 'web' as const
  }

  return {
    accessToken: signToken(
      { ...base, sid: (accessSession._id as ObjectId).toHexString(), kind: 'access' },
      accessTtl
    ),
    refreshToken: signToken(
      { ...base, sid: (refreshSession._id as ObjectId).toHexString(), kind: 'refresh' },
      refreshTtl
    )
  }
}

export async function login(req: Request, res: Response): Promise<Response> {
  try {
    const parsed = loginSchema.safeParse(req.body)
    if (!parsed.success) {
      const message = formatZodError(parsed.error)
      logger.debug(`login: validation failed - ${message}`)
      return res.status(400).json({ error: message })
    }
    const { email, password, platform, deviceLabel } = parsed.data

    const user = await users.findByEmail(email)
    if (!user || !user._id) {
      logger.debug(`login: user ${email} not found`)
      return res.status(401).json({ error: 'Invalid credentials' })
    }
    if (user.status !== 'active') {
      logger.debug(`login: user ${email} not active (${user.status})`)
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    const ok = await verifyPassword(password, user.passwordHash)
    if (!ok) {
      logger.debug(`login: user ${email} wrong password`)
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    if (user.accessMode !== 'both' && user.accessMode !== platform) {
      logger.debug(`login: user ${email} accessMode=${user.accessMode} platform=${platform} mismatch`)
      return res.status(403).json({ error: 'Platform not permitted for this user' })
    }

    const accessTtl = platform === 'mobile' ? mobileAccessTtl() : webAccessTtl()
    const accessExp = new Date(Date.now() + ttlToMillis(accessTtl))

    const accessSession = await sessions.create({
      userId: user._id,
      platform,
      kind: 'access',
      expiresAt: accessExp,
      deviceLabel
    })

    const basePayload = {
      sub: user._id.toHexString(),
      clientId: user.clientId ? user.clientId.toHexString() : null,
      isSystemAdmin: user.isSystemAdmin,
      roles: user.roles,
      platform
    }

    const accessToken = signToken(
      { ...basePayload, sid: (accessSession._id as ObjectId).toHexString(), kind: 'access' },
      accessTtl
    )

    let refreshToken: string | undefined
    if (platform === 'web') {
      const refreshTtl = webRefreshTtl()
      const refreshExp = new Date(Date.now() + ttlToMillis(refreshTtl))
      const refreshSession = await sessions.create({
        userId: user._id,
        platform,
        kind: 'refresh',
        expiresAt: refreshExp,
        deviceLabel
      })
      refreshToken = signToken(
        { ...basePayload, sid: (refreshSession._id as ObjectId).toHexString(), kind: 'refresh' },
        refreshTtl
      )
    }

    await users.recordLogin(user._id)

    logger.debug(`login: user ${email} platform=${platform} ok`)
    return res.json({
      accessToken,
      refreshToken,
      user: toPublicUser(user)
    })
  } catch (err) {
    return handleError(res, err, 'login')
  }
}

export async function refresh(req: Request, res: Response): Promise<Response> {
  try {
    const parsed = refreshSchema.safeParse(req.body)
    if (!parsed.success) {
      const message = formatZodError(parsed.error)
      logger.debug(`refresh: validation failed - ${message}`)
      return res.status(400).json({ error: message })
    }

    const payload = verifyToken(parsed.data.refreshToken)
    if (!payload || payload.kind !== 'refresh') {
      logger.debug('refresh: invalid refresh token')
      return res.status(401).json({ error: 'Invalid refresh token' })
    }
    if (payload.platform !== 'web') {
      logger.debug('refresh: non-web platform rejected')
      return res.status(400).json({ error: 'Refresh only supported on web' })
    }

    const session = await sessions.findActiveById(payload.sid)
    if (!session) {
      logger.debug(`refresh: session ${payload.sid} not active`)
      return res.status(401).json({ error: 'Invalid refresh token' })
    }

    const user = await users.findById(payload.sub)
    if (!user || !user._id || user.status !== 'active') {
      logger.debug(`refresh: user ${payload.sub} missing or inactive`)
      return res.status(401).json({ error: 'Invalid refresh token' })
    }

    await sessions.revoke(payload.sid)

    const accessTtl = webAccessTtl()
    const refreshTtl = webRefreshTtl()
    const accessExp = new Date(Date.now() + ttlToMillis(accessTtl))
    const refreshExp = new Date(Date.now() + ttlToMillis(refreshTtl))

    const accessSession = await sessions.create({
      userId: user._id,
      platform: 'web',
      kind: 'access',
      expiresAt: accessExp,
      deviceLabel: session.deviceLabel
    })
    const refreshSession = await sessions.create({
      userId: user._id,
      platform: 'web',
      kind: 'refresh',
      expiresAt: refreshExp,
      deviceLabel: session.deviceLabel
    })

    const basePayload = {
      sub: user._id.toHexString(),
      clientId: user.clientId ? user.clientId.toHexString() : null,
      isSystemAdmin: user.isSystemAdmin,
      roles: user.roles,
      platform: 'web' as const
    }

    const accessToken = signToken(
      { ...basePayload, sid: (accessSession._id as ObjectId).toHexString(), kind: 'access' },
      accessTtl
    )
    const refreshToken = signToken(
      { ...basePayload, sid: (refreshSession._id as ObjectId).toHexString(), kind: 'refresh' },
      refreshTtl
    )

    logger.debug(`refresh: user ${user.email} rotated`)
    return res.json({ accessToken, refreshToken })
  } catch (err) {
    return handleError(res, err, 'refresh')
  }
}

export async function logout(req: Request, res: Response): Promise<Response> {
  try {
    if (req.user) {
      await sessions.revoke(req.user.sessionId)
      logger.debug(`logout: session ${req.user.sessionId} revoked`)
    }
    if (req.body && typeof req.body.refreshToken === 'string') {
      const payload = verifyToken(req.body.refreshToken)
      if (payload && payload.kind === 'refresh') {
        await sessions.revoke(payload.sid)
        logger.debug(`logout: refresh session ${payload.sid} revoked`)
      }
    }
    return res.status(204).send()
  } catch (err) {
    return handleError(res, err, 'logout')
  }
}

export async function me(req: Request, res: Response): Promise<Response> {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' })
    const user = await users.findById(req.user.userId)
    if (!user) return res.status(404).json({ error: 'Not found' })
    return res.json(toPublicUser(user))
  } catch (err) {
    return handleError(res, err, 'me')
  }
}

export async function listOwnSessions(req: Request, res: Response): Promise<Response> {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' })
    const list = await sessions.listActiveForUser(new ObjectId(req.user.userId))
    return res.json({ data: list })
  } catch (err) {
    return handleError(res, err, 'listOwnSessions')
  }
}

export async function revokeSession(req: Request, res: Response): Promise<Response> {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' })
    const sessionId = req.params.id
    const session = await sessions.findActiveById(sessionId)
    if (!session) return res.status(404).json({ error: 'Not found' })
    const ownsSession = session.userId.toHexString() === req.user.userId
    if (!ownsSession && !req.user.isSystemAdmin) {
      logger.debug(`revokeSession: user ${req.user.userId} cannot revoke session ${sessionId}`)
      return res.status(403).json({ error: 'Forbidden' })
    }
    await sessions.revoke(sessionId)
    logger.debug(`revokeSession: ${sessionId} revoked`)
    return res.status(204).send()
  } catch (err) {
    return handleError(res, err, 'revokeSession')
  }
}

export async function requestPasswordReset(req: Request, res: Response): Promise<Response> {
  try {
    const parsed = passwordResetRequestSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: formatZodError(parsed.error) })
    }
    const user = await users.findByEmail(parsed.data.email)
    if (user && user._id && user.status === 'active') {
      const token = generateEmailToken()
      const tokenHash = hashEmailToken(token)
      const expiresAt = new Date(Date.now() + ttlToMillis(PASSWORD_RESET_TTL))
      await emailTokens.create({ userId: user._id, purpose: 'passwordReset', tokenHash, expiresAt })

      const resetUrl = `${webBaseUrl()}/reset-password?token=${encodeURIComponent(token)}`
      const { subject, html, text } = passwordResetEmail({
        firstName: user.firstName,
        resetUrl,
        expiresInLabel: ttlLabel(PASSWORD_RESET_TTL)
      })
      try {
        await sendEmail({ to: user.email, subject, html, text })
      } catch (err) {
        logger.error(`requestPasswordReset: send failed for ${user.email}: ${err instanceof Error ? err.message : String(err)}`)
      }
    } else {
      logger.debug(`requestPasswordReset: no active user for ${parsed.data.email}`)
    }
    return res.status(204).send()
  } catch (err) {
    return handleError(res, err, 'requestPasswordReset')
  }
}

export async function confirmPasswordReset(req: Request, res: Response): Promise<Response> {
  try {
    const parsed = passwordResetConfirmSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: formatZodError(parsed.error) })
    }
    const tokenHash = hashEmailToken(parsed.data.token)
    const record = await emailTokens.findByHash(tokenHash, 'passwordReset')
    if (!record || record.usedAt || record.expiresAt.getTime() <= Date.now()) {
      logger.debug('confirmPasswordReset: invalid or expired token')
      return res.status(400).json({ error: 'Invalid or expired token' })
    }
    const user = await users.findById(record.userId.toHexString())
    if (!user || !user._id || user.status !== 'active') {
      return res.status(400).json({ error: 'Invalid or expired token' })
    }
    const passwordHash = await hashPassword(parsed.data.newPassword)
    await users.changePassword(user._id.toHexString(), passwordHash)
    await emailTokens.markUsed(record._id as ObjectId)
    await sessions.revokeAllForUser(user._id)
    logger.debug(`confirmPasswordReset: user ${user.email} password reset; all sessions revoked`)
    return res.status(204).send()
  } catch (err) {
    return handleError(res, err, 'confirmPasswordReset')
  }
}

export async function sendEmailVerification(req: Request, res: Response): Promise<Response> {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' })
    const user = await users.findById(req.user.userId)
    if (!user || !user._id) return res.status(404).json({ error: 'Not found' })
    if (user.emailVerifiedAt) {
      logger.debug(`sendEmailVerification: user ${user.email} already verified`)
      return res.status(204).send()
    }
    const token = generateEmailToken()
    const tokenHash = hashEmailToken(token)
    const expiresAt = new Date(Date.now() + ttlToMillis(EMAIL_VERIFY_TTL))
    await emailTokens.create({ userId: user._id, purpose: 'emailVerify', tokenHash, expiresAt })

    const verifyUrl = `${webBaseUrl()}/verify-email?token=${encodeURIComponent(token)}`
    const { subject, html, text } = emailVerifyEmail({
      firstName: user.firstName,
      verifyUrl,
      expiresInLabel: ttlLabel(EMAIL_VERIFY_TTL)
    })
    await sendEmail({ to: user.email, subject, html, text })
    return res.status(204).send()
  } catch (err) {
    return handleError(res, err, 'sendEmailVerification')
  }
}

export async function confirmEmailVerification(req: Request, res: Response): Promise<Response> {
  try {
    const parsed = emailVerifyConfirmSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: formatZodError(parsed.error) })
    }
    const tokenHash = hashEmailToken(parsed.data.token)
    const record = await emailTokens.findByHash(tokenHash, 'emailVerify')
    if (!record || record.usedAt || record.expiresAt.getTime() <= Date.now()) {
      return res.status(400).json({ error: 'Invalid or expired token' })
    }
    await users.markEmailVerified(record.userId)
    await emailTokens.markUsed(record._id as ObjectId)
    logger.debug(`confirmEmailVerification: user ${record.userId} verified`)
    return res.status(204).send()
  } catch (err) {
    return handleError(res, err, 'confirmEmailVerification')
  }
}

export async function requestMagicLink(req: Request, res: Response): Promise<Response> {
  try {
    const parsed = magicLinkRequestSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: formatZodError(parsed.error) })
    }
    const user = await users.findByEmail(parsed.data.email)
    if (user && user._id && user.status === 'active' && user.accessMode !== 'mobile') {
      const token = generateEmailToken()
      const tokenHash = hashEmailToken(token)
      const expiresAt = new Date(Date.now() + ttlToMillis(MAGIC_LINK_TTL))
      await emailTokens.create({ userId: user._id, purpose: 'magicLink', tokenHash, expiresAt })

      const magicUrl = `${webBaseUrl()}/magic-link?token=${encodeURIComponent(token)}`
      const { subject, html, text } = magicLinkEmail({
        firstName: user.firstName,
        magicUrl,
        expiresInLabel: ttlLabel(MAGIC_LINK_TTL)
      })
      try {
        await sendEmail({ to: user.email, subject, html, text })
      } catch (err) {
        logger.error(`requestMagicLink: send failed for ${user.email}: ${err instanceof Error ? err.message : String(err)}`)
      }
    } else {
      logger.debug(`requestMagicLink: no eligible user for ${parsed.data.email}`)
    }
    return res.status(204).send()
  } catch (err) {
    return handleError(res, err, 'requestMagicLink')
  }
}

export async function confirmMagicLink(req: Request, res: Response): Promise<Response> {
  try {
    const parsed = magicLinkConfirmSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: formatZodError(parsed.error) })
    }
    const tokenHash = hashEmailToken(parsed.data.token)
    const record = await emailTokens.findByHash(tokenHash, 'magicLink')
    if (!record || record.usedAt || record.expiresAt.getTime() <= Date.now()) {
      return res.status(400).json({ error: 'Invalid or expired token' })
    }
    const user = await users.findById(record.userId.toHexString())
    if (!user || !user._id || user.status !== 'active' || user.accessMode === 'mobile') {
      return res.status(400).json({ error: 'Invalid or expired token' })
    }

    await emailTokens.markUsed(record._id as ObjectId)
    const { accessToken, refreshToken } = await issueWebSessionPair(user)
    await users.recordLogin(user._id)

    logger.debug(`confirmMagicLink: user ${user.email} signed in via magic link`)
    return res.json({ accessToken, refreshToken, user: toPublicUser(user) })
  } catch (err) {
    return handleError(res, err, 'confirmMagicLink')
  }
}
