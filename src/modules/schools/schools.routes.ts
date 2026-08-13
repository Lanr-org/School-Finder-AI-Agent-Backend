import express, { type Router } from 'express'
import { SchoolsController } from './schools.controller'
import { SchoolsSchemas } from './schools.schemas'
import { ProgramsSchemas } from '../programs/programs.schemas'
import { validate, validateParams, validateQuery } from '../../middleware/validate'
import { AuthenticateMiddleware } from '../../middleware/authenticate'

export const schoolsRouter: Router = express.Router()

// All schools routes require authentication — middleware applied first on every route

schoolsRouter.get(
  '/',
  AuthenticateMiddleware,
  validateQuery(SchoolsSchemas.listSchoolsQuerySchema),
  SchoolsController.ListSchools,
)

schoolsRouter.post(
  '/',
  AuthenticateMiddleware,
  validate(SchoolsSchemas.createSchoolSchema),
  SchoolsController.CreateSchool,
)

schoolsRouter.get(
  '/:schoolId',
  AuthenticateMiddleware,
  validateParams(SchoolsSchemas.schoolIdParamsSchema),
  SchoolsController.GetSchool,
)

schoolsRouter.patch(
  '/:schoolId',
  AuthenticateMiddleware,
  validateParams(SchoolsSchemas.schoolIdParamsSchema),
  validate(SchoolsSchemas.updateSchoolSchema),
  SchoolsController.UpdateSchool,
)

schoolsRouter.get(
  '/:schoolId/programs',
  AuthenticateMiddleware,
  validateParams(SchoolsSchemas.schoolIdParamsSchema),
  validateQuery(ProgramsSchemas.listSchoolProgramsQuerySchema),
  SchoolsController.ListSchoolPrograms,
)

schoolsRouter.delete(
  '/:schoolId',
  AuthenticateMiddleware,
  validateParams(SchoolsSchemas.schoolIdParamsSchema),
  SchoolsController.DeleteSchool,
)
