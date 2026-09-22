import express, { type Router } from 'express'
import { AdvisorsController } from './advisors.controller.js'
import { AdvisorsSchemas } from './advisors.schemas.js'
import { FollowUpsSchemas } from '../followUps/followUps.schemas.js'
import {
  validate,
  validateParams,
  validateQuery,
} from '../../middleware/validate.js'
import { AuthenticateMiddleware } from '../../middleware/authenticate.js'
import { requireRole } from '../../middleware/authorize.js'

export const advisorsRouter: Router = express.Router()

// All advisors routes require authentication — middleware applied first on every route.
advisorsRouter.use(AuthenticateMiddleware)

const canAccessAdvisors = requireRole('ADMIN', 'ADVISOR')
const canManageAdvisors = requireRole('ADMIN')
const isAdvisorSelf = requireRole('ADVISOR')

advisorsRouter.get('/', canAccessAdvisors, AdvisorsController.ListProfiles)

// "/me" routes are registered before "/:advisorId" so Express doesn't try to
// resolve "me" as an advisorId param value.
advisorsRouter.get('/me', isAdvisorSelf, AdvisorsController.GetOwnProfile)

advisorsRouter.patch(
  '/me',
  isAdvisorSelf,
  validate(AdvisorsSchemas.updateOwnAvailabilitySchema),
  AdvisorsController.UpdateOwnAvailability,
)

advisorsRouter.get(
  '/me/students',
  isAdvisorSelf,
  validateQuery(AdvisorsSchemas.listAdvisorStudentsQuerySchema),
  AdvisorsController.ListOwnStudents,
)

advisorsRouter.get(
  '/me/follow-ups',
  isAdvisorSelf,
  validateQuery(FollowUpsSchemas.listFollowUpsQuerySchema),
  AdvisorsController.ListOwnFollowUps,
)

// Only ADMIN creates advisor profiles — advisors don't self-provision capacity.
advisorsRouter.post(
  '/',
  canManageAdvisors,
  validate(AdvisorsSchemas.createAdvisorProfileSchema),
  AdvisorsController.CreateProfile,
)

advisorsRouter.get(
  '/:advisorId',
  canAccessAdvisors,
  validateParams(AdvisorsSchemas.advisorIdParamsSchema),
  AdvisorsController.GetProfile,
)

// Only ADMIN updates capacity/availability for another advisor.
advisorsRouter.patch(
  '/:advisorId',
  canManageAdvisors,
  validateParams(AdvisorsSchemas.advisorIdParamsSchema),
  validate(AdvisorsSchemas.updateAdvisorProfileSchema),
  AdvisorsController.UpdateProfile,
)

advisorsRouter.get(
  '/:advisorId/students',
  canAccessAdvisors,
  validateParams(AdvisorsSchemas.advisorIdParamsSchema),
  validateQuery(AdvisorsSchemas.listAdvisorStudentsQuerySchema),
  AdvisorsController.ListStudentsForAdvisor,
)

advisorsRouter.get(
  '/:advisorId/follow-ups',
  canAccessAdvisors,
  validateParams(AdvisorsSchemas.advisorIdParamsSchema),
  validateQuery(FollowUpsSchemas.listFollowUpsQuerySchema),
  AdvisorsController.ListFollowUpsForAdvisor,
)
