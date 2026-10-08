import type { NextFunction, Request, Response } from 'express'
import { successResponse } from '../../http/response.js'
import type { AccessTokenClaims } from '../auth/auth.types.js'
import { ApplicationsService } from './applications.service.js'
import type {
  CreateApplicationDTO,
  ListApplicationsQueryDTO,
  ListStudentApplicationsQueryDTO,
  UpdateApplicationDTO,
  UpdateApplicationStatusDTO,
} from './applications.types.js'

export class ApplicationsController {
  // ── GET /students/:studentId/applications ───────────────────────────────
  static ListForStudent = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const studentId = req.params['studentId'] as string
      const result = await ApplicationsService.ListForStudent(
        studentId,
        req.query as unknown as ListStudentApplicationsQueryDTO,
        req.auth as AccessTokenClaims,
      )
      res.status(200).json(
        successResponse(true, 'Applications retrieved successfully', result, {
          requestId: req.id,
        }),
      )
    } catch (error) {
      next(error)
    }
  }

  // ── POST /students/:studentId/applications ──────────────────────────────
  static Create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const studentId = req.params['studentId'] as string
      const result = await ApplicationsService.CreateForStudent(
        studentId,
        req.body as CreateApplicationDTO,
        req.auth as AccessTokenClaims,
      )
      res.status(201).json(
        successResponse(true, 'Application created successfully', result, {
          requestId: req.id,
        }),
      )
    } catch (error) {
      next(error)
    }
  }

  // ── GET /applications ────────────────────────────────────────────────────
  static List = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await ApplicationsService.List(
        req.query as unknown as ListApplicationsQueryDTO,
        req.auth as AccessTokenClaims,
      )
      res.status(200).json(
        successResponse(true, 'Applications retrieved successfully', result, {
          requestId: req.id,
        }),
      )
    } catch (error) {
      next(error)
    }
  }

  // ── GET /applications/:applicationId ────────────────────────────────────
  static Get = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const applicationId = req.params['applicationId'] as string
      const result = await ApplicationsService.Get(
        applicationId,
        req.auth as AccessTokenClaims,
      )
      res.status(200).json(
        successResponse(true, 'Application retrieved successfully', result, {
          requestId: req.id,
        }),
      )
    } catch (error) {
      next(error)
    }
  }

  // ── PATCH /applications/:applicationId ──────────────────────────────────
  static Update = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const applicationId = req.params['applicationId'] as string
      const result = await ApplicationsService.Update(
        applicationId,
        req.body as UpdateApplicationDTO,
        req.auth as AccessTokenClaims,
      )
      res.status(200).json(
        successResponse(true, 'Application updated successfully', result, {
          requestId: req.id,
        }),
      )
    } catch (error) {
      next(error)
    }
  }

  // ── PATCH /applications/:applicationId/status ───────────────────────────
  static UpdateStatus = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const applicationId = req.params['applicationId'] as string
      const result = await ApplicationsService.UpdateStatus(
        applicationId,
        req.body as UpdateApplicationStatusDTO,
        req.auth as AccessTokenClaims,
      )
      res.status(200).json(
        successResponse(
          true,
          'Application status updated successfully',
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
