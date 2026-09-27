import express, { type Router } from 'express'
import { StudentAuthenticateMiddleware } from '../../middleware/studentAuthenticate'
import { validate, validateParams } from '../../middleware/validate'
import StudentPortalController from './studentPortal.controller'
import { chooseProgrammeSchema, programIdParamsSchema, updateProfileSchema } from './studentPortal.schemas'

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
studentPortalRouter.get('/study-plan', StudentAuthenticateMiddleware, StudentPortalController.GetStudyPlan)
studentPortalRouter.post(
  '/study-plan/shared',
  StudentAuthenticateMiddleware,
  StudentPortalController.MarkStudyPlanShared,
)
