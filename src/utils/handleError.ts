import { Response } from 'express'
import logger from '../logger'

export function handleError(res: Response, err: unknown, context: string): Response {
  logger.error(`${context} failed: ${err instanceof Error ? err.message : String(err)}`)
  return res.status(500).json({ error: 'Internal server error' })
}
