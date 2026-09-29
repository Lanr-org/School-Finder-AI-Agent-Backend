import express, { type Router } from 'express'
import { createRateLimit } from '../../middleware/rateLimit'
import { validateParams } from '../../middleware/validate'
import StudyPlanLinkController from './studyPlanLinks.controller'
import { studyPlanTokenParamsSchema } from './studyPlanLinks.schemas'

// Public (no sign-in): mounted at /api/v1/public. The token is the only credential.
export const publicStudyPlanRouter: Router = express.Router()

publicStudyPlanRouter.get(
  '/study-plans/:token',
  createRateLimit(30, 1),
  validateParams(studyPlanTokenParamsSchema),
  StudyPlanLinkController.GetPublic,
)
