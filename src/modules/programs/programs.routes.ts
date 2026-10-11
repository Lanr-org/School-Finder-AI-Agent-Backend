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

// Reads a course page and returns a draft with quotes; saves nothing.
programsRouter.post(
  '/extract',
  canManagePrograms,
  validate(ProgramsSchemas.extractProgramSchema),
  ProgramsController.ExtractProgram,
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

programsRouter.post(
  '/:programId/verify',
  canManagePrograms,
  validateParams(ProgramsSchemas.programIdParamsSchema),
  ProgramsController.VerifyProgram,
)

programsRouter.post(
  '/:programId/source-check',
  canManagePrograms,
  validateParams(ProgramsSchemas.programIdParamsSchema),
  ProgramsController.CheckSource,
)

// Any signed-in staff member, advisors included: they are the ones who notice stale data.
programsRouter.post(
  '/:programId/reports',
  validateParams(ProgramsSchemas.programIdParamsSchema),
  validate(ProgramsSchemas.createReportSchema),
  ProgramsController.ReportOutdated,
)

// ── /program-reports ─────────────────────────────────────────────────────────
export const programReportsRouter: Router = express.Router()

programReportsRouter.use(AuthenticateMiddleware, canManagePrograms)

programReportsRouter.get(
  '/',
  validateQuery(ProgramsSchemas.listReportsQuerySchema),
  ProgramsController.ListReports,
)

programReportsRouter.post(
  '/:reportId/resolve',
  validateParams(ProgramsSchemas.reportIdParamsSchema),
  ProgramsController.ResolveReport,
)
