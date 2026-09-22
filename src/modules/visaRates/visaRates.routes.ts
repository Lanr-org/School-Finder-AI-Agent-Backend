import express, { type Router } from 'express'
import { VisaRatesController } from './visaRates.controller.js'
import { VisaRatesSchemas } from './visaRates.schemas.js'
import {
  validate,
  validateParams,
  validateQuery,
} from '../../middleware/validate.js'
import { AuthenticateMiddleware } from '../../middleware/authenticate.js'
import { requireRole } from '../../middleware/authorize.js'

export const visaRatesRouter: Router = express.Router()

// All visa-success-rates routes require authentication.
visaRatesRouter.use(AuthenticateMiddleware)

// Only ADMIN and OPERATIONS create, update, or delete rates. Reading is open
// to any authenticated role (ADVISOR included), matching schools.routes.ts.
const canManageVisaRates = requireRole('ADMIN', 'OPERATIONS')

visaRatesRouter.get(
  '/',
  validateQuery(VisaRatesSchemas.listVisaRatesQuerySchema),
  VisaRatesController.List,
)

visaRatesRouter.post(
  '/',
  canManageVisaRates,
  validate(VisaRatesSchemas.createVisaRateSchema),
  VisaRatesController.Create,
)

visaRatesRouter.patch(
  '/:rateId',
  canManageVisaRates,
  validateParams(VisaRatesSchemas.rateIdParamsSchema),
  validate(VisaRatesSchemas.updateVisaRateSchema),
  VisaRatesController.Update,
)

visaRatesRouter.delete(
  '/:rateId',
  canManageVisaRates,
  validateParams(VisaRatesSchemas.rateIdParamsSchema),
  VisaRatesController.Delete,
)
