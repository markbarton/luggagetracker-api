import express from 'express'
import {
  listTrips,
  getTrip,
  createTrip,
  updateTrip,
  deleteTrip
} from '../controllers/tripsController'
import { authenticate } from '../middleware/authenticate'
import { audit } from '../middleware/audit'

const router = express.Router()

router.use(authenticate)
router.use(audit)

router.get('/', listTrips)
router.get('/:id', getTrip)
router.post('/', createTrip)
router.put('/:id', updateTrip)
router.delete('/:id', deleteTrip)

export default router
