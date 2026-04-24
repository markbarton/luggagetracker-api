import { NextFunction, Request, Response } from 'express'
import logger from '../logger'
import { AuthedRequestUser } from './authenticate'

function forbidden(res: Response, reason: string): Response {
  logger.debug(`authorize: forbidden - ${reason}`)
  return res.status(403).json({ error: 'Forbidden' })
}

export function requireAuthenticated(
  req: Request,
  res: Response,
  next: NextFunction
): Response | void {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' })
  return next()
}

export function requireSystemAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): Response | void {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' })
  if (!req.user.isSystemAdmin) return forbidden(res, 'not system admin')
  return next()
}

export function requireClientAdminOrSystemAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): Response | void {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' })
  if (req.user.isSystemAdmin) return next()
  if (req.user.roles.includes('clientAdmin')) return next()
  return forbidden(res, 'not client admin')
}

export function scopeClientId(user: AuthedRequestUser): string | undefined {
  if (user.isSystemAdmin) return undefined
  return user.clientId ?? undefined
}

export function canAccessClient(user: AuthedRequestUser, clientId: string): boolean {
  if (user.isSystemAdmin) return true
  return user.clientId === clientId
}
