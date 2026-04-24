import { Request, Response } from 'express'
import logger from '../logger'
import * as documents from '../data/landRegistryDocuments'
import {
  landRegistryDocumentInputSchema,
  listQuerySchema
} from '../types/landRegistryDocument'
import { handleError } from '../utils/handleError'
import { formatZodError } from '../utils/formatZodError'

export async function listDocuments(req: Request, res: Response): Promise<Response> {
  try {
    const parsed = listQuerySchema.safeParse(req.query)
    if (!parsed.success) {
      const message = formatZodError(parsed.error)
      logger.debug(`listDocuments: invalid query - ${message}`)
      return res.status(400).json({ error: message })
    }
    const { page, pageSize, titleNumber } = parsed.data

    logger.debug(`listDocuments: page=${page} pageSize=${pageSize} titleNumber=${titleNumber ?? '-'}`)

    const { data, total } = await documents.list({ page, pageSize, titleNumber })

    logger.debug(`listDocuments: returned ${data.length} of ${total}`)

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
    return handleError(res, err, 'listDocuments')
  }
}

export async function getDocument(req: Request, res: Response): Promise<Response> {
  try {
    logger.debug(`getDocument: id=${req.params.id}`)
    const doc = await documents.findById(req.params.id)
    if (!doc) {
      logger.debug(`getDocument: id=${req.params.id} not found`)
      return res.status(404).json({ error: 'Not found' })
    }
    return res.json(doc)
  } catch (err) {
    return handleError(res, err, 'getDocument')
  }
}

export async function createDocument(req: Request, res: Response): Promise<Response> {
  try {
    const parsed = landRegistryDocumentInputSchema.safeParse(req.body)
    if (!parsed.success) {
      const message = formatZodError(parsed.error)
      logger.debug(`createDocument: validation failed - ${message}`)
      return res.status(400).json({ error: message })
    }

    const created = await documents.create(parsed.data)
    logger.debug(`createDocument: created id=${created._id}`)
    return res.status(201).json(created)
  } catch (err) {
    return handleError(res, err, 'createDocument')
  }
}

export async function updateDocument(req: Request, res: Response): Promise<Response> {
  try {
    const parsed = landRegistryDocumentInputSchema.safeParse(req.body)
    if (!parsed.success) {
      const message = formatZodError(parsed.error)
      logger.debug(`updateDocument: id=${req.params.id} validation failed - ${message}`)
      return res.status(400).json({ error: message })
    }

    const updated = await documents.update(req.params.id, parsed.data)
    if (!updated) {
      logger.debug(`updateDocument: id=${req.params.id} not found`)
      return res.status(404).json({ error: 'Not found' })
    }
    logger.debug(`updateDocument: id=${req.params.id} updated`)
    return res.json(updated)
  } catch (err) {
    return handleError(res, err, 'updateDocument')
  }
}

export async function deleteDocument(req: Request, res: Response): Promise<Response> {
  try {
    logger.debug(`deleteDocument: id=${req.params.id}`)
    const deleted = await documents.remove(req.params.id)
    if (!deleted) {
      logger.debug(`deleteDocument: id=${req.params.id} not found`)
      return res.status(404).json({ error: 'Not found' })
    }
    logger.debug(`deleteDocument: id=${req.params.id} deleted`)
    return res.status(204).send()
  } catch (err) {
    return handleError(res, err, 'deleteDocument')
  }
}

