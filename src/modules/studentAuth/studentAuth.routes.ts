import express, { type Router } from 'express'
import { clientInfo } from '../../middleware/clientInfo'
import { createRateLimit } from '../../middleware/rateLimit'
import { validate, validateRefreshToken } from '../../middleware/validate'
import StudentAuthController from './studentAuth.controller'
import { googleSignInSchema, studentRefreshCookieSchema } from './studentAuth.schemas'

// Student sign-in routes, mounted at /api/v1/student; the student's own data lives in
// studentPortal. Fully separate from the staff API: student tokens only pass
// StudentAuthenticateMiddleware, staff tokens never do.
export const studentRouter: Router = express.Router()

studentRouter.post(
  '/auth/google',
  createRateLimit(20, 15),
  validate(googleSignInSchema),
  clientInfo,
  StudentAuthController.GoogleSignIn,
)
studentRouter.post(
  '/auth/refresh',
  createRateLimit(60, 15),
  validateRefreshToken(studentRefreshCookieSchema),
  clientInfo,
  StudentAuthController.Refresh,
)
studentRouter.post('/auth/logout', StudentAuthController.Logout)
