import express from 'express'
import {
  login,
  refresh,
  logout,
  me,
  listOwnSessions,
  revokeSession,
  requestPasswordReset,
  confirmPasswordReset,
  sendEmailVerification,
  confirmEmailVerification,
  requestMagicLink,
  confirmMagicLink
} from '../controllers/authController'
import { authenticate } from '../middleware/authenticate'

const router = express.Router()

router.post('/login', login)
router.post('/refresh', refresh)
router.post('/logout', authenticate, logout)
router.get('/me', authenticate, me)
router.get('/sessions', authenticate, listOwnSessions)
router.post('/sessions/:id/revoke', authenticate, revokeSession)

router.post('/password-reset/request', requestPasswordReset)
router.post('/password-reset/confirm', confirmPasswordReset)

router.post('/email-verify/send', authenticate, sendEmailVerification)
router.post('/email-verify/confirm', confirmEmailVerification)

router.post('/magic-link/request', requestMagicLink)
router.post('/magic-link/confirm', confirmMagicLink)

export default router
