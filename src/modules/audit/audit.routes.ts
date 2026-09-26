import express, { type Router } from 'express'
import { AuditController } from './audit.controller.js'
import { AuditSchemas } from './audit.schemas.js'
import { validateQuery } from '../../middleware/validate.js'
import { AuthenticateMiddleware } from '../../middleware/authenticate.js'
import { requireRole } from '../../middleware/authorize.js'

export const auditLogsRouter: Router = express.Router()

auditLogsRouter.use(AuthenticateMiddleware)

// Read-only and ADMIN-only. There is deliberately no write route: audit rows
// are only ever inserted by the services that make the audited change.
auditLogsRouter.get(
  '/',
  requireRole('ADMIN'),
  validateQuery(AuditSchemas.listAuditLogsQuerySchema),
  AuditController.List,
)
