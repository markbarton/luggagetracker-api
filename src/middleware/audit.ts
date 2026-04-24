import { NextFunction, Request, Response } from 'express'
import { Actor } from '../types/audit'

/*
 * Audit middleware — derives an `Actor` snapshot from the authenticated user
 * and attaches it to the request. Controllers and data-layer helpers can
 * then pass `req.actor` when creating/updating records to stamp who did it.
 *
 * Requires `authenticate` to have run first (so `req.user` is populated). If
 * there's no authed user, nothing is attached and downstream handlers can
 * decide how to handle it.
 */

declare global {
  namespace Express {
    interface Request {
      actor?: Actor
    }
  }
}

export function audit(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  if (req.user) {
    const name = `${req.user.firstName} ${req.user.lastName}`.trim()
    req.actor = {
      userId: req.user.userId,
      email: req.user.email,
      name: name || req.user.email
    }
  }
  next()
}
