import express, { type Router } from 'express'
import { BulletinsController } from './bulletins.controller.js'
import { BulletinsSchemas } from './bulletins.schemas.js'
import {
  validate,
  validateParams,
  validateQuery,
} from '../../middleware/validate.js'
import { AuthenticateMiddleware } from '../../middleware/authenticate.js'
import { requireRole } from '../../middleware/authorize.js'

export const bulletinsRouter: Router = express.Router()

// All bulletins routes require authentication — middleware applied first on every route.
bulletinsRouter.use(AuthenticateMiddleware)

// Only ADMIN and OPERATIONS create, update, or delete bulletins. Reading is
// open to any authenticated role (ADVISOR included), matching schools.routes.ts.
const canManageBulletins = requireRole('ADMIN', 'OPERATIONS')

bulletinsRouter.get(
  '/',
  validateQuery(BulletinsSchemas.listBulletinsQuerySchema),
  BulletinsController.List,
)

bulletinsRouter.post(
  '/',
  canManageBulletins,
  validate(BulletinsSchemas.createBulletinSchema),
  BulletinsController.Create,
)

bulletinsRouter.patch(
  '/:bulletinId',
  canManageBulletins,
  validateParams(BulletinsSchemas.bulletinIdParamsSchema),
  validate(BulletinsSchemas.updateBulletinSchema),
  BulletinsController.Update,
)

bulletinsRouter.delete(
  '/:bulletinId',
  canManageBulletins,
  validateParams(BulletinsSchemas.bulletinIdParamsSchema),
  BulletinsController.Delete,
)
