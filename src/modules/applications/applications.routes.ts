import express, { type Router } from 'express'
import { ApplicationsController } from './applications.controller.js'
import { ApplicationsSchemas } from './applications.schemas.js'
import {
  validate,
  validateParams,
  validateQuery,
} from '../../middleware/validate.js'
import { AuthenticateMiddleware } from '../../middleware/authenticate.js'
import { requireRole } from '../../middleware/authorize.js'

// Standalone /applications routes only — the student-scoped list/create routes
// live in students.routes.ts, like notes, follow-ups, and recommendations.
export const applicationsRouter: Router = express.Router()

applicationsRouter.use(AuthenticateMiddleware)

// ADMIN sees everything; ADVISOR is scoped to their assigned students at the
// service layer (assertStudentOwnership / forced advisor filter on the list).
const canAccessApplications = requireRole('ADMIN', 'ADVISOR')

applicationsRouter.get(
  '/',
  canAccessApplications,
  validateQuery(ApplicationsSchemas.listApplicationsQuerySchema),
  ApplicationsController.List,
)

applicationsRouter.get(
  '/:applicationId',
  canAccessApplications,
  validateParams(ApplicationsSchemas.applicationIdParamsSchema),
  ApplicationsController.Get,
)

applicationsRouter.patch(
  '/:applicationId',
  canAccessApplications,
  validateParams(ApplicationsSchemas.applicationIdParamsSchema),
  validate(ApplicationsSchemas.updateApplicationSchema),
  ApplicationsController.Update,
)

applicationsRouter.patch(
  '/:applicationId/status',
  canAccessApplications,
  validateParams(ApplicationsSchemas.applicationIdParamsSchema),
  validate(ApplicationsSchemas.updateStatusSchema),
  ApplicationsController.UpdateStatus,
)
