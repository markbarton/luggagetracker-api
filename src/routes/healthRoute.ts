// Health check endpoint for monitoring and DevTools integration
import express from 'express'
const router = express.Router()
import { getHealth } from '../controllers/healthController'

router.get('/', getHealth)

export default router
