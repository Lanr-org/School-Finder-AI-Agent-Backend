import express, { type Router } from 'express'
import { SettingsController } from './settings.controller.js'
import { SettingsSchemas } from './settings.schemas.js'
import { RecommendationsController } from '../recommendations/recommendations.controller.js'
import { RecommendationsSchemas } from '../recommendations/recommendations.schemas.js'
import { validate, validateParams } from '../../middleware/validate.js'
import { AuthenticateMiddleware } from '../../middleware/authenticate.js'
import { requireRole } from '../../middleware/authorize.js'

export const settingsRouter: Router = express.Router()

// All settings routes require authentication — middleware applied first on every route.
settingsRouter.use(AuthenticateMiddleware)

// Every role reads settings — these lists populate dropdowns across school,
// program, and student forms, not just admin screens.
const canReadSettings = requireRole('ADMIN', 'ADVISOR', 'OPERATIONS')

// Only ADMIN manages setting values. Groups themselves are fixed/seeded, not
// creatable or deletable via the API.
const canManageSettings = requireRole('ADMIN')

settingsRouter.get('/', canReadSettings, SettingsController.ListGroups)

// Registered before the /:groupKey catch-all below — Express matches routes
// in order, so /:groupKey would otherwise swallow this path as a group key.
settingsRouter.get(
  '/recommendation-weights',
  canReadSettings,
  RecommendationsController.GetWeights,
)

settingsRouter.put(
  '/recommendation-weights',
  canManageSettings,
  validate(RecommendationsSchemas.updateWeightsSchema),
  RecommendationsController.UpdateWeights,
)

settingsRouter.get(
  '/:groupKey',
  canReadSettings,
  validateParams(SettingsSchemas.groupKeyParamsSchema),
  SettingsController.GetGroup,
)

settingsRouter.post(
  '/:groupKey/values',
  canManageSettings,
  validateParams(SettingsSchemas.groupKeyParamsSchema),
  validate(SettingsSchemas.createValueSchema),
  SettingsController.CreateValue,
)

settingsRouter.patch(
  '/:groupKey/values/:valueId',
  canManageSettings,
  validateParams(SettingsSchemas.valueIdParamsSchema),
  validate(SettingsSchemas.updateValueSchema),
  SettingsController.UpdateValue,
)

settingsRouter.delete(
  '/:groupKey/values/:valueId',
  canManageSettings,
  validateParams(SettingsSchemas.valueIdParamsSchema),
  SettingsController.DeleteValue,
)
