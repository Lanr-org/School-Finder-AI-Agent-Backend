import express, { type Router } from 'express'
import { StudentAuthenticateMiddleware } from '../../middleware/studentAuthenticate'
import { createRateLimit } from '../../middleware/rateLimit'
import { validate, validateParams } from '../../middleware/validate'
import StudentPortalController from './studentPortal.controller'
import {
  chooseProgrammeSchema,
  journeyCheckParamsSchema,
  programIdParamsSchema,
  sendMessageSchema,
  updateProfileSchema,
} from './studentPortal.schemas'

// The signed-in student's own data, mounted at /api/v1/student (next to studentRouter's
// /auth routes). Every route needs a student token and only ever touches that student.
export const studentPortalRouter: Router = express.Router()

studentPortalRouter.get('/me', StudentAuthenticateMiddleware, StudentPortalController.GetMe)
studentPortalRouter.patch(
  '/me/profile',
  StudentAuthenticateMiddleware,
  validate(updateProfileSchema),
  StudentPortalController.UpdateProfile,
)
studentPortalRouter.get('/journey', StudentAuthenticateMiddleware, StudentPortalController.GetJourney)
studentPortalRouter.get('/matches', StudentAuthenticateMiddleware, StudentPortalController.GetMatches)
studentPortalRouter.post(
  '/shortlist/:programId',
  StudentAuthenticateMiddleware,
  validateParams(programIdParamsSchema),
  StudentPortalController.AddToShortlist,
)
studentPortalRouter.delete(
  '/shortlist/:programId',
  StudentAuthenticateMiddleware,
  validateParams(programIdParamsSchema),
  StudentPortalController.RemoveFromShortlist,
)
studentPortalRouter.post(
  '/choice',
  StudentAuthenticateMiddleware,
  validate(chooseProgrammeSchema),
  StudentPortalController.Choose,
)
// PUT ticks a step, DELETE unticks it. Students can only change their own steps (not proof of funds).
studentPortalRouter.put(
  '/journey/checks/:key',
  StudentAuthenticateMiddleware,
  validateParams(journeyCheckParamsSchema),
  StudentPortalController.SetJourneyCheck,
)
studentPortalRouter.delete(
  '/journey/checks/:key',
  StudentAuthenticateMiddleware,
  validateParams(journeyCheckParamsSchema),
  StudentPortalController.SetJourneyCheck,
)
studentPortalRouter.get('/study-plan', StudentAuthenticateMiddleware, StudentPortalController.GetStudyPlan)
// A new public link each time (only hashes are stored); DELETE stops every link working.
studentPortalRouter.post('/study-plan/link', StudentAuthenticateMiddleware, StudentPortalController.CreateStudyPlanLink)
studentPortalRouter.delete(
  '/study-plan/link',
  StudentAuthenticateMiddleware,
  StudentPortalController.RevokeStudyPlanLinks,
)

// Keyed by student, not IP: each message can cost an AI call. The real cost cap is Stage 7.
// Runs after StudentAuthenticateMiddleware, so req.student is always set here.
const messageRateLimit = createRateLimit(20, 1, (req) => `student:${req.student?.studentId ?? 'none'}`)

studentPortalRouter.get('/messages', StudentAuthenticateMiddleware, StudentPortalController.GetMessages)
studentPortalRouter.post(
  '/messages',
  StudentAuthenticateMiddleware,
  messageRateLimit,
  validate(sendMessageSchema),
  StudentPortalController.SendMessage,
)
