import express, { type Router } from 'express'
import { SettingsController } from './settings.controller.js'
import { SettingsSchemas } from './settings.schemas.js'
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
