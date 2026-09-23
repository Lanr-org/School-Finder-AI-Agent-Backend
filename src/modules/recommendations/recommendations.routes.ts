import express, { type Router } from 'express'
import { RecommendationsController } from './recommendations.controller.js'
import { RecommendationsSchemas } from './recommendations.schemas.js'
import { validateParams, validateQuery } from '../../middleware/validate.js'
import { AuthenticateMiddleware } from '../../middleware/authenticate.js'
import { requireRole } from '../../middleware/authorize.js'

const canAccessRecommendations = requireRole('ADMIN', 'ADVISOR')

// Only the standalone /recommendation-runs/:runId route lives here — the
// student-scoped routes (recommendation-runs, recommendations, shortlists)
// are registered directly in students.routes.ts, following the existing
// convention that student sub-resources (notes, follow-ups) are centralized
// there rather than split into their own router files.
export const recommendationRunsRouter: Router = express.Router()

recommendationRunsRouter.use(AuthenticateMiddleware)

recommendationRunsRouter.get(
  '/:runId',
  canAccessRecommendations,
  validateParams(RecommendationsSchemas.runIdParamsSchema),
  RecommendationsController.GetRun,
)

// Cross-student list — this module's second router/prefix. Kept separate
// from recommendationRunsRouter since it's mounted at a different top-level
// path (/recommendations vs /recommendation-runs).
export const recommendationsRouter: Router = express.Router()

recommendationsRouter.use(AuthenticateMiddleware)

recommendationsRouter.get(
  '/',
  canAccessRecommendations,
  validateQuery(RecommendationsSchemas.listRecommendationsQuerySchema),
  RecommendationsController.ListLatest,
)
