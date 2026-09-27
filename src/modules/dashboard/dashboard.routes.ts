import express, { type Router } from 'express'
import { DashboardController } from './dashboard.controller.js'
import { AuthenticateMiddleware } from '../../middleware/authenticate.js'
import { requireRole } from '../../middleware/authorize.js'

export const dashboardRouter: Router = express.Router()

dashboardRouter.use(AuthenticateMiddleware)

// Every staff role has a dashboard; what it contains is scoped by role in
// DashboardService (ADVISOR → own students, OPERATIONS → counts only).
dashboardRouter.get(
  '/summary',
  requireRole('ADMIN', 'ADVISOR', 'OPERATIONS'),
  DashboardController.Summary,
)
