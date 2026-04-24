import { Request, Response } from 'express'
import logger from '../logger'
import * as users from '../data/users'
import {
  userCreateSchema,
  userUpdateSchema,
  userPasswordChangeSchema,
  userTripsUpdateSchema,
  userListQuerySchema,
  toPublicUser,
  User
} from '../types/user'
import { handleError } from '../utils/handleError'
import { formatZodError } from '../utils/formatZodError'
import { hashPassword } from '../utils/passwords'
import { canAccessClient } from '../middleware/authorize'

function notAuthed(res: Response): Response {
  return res.status(401).json({ error: 'Unauthorized' })
}

function visibleClientId(req: Request): string | undefined {
  if (!req.user) return undefined
  if (req.user.isSystemAdmin) return undefined
  return req.user.clientId ?? undefined
}

function canManageTarget(req: Request, target: User): boolean {
  if (!req.user) return false
  if (req.user.isSystemAdmin) return true
  if (!req.user.roles.includes('clientAdmin')) return false
  const targetClient = target.clientId ? target.clientId.toHexString() : null
  return targetClient !== null && targetClient === req.user.clientId
}

export async function listUsers(req: Request, res: Response): Promise<Response> {
  try {
    if (!req.user) return notAuthed(res)
    const parsed = userListQuerySchema.safeParse(req.query)
    if (!parsed.success) {
      return res.status(400).json({ error: formatZodError(parsed.error) })
    }
    const { page, pageSize, email, status } = parsed.data
    let { clientId } = parsed.data

    const scope = visibleClientId(req)
    if (scope) {
      if (clientId && clientId !== scope) {
        return res.status(403).json({ error: 'Forbidden' })
      }
      clientId = scope
    }

    const { data, total } = await users.list({ page, pageSize, clientId, email, status })
    return res.json({
      data: data.map(toPublicUser),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize))
      }
    })
  } catch (err) {
    return handleError(res, err, 'listUsers')
  }
}

export async function getUser(req: Request, res: Response): Promise<Response> {
  try {
    if (!req.user) return notAuthed(res)
    const doc = await users.findById(req.params.id)
    if (!doc) return res.status(404).json({ error: 'Not found' })

    const isSelf = doc._id?.toHexString() === req.user.userId
    if (!isSelf && !canManageTarget(req, doc)) {
      return res.status(403).json({ error: 'Forbidden' })
    }
    return res.json(toPublicUser(doc))
  } catch (err) {
    return handleError(res, err, 'getUser')
  }
}

export async function createUser(req: Request, res: Response): Promise<Response> {
  try {
    if (!req.user) return notAuthed(res)
    const parsed = userCreateSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: formatZodError(parsed.error) })
    }
    const input = parsed.data

    if (!req.user.isSystemAdmin) {
      if (!req.user.roles.includes('clientAdmin')) {
        return res.status(403).json({ error: 'Forbidden' })
      }
      if (input.isSystemAdmin) {
        logger.debug(`createUser: clientAdmin attempted to create systemAdmin`)
        return res.status(403).json({ error: 'Cannot create system admin' })
      }
      if (!input.clientId || !canAccessClient(req.user, input.clientId)) {
        return res.status(403).json({ error: 'Cannot create user outside own client' })
      }
    }

    const existing = await users.findByEmail(input.email)
    if (existing) {
      return res.status(400).json({ error: 'email already in use' })
    }

    const passwordHash = await hashPassword(input.password)
    const { password, ...rest } = input
    const created = await users.create({ ...rest, passwordHash, emailVerified: true }, req.actor)
    logger.debug(`createUser: created id=${created._id} email=${created.email}`)
    return res.status(201).json(toPublicUser(created))
  } catch (err) {
    return handleError(res, err, 'createUser')
  }
}

export async function updateUser(req: Request, res: Response): Promise<Response> {
  try {
    if (!req.user) return notAuthed(res)
    const target = await users.findById(req.params.id)
    if (!target) return res.status(404).json({ error: 'Not found' })

    if (!canManageTarget(req, target)) {
      return res.status(403).json({ error: 'Forbidden' })
    }

    const parsed = userUpdateSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: formatZodError(parsed.error) })
    }

    const updated = await users.update(req.params.id, parsed.data, req.actor)
    if (!updated) return res.status(404).json({ error: 'Not found' })
    return res.json(toPublicUser(updated))
  } catch (err) {
    return handleError(res, err, 'updateUser')
  }
}

export async function changeUserPassword(req: Request, res: Response): Promise<Response> {
  try {
    if (!req.user) return notAuthed(res)
    const target = await users.findById(req.params.id)
    if (!target) return res.status(404).json({ error: 'Not found' })

    const isSelf = target._id?.toHexString() === req.user.userId
    if (!isSelf && !canManageTarget(req, target)) {
      return res.status(403).json({ error: 'Forbidden' })
    }

    const parsed = userPasswordChangeSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: formatZodError(parsed.error) })
    }

    const hash = await hashPassword(parsed.data.password)
    const ok = await users.changePassword(req.params.id, hash, req.actor)
    if (!ok) return res.status(404).json({ error: 'Not found' })
    logger.debug(`changeUserPassword: id=${req.params.id} updated`)
    return res.status(204).send()
  } catch (err) {
    return handleError(res, err, 'changeUserPassword')
  }
}

export async function setUserTrips(req: Request, res: Response): Promise<Response> {
  try {
    if (!req.user) return notAuthed(res)
    const target = await users.findById(req.params.id)
    if (!target) return res.status(404).json({ error: 'Not found' })

    if (!canManageTarget(req, target)) {
      return res.status(403).json({ error: 'Forbidden' })
    }

    const parsed = userTripsUpdateSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: formatZodError(parsed.error) })
    }

    const updated = await users.setTripIds(req.params.id, parsed.data.tripIds)
    if (!updated) return res.status(404).json({ error: 'Not found' })
    logger.debug(`setUserTrips: id=${req.params.id} tripIds=${parsed.data.tripIds.length}`)
    return res.json(toPublicUser(updated))
  } catch (err) {
    return handleError(res, err, 'setUserTrips')
  }
}

export async function deleteUser(req: Request, res: Response): Promise<Response> {
  try {
    if (!req.user) return notAuthed(res)
    const target = await users.findById(req.params.id)
    if (!target) return res.status(404).json({ error: 'Not found' })

    if (!canManageTarget(req, target)) {
      return res.status(403).json({ error: 'Forbidden' })
    }

    const ok = await users.softDelete(req.params.id, req.actor)
    if (!ok) return res.status(404).json({ error: 'Not found' })
    logger.debug(`deleteUser: id=${req.params.id} soft-deleted`)
    return res.status(204).send()
  } catch (err) {
    return handleError(res, err, 'deleteUser')
  }
}
