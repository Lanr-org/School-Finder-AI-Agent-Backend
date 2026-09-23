import type { NextFunction, Request, Response } from 'express'
import { successResponse } from '../../http/response.js'
import type { AccessTokenClaims } from '../auth/auth.types.js'
import { RecommendationsService } from './recommendations.service.js'
import type {
  CreateShortlistDTO,
  GenerateRunDTO,
  ListRecommendationsQueryDTO,
  UpdateWeightsDTO,
} from './recommendations.types.js'

export class RecommendationsController {
  // ── GET /settings/recommendation-weights ────────────────────────────────
  static GetWeights = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const result = await RecommendationsService.GetWeights()
      res.status(200).json(
        successResponse(
          true,
          'Recommendation weights retrieved successfully',
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

  // ── PUT /settings/recommendation-weights ────────────────────────────────
  static UpdateWeights = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const result = await RecommendationsService.UpdateWeights(
        req.body as UpdateWeightsDTO,
      )
      res.status(200).json(
        successResponse(
          true,
          'Recommendation weights updated successfully',
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

  // ── POST /students/:studentId/recommendation-runs ───────────────────────
  static GenerateRun = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const studentId = req.params['studentId'] as string
      const auth = req.auth as AccessTokenClaims
      const result = await RecommendationsService.GenerateRun(
        studentId,
        req.body as GenerateRunDTO,
        auth,
      )
      res.status(201).json(
        successResponse(
          true,
          'Recommendation run generated successfully',
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

  // ── GET /students/:studentId/recommendations ─────────────────────────────
  static GetLatestForStudent = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const studentId = req.params['studentId'] as string
      const auth = req.auth as AccessTokenClaims
      const result = await RecommendationsService.GetLatestForStudent(
        studentId,
        auth,
      )
      res.status(200).json(
        successResponse(
          true,
          'Recommendations retrieved successfully',
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

  // ── GET /recommendation-runs/:runId ──────────────────────────────────────
  static GetRun = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const runId = req.params['runId'] as string
      const auth = req.auth as AccessTokenClaims
      const result = await RecommendationsService.GetRun(runId, auth)
      res.status(200).json(
        successResponse(
          true,
          'Recommendation run retrieved successfully',
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

  // ── POST /students/:studentId/shortlists ─────────────────────────────────
  static CreateShortlist = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const studentId = req.params['studentId'] as string
      const auth = req.auth as AccessTokenClaims
      const result = await RecommendationsService.CreateShortlist(
        studentId,
        req.body as CreateShortlistDTO,
        auth,
      )
      res.status(201).json(
        successResponse(true, 'Program shortlisted successfully', result, {
          requestId: req.id,
        }),
      )
    } catch (error) {
      next(error)
    }
  }

  // ── DELETE /students/:studentId/shortlists/:programId ───────────────────
  static DeleteShortlist = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const studentId = req.params['studentId'] as string
      const programId = req.params['programId'] as string
      const auth = req.auth as AccessTokenClaims
      await RecommendationsService.DeleteShortlist(studentId, programId, auth)
      res.status(200).json(
        successResponse(
          true,
          'Program removed from shortlist successfully',
          undefined,
          {
            requestId: req.id,
          },
        ),
      )
    } catch (error) {
      next(error)
    }
  }

  // ── GET /recommendations ─────────────────────────────────────────────────
  static ListLatest = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const auth = req.auth as AccessTokenClaims
      const result = await RecommendationsService.ListLatest(
        req.query as unknown as ListRecommendationsQueryDTO,
        auth,
      )
      res.status(200).json(
        successResponse(
          true,
          'Recommendations retrieved successfully',
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
