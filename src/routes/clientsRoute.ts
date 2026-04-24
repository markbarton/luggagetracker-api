import express from 'express'
import {
  listClients,
  getClient,
  createClient,
  updateClient,
  deleteClient
} from '../controllers/clientsController'
import { authenticate } from '../middleware/authenticate'
import { requireSystemAdmin } from '../middleware/authorize'
import { audit } from '../middleware/audit'

const router = express.Router()

router.use(authenticate)
router.use(requireSystemAdmin)
router.use(audit)

router.get('/', listClients)
router.get('/:id', getClient)
router.post('/', createClient)
router.put('/:id', updateClient)
router.delete('/:id', deleteClient)

export default router
