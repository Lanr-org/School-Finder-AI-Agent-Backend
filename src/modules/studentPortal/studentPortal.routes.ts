import express, { type Router } from 'express'
import { StudentAuthenticateMiddleware } from '../../middleware/studentAuthenticate'
import { requireTermsAccepted } from '../../middleware/requireTermsAccepted'
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

// Routes that use the student's data also need the one-click agreement (requireTermsAccepted).
const student = [StudentAuthenticateMiddleware, requireTermsAccepted]

studentPortalRouter.get('/me', StudentAuthenticateMiddleware, StudentPortalController.GetMe)
studentPortalRouter.post('/me/accept-terms', StudentAuthenticateMiddleware, StudentPortalController.AcceptTerms)
studentPortalRouter.patch(
  '/me/profile',
  StudentAuthenticateMiddleware,
  validate(updateProfileSchema),
  StudentPortalController.UpdateProfile,
)
studentPortalRouter.get('/journey', ...student, StudentPortalController.GetJourney)
studentPortalRouter.get('/matches', ...student, StudentPortalController.GetMatches)
studentPortalRouter.post(
  '/shortlist/:programId',
  ...student,
  validateParams(programIdParamsSchema),
  StudentPortalController.AddToShortlist,
)
studentPortalRouter.delete(
  '/shortlist/:programId',
  ...student,
  validateParams(programIdParamsSchema),
  StudentPortalController.RemoveFromShortlist,
)
studentPortalRouter.post('/choice', ...student, validate(chooseProgrammeSchema), StudentPortalController.Choose)
// PUT ticks a step, DELETE unticks it. Students can only change their own steps (not proof of funds).
studentPortalRouter.put(
  '/journey/checks/:key',
  ...student,
  validateParams(journeyCheckParamsSchema),
  StudentPortalController.SetJourneyCheck,
)
studentPortalRouter.delete(
  '/journey/checks/:key',
  ...student,
  validateParams(journeyCheckParamsSchema),
  StudentPortalController.SetJourneyCheck,
)
studentPortalRouter.get('/study-plan', ...student, StudentPortalController.GetStudyPlan)
// A new public link each time (only hashes are stored); DELETE stops every link working.
studentPortalRouter.post('/study-plan/link', ...student, StudentPortalController.CreateStudyPlanLink)
studentPortalRouter.delete('/study-plan/link', ...student, StudentPortalController.RevokeStudyPlanLinks)

// Keyed by student, not IP: each message can cost an AI call. The daily reply caps live in AiUsageService (checked in processAiReply).
// Runs after StudentAuthenticateMiddleware, so req.student is always set here.
const messageRateLimit = createRateLimit(20, 1, (req) => `student:${req.student?.studentId ?? 'none'}`)

studentPortalRouter.get('/messages', ...student, StudentPortalController.GetMessages)
studentPortalRouter.post(
  '/messages',
  ...student,
  messageRateLimit,
  validate(sendMessageSchema),
  StudentPortalController.SendMessage,
)
// "Talk to an advisor": flags the thread for staff; the AI keeps replying until one takes over.
studentPortalRouter.post('/advisor-request', ...student, messageRateLimit, StudentPortalController.RequestAdvisor)
