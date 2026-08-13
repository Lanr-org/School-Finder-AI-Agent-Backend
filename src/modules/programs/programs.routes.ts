import express, { type Router } from 'express'
import { ProgramsController } from './programs.controller'
import { ProgramsSchemas } from './programs.schemas'
import { validate, validateParams, validateQuery } from '../../middleware/validate'
import { AuthenticateMiddleware } from '../../middleware/authenticate'

export const programsRouter: Router = express.Router()

// All programs routes require authentication — middleware applied first on every route

programsRouter.get(
  '/',
  AuthenticateMiddleware,
  validateQuery(ProgramsSchemas.listProgramsQuerySchema),
  ProgramsController.ListPrograms,
)

programsRouter.post(
  '/',
  AuthenticateMiddleware,
  validate(ProgramsSchemas.createProgramSchema),
  ProgramsController.CreateProgram,
)

programsRouter.get(
  '/:programId',
  AuthenticateMiddleware,
  validateParams(ProgramsSchemas.programIdParamsSchema),
  ProgramsController.GetProgram,
)

programsRouter.patch(
  '/:programId',
  AuthenticateMiddleware,
  validateParams(ProgramsSchemas.programIdParamsSchema),
  validate(ProgramsSchemas.updateProgramSchema),
  ProgramsController.UpdateProgram,
)
