import { Request, Response } from 'express'
import { returnClient } from '../app/dbConnect'

const startTime = Date.now()

const getHealth = async (_req: Request, res: Response): Promise<Response> => {
  const client = returnClient()

  // Check MongoDB connection
  let dbStatus = 'disconnected'
  let dbHosts = ''

  if (client) {
    try {
      // Ping the database to verify connection is alive
      await client.db().command({ ping: 1 })
      dbStatus = 'connected'
      // Get hosts from connection string (mask credentials)
      const connectionString = process.env.CUSTOM_MONGO_CONNECTION || ''
      const hostsMatch = connectionString.match(/@([^/]+)/)
      dbHosts = hostsMatch ? hostsMatch[1] : 'unknown'
    } catch {
      dbStatus = 'error'
    }
  }

  const health = {
    status: dbStatus === 'connected' ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    service: process.env.APP_NAME || 'api',
    uptime: Math.floor((Date.now() - startTime) / 1000),
    database: {
      status: dbStatus,
      hosts: dbHosts
    }
  }

  const statusCode = health.status === 'healthy' ? 200 : 503
  return res.status(statusCode).json(health)
}

export { getHealth }
