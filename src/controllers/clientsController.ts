import { Request, Response } from 'express'
import logger from '../logger'
import * as clients from '../data/clients'
import {
  clientInputSchema,
  clientUpdateSchema,
  clientListQuerySchema
} from '../types/client'
import { handleError } from '../utils/handleError'
import { formatZodError } from '../utils/formatZodError'

export async function listClients(req: Request, res: Response): Promise<Response> {
  try {
    const parsed = clientListQuerySchema.safeParse(req.query)
    if (!parsed.success) {
      const message = formatZodError(parsed.error)
      return res.status(400).json({ error: message })
    }
    const { page, pageSize, name, status } = parsed.data
    logger.debug(`listClients: page=${page} pageSize=${pageSize} name=${name ?? '-'} status=${status ?? '-'}`)
    const { data, total } = await clients.list({ page, pageSize, name, status })
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
    return handleError(res, err, 'listClients')
  }
}

export async function getClient(req: Request, res: Response): Promise<Response> {
  try {
    const doc = await clients.findById(req.params.id)
    if (!doc) return res.status(404).json({ error: 'Not found' })
    return res.json(doc)
  } catch (err) {
    return handleError(res, err, 'getClient')
  }
}

export async function createClient(req: Request, res: Response): Promise<Response> {
  try {
    const parsed = clientInputSchema.safeParse(req.body)
    if (!parsed.success) {
      const message = formatZodError(parsed.error)
      logger.debug(`createClient: validation failed - ${message}`)
      return res.status(400).json({ error: message })
    }
    const created = await clients.create(parsed.data, req.actor)
    logger.debug(`createClient: created id=${created._id}`)
    return res.status(201).json(created)
  } catch (err) {
    return handleError(res, err, 'createClient')
  }
}

export async function updateClient(req: Request, res: Response): Promise<Response> {
  try {
    const parsed = clientUpdateSchema.safeParse(req.body)
    if (!parsed.success) {
      const message = formatZodError(parsed.error)
      logger.debug(`updateClient: id=${req.params.id} validation failed - ${message}`)
      return res.status(400).json({ error: message })
    }
    const updated = await clients.update(req.params.id, parsed.data, req.actor)
    if (!updated) return res.status(404).json({ error: 'Not found' })
    logger.debug(`updateClient: id=${req.params.id} updated`)
    return res.json(updated)
  } catch (err) {
    return handleError(res, err, 'updateClient')
  }
}

export async function deleteClient(req: Request, res: Response): Promise<Response> {
  try {
    const ok = await clients.softDelete(req.params.id, req.actor)
    if (!ok) return res.status(404).json({ error: 'Not found' })
    logger.debug(`deleteClient: id=${req.params.id} soft-deleted`)
    return res.status(204).send()
  } catch (err) {
    return handleError(res, err, 'deleteClient')
  }
}
