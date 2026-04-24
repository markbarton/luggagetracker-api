import express from 'express'
import {
  listUsers,
  getUser,
  createUser,
  updateUser,
  changeUserPassword,
  setUserTrips,
  deleteUser
} from '../controllers/usersController'
import { authenticate } from '../middleware/authenticate'
import { audit } from '../middleware/audit'

const router = express.Router()

router.use(authenticate)
router.use(audit)

router.get('/', listUsers)
router.get('/:id', getUser)
router.post('/', createUser)
router.put('/:id', updateUser)
router.put('/:id/password', changeUserPassword)
router.put('/:id/trips', setUserTrips)
router.delete('/:id', deleteUser)

export default router
