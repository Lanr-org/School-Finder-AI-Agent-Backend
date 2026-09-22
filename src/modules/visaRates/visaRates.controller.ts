import type { NextFunction, Request, Response } from 'express'
import { successResponse } from '../../http/response.js'
import type { AccessTokenClaims } from '../auth/auth.types.js'
import { VisaRatesService } from './visaRates.service.js'
import type {
  CreateVisaRateDTO,
  ListVisaRatesQueryDTO,
  UpdateVisaRateDTO,
} from './visaRates.types.js'

export class VisaRatesController {
  // ── GET /visa-success-rates ──────────────────────────────────────────────
  static List = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await VisaRatesService.List(
        req.query as unknown as ListVisaRatesQueryDTO,
      )
      res
        .status(200)
        .json(
          successResponse(
            true,
            'Visa success rates retrieved successfully',
            result,
            { requestId: req.id },
          ),
        )
    } catch (error) {
      next(error)
    }
  }

  // ── POST /visa-success-rates ─────────────────────────────────────────────
  static Create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.auth as AccessTokenClaims
      const result = await VisaRatesService.Create(
        req.body as CreateVisaRateDTO,
        auth.sub,
      )
      res
        .status(201)
        .json(
          successResponse(
            true,
            'Visa success rate created successfully',
            result,
            { requestId: req.id },
          ),
        )
    } catch (error) {
      next(error)
    }
  }

  // ── PATCH /visa-success-rates/:rateId ────────────────────────────────────
  static Update = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rateId = req.params['rateId'] as string
      const result = await VisaRatesService.Update(
        rateId,
        req.body as UpdateVisaRateDTO,
      )
      res
        .status(200)
        .json(
          successResponse(
            true,
            'Visa success rate updated successfully',
            result,
            { requestId: req.id },
          ),
        )
    } catch (error) {
      next(error)
    }
  }

  // ── DELETE /visa-success-rates/:rateId ───────────────────────────────────
  static Delete = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rateId = req.params['rateId'] as string
      await VisaRatesService.Delete(rateId)
      res
        .status(200)
        .json(
          successResponse(
            true,
            'Visa success rate deleted successfully',
            undefined,
            { requestId: req.id },
          ),
        )
    } catch (error) {
      next(error)
    }
  }
}
