import express, { type Router } from 'express'
import { createRateLimit } from '../../middleware/rateLimit'
import { StudentAuthenticateMiddleware } from '../../middleware/studentAuthenticate'
import StudentLinkController from './studentLink.controller'

// Mounted at /api/v1/student. The Telegram → web direction has no route of its own: the bot
// creates that link, and Google sign-in redeems it (linkToken on POST /auth/google).
export const studentLinkRouter: Router = express.Router()

studentLinkRouter.post(
  '/telegram-link',
  StudentAuthenticateMiddleware,
  createRateLimit(10, 15, (req) => `student:${req.student?.studentId ?? 'none'}`),
  StudentLinkController.CreateTelegramLink,
)
