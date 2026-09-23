import express, { type Router } from 'express'
import { ProgramsController } from './programs.controller'
import { ProgramsSchemas } from './programs.schemas'
import { validate, validateParams, validateQuery } from '../../middleware/validate'
import { AuthenticateMiddleware } from '../../middleware/authenticate'
import { requireRole } from '../../middleware/authorize'

export const programsRouter: Router = express.Router()

// All programs routes require authentication — middleware applied first on every route
programsRouter.use(AuthenticateMiddleware)

// Only ADMIN and OPERATIONS may create or update program records.
const canManagePrograms = requireRole('ADMIN', 'OPERATIONS')

programsRouter.get(
  '/',
  validateQuery(ProgramsSchemas.listProgramsQuerySchema),
  ProgramsController.ListPrograms,
)

programsRouter.post(
  '/',
  canManagePrograms,
  validate(ProgramsSchemas.createProgramSchema),
  ProgramsController.CreateProgram,
)

programsRouter.get(
  '/:programId',
  validateParams(ProgramsSchemas.programIdParamsSchema),
  ProgramsController.GetProgram,
)

programsRouter.patch(
  '/:programId',
  canManagePrograms,
  validateParams(ProgramsSchemas.programIdParamsSchema),
  validate(ProgramsSchemas.updateProgramSchema),
  ProgramsController.UpdateProgram,
)
