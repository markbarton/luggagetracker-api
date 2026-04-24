import { NextFunction, Request, Response } from 'express'
import { ObjectId } from 'mongodb'
import logger from '../logger'
import { verifyToken, JwtPayload } from '../utils/jwt'
import * as sessions from '../data/sessions'
import * as users from '../data/users'

export interface AuthedRequestUser {
  userId: string
  sessionId: string
  clientId: string | null
  isSystemAdmin: boolean
  roles: string[]
  platform: 'mobile' | 'web'
  email: string
  firstName: string
  lastName: string
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthedRequestUser
      jwt?: JwtPayload
    }
  }
}

export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<Response | void> {
  const header = req.header('authorization') || req.header('Authorization')
  if (!header || !header.startsWith('Bearer ')) {
    logger.debug('authenticate: missing bearer token')
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const token = header.slice(7).trim()
  const payload = verifyToken(token)
  if (!payload) {
    logger.debug('authenticate: invalid or expired token')
    return res.status(401).json({ error: 'Unauthorized' })
  }

  if (payload.kind !== 'access') {
    logger.debug('authenticate: non-access token presented')
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const session = await sessions.findActiveById(payload.sid)
  if (!session) {
    logger.debug(`authenticate: session ${payload.sid} not active`)
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const user = await users.findById(payload.sub)
  if (!user || user.status !== 'active') {
    logger.debug(`authenticate: user ${payload.sub} missing or inactive`)
    return res.status(401).json({ error: 'Unauthorized' })
  }

  req.user = {
    userId: payload.sub,
    sessionId: payload.sid,
    clientId: user.clientId ? user.clientId.toHexString() : null,
    isSystemAdmin: user.isSystemAdmin,
    roles: user.roles,
    platform: payload.platform,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName
  }
  req.jwt = payload

  if (session._id) await sessions.touch(session._id as ObjectId)

  return next()
}
