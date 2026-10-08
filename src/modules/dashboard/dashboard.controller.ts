import type { NextFunction, Request, Response } from 'express'
import { successResponse } from '../../http/response.js'
import type { AccessTokenClaims } from '../auth/auth.types.js'
import { DashboardService } from './dashboard.service.js'

export class DashboardController {
  // ── GET /dashboard/summary ──────────────────────────────────────────────
  static Summary = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await DashboardService.Summary(
        req.auth as AccessTokenClaims,
      )
      res.status(200).json(
        successResponse(
          true,
          'Dashboard summary retrieved successfully',
          result,
          {
            requestId: req.id,
          },
        ),
      )
    } catch (error) {
      next(error)
    }
  }
}
