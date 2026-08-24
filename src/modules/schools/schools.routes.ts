import express, { type Router } from 'express'
import { SchoolsController } from './schools.controller'
import { SchoolsSchemas } from './schools.schemas'
import { ProgramsSchemas } from '../programs/programs.schemas'
import { validate, validateParams, validateQuery } from '../../middleware/validate'
import { AuthenticateMiddleware } from '../../middleware/authenticate'
import { requireRole } from '../../middleware/authorize'

export const schoolsRouter: Router = express.Router()

// All schools routes require authentication — middleware applied first on every route
schoolsRouter.use(AuthenticateMiddleware)

// Only ADMIN and OPERATIONS may create, update, or delete school records.
const canManageSchools = requireRole('ADMIN', 'OPERATIONS')

schoolsRouter.get(
  '/',
  validateQuery(SchoolsSchemas.listSchoolsQuerySchema),
  SchoolsController.ListSchools,
)

schoolsRouter.post(
  '/',
  canManageSchools,
  validate(SchoolsSchemas.createSchoolSchema),
  SchoolsController.CreateSchool,
)

schoolsRouter.get(
  '/:schoolId',
  validateParams(SchoolsSchemas.schoolIdParamsSchema),
  SchoolsController.GetSchool,
)

schoolsRouter.patch(
  '/:schoolId',
  canManageSchools,
  validateParams(SchoolsSchemas.schoolIdParamsSchema),
  validate(SchoolsSchemas.updateSchoolSchema),
  SchoolsController.UpdateSchool,
)

schoolsRouter.get(
  '/:schoolId/programs',
  validateParams(SchoolsSchemas.schoolIdParamsSchema),
  validateQuery(ProgramsSchemas.listSchoolProgramsQuerySchema),
  SchoolsController.ListSchoolPrograms,
)

schoolsRouter.delete(
  '/:schoolId',
  canManageSchools,
  validateParams(SchoolsSchemas.schoolIdParamsSchema),
  SchoolsController.DeleteSchool,
)
