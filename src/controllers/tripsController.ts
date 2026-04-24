import { Request, Response } from 'express'
import { ObjectId } from 'mongodb'
import logger from '../logger'
import * as trips from '../data/trips'
import * as users from '../data/users'
import {
  tripInputSchema,
  tripUpdateSchema,
  tripListQuerySchema
} from '../types/trip'
import { handleError } from '../utils/handleError'
import { formatZodError } from '../utils/formatZodError'
import { canAccessClient } from '../middleware/authorize'

function notAuthed(res: Response): Response {
  return res.status(401).json({ error: 'Unauthorized' })
}

function isClientAdminOrSysAdmin(req: Request): boolean {
  if (!req.user) return false
  return req.user.isSystemAdmin || req.user.roles.includes('clientAdmin')
}

export async function listTrips(req: Request, res: Response): Promise<Response> {
  try {
    if (!req.user) return notAuthed(res)
    const parsed = tripListQuerySchema.safeParse(req.query)
    if (!parsed.success) {
      return res.status(400).json({ error: formatZodError(parsed.error) })
    }
    const { page, pageSize, status, name } = parsed.data
    let { clientId } = parsed.data

    if (req.user.isSystemAdmin) {
      // no scope enforced
    } else if (req.user.roles.includes('clientAdmin')) {
      if (clientId && clientId !== req.user.clientId) {
        return res.status(403).json({ error: 'Forbidden' })
      }
      clientId = req.user.clientId ?? undefined
    } else {
      const self = await users.findById(req.user.userId)
      if (!self) return notAuthed(res)
      const tripIds = self.tripIds || []
      if (tripIds.length === 0) {
        return res.json({
          data: [],
          pagination: { page, pageSize, total: 0, totalPages: 1 }
        })
      }
      const { data, total } = await trips.list({
        page,
        pageSize,
        status,
        name,
        tripIds,
        clientId: req.user.clientId ?? undefined
      })
      return res.json({
        data,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.max(1, Math.ceil(total / pageSize))
        }
      })
    }

    const { data, total } = await trips.list({ page, pageSize, status, name, clientId })
    return res.json({
      data,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize))
      }
    })
  } catch (err) {
    return handleError(res, err, 'listTrips')
  }
}

export async function getTrip(req: Request, res: Response): Promise<Response> {
  try {
    if (!req.user) return notAuthed(res)
    const trip = await trips.findById(req.params.id)
    if (!trip) return res.status(404).json({ error: 'Not found' })

    const tripClientId = trip.clientId.toHexString()
    if (!canAccessClient(req.user, tripClientId)) {
      return res.status(403).json({ error: 'Forbidden' })
    }
    if (!isClientAdminOrSysAdmin(req)) {
      const self = await users.findById(req.user.userId)
      const hasTrip = self?.tripIds?.some(t => t.toHexString() === req.params.id)
      if (!hasTrip) return res.status(403).json({ error: 'Forbidden' })
    }
    return res.json(trip)
  } catch (err) {
    return handleError(res, err, 'getTrip')
  }
}

export async function createTrip(req: Request, res: Response): Promise<Response> {
  try {
    if (!req.user) return notAuthed(res)
    if (!isClientAdminOrSysAdmin(req)) {
      return res.status(403).json({ error: 'Forbidden' })
    }
    const parsed = tripInputSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: formatZodError(parsed.error) })
    }
    if (!canAccessClient(req.user, parsed.data.clientId)) {
      return res.status(403).json({ error: 'Cannot create trip for another client' })
    }
    const created = await trips.create(parsed.data, req.actor)
    logger.debug(`createTrip: id=${created._id} clientId=${created.clientId}`)
    return res.status(201).json(created)
  } catch (err) {
    return handleError(res, err, 'createTrip')
  }
}

export async function updateTrip(req: Request, res: Response): Promise<Response> {
  try {
    if (!req.user) return notAuthed(res)
    if (!isClientAdminOrSysAdmin(req)) {
      return res.status(403).json({ error: 'Forbidden' })
    }
    const existing = await trips.findById(req.params.id)
    if (!existing) return res.status(404).json({ error: 'Not found' })
    if (!canAccessClient(req.user, existing.clientId.toHexString())) {
      return res.status(403).json({ error: 'Forbidden' })
    }
    const parsed = tripUpdateSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: formatZodError(parsed.error) })
    }
    const updated = await trips.update(req.params.id, parsed.data, req.actor)
    if (!updated) return res.status(404).json({ error: 'Not found' })
    return res.json(updated)
  } catch (err) {
    return handleError(res, err, 'updateTrip')
  }
}

export async function deleteTrip(req: Request, res: Response): Promise<Response> {
  try {
    if (!req.user) return notAuthed(res)
    if (!isClientAdminOrSysAdmin(req)) {
      return res.status(403).json({ error: 'Forbidden' })
    }
    const existing = await trips.findById(req.params.id)
    if (!existing) return res.status(404).json({ error: 'Not found' })
    if (!canAccessClient(req.user, existing.clientId.toHexString())) {
      return res.status(403).json({ error: 'Forbidden' })
    }
    const ok = await trips.softDelete(req.params.id, req.actor)
    if (!ok) return res.status(404).json({ error: 'Not found' })
    logger.debug(`deleteTrip: id=${req.params.id} soft-deleted`)
    return res.status(204).send()
  } catch (err) {
    return handleError(res, err, 'deleteTrip')
  }
}
