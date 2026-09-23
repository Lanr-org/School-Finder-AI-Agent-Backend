import type { NextFunction, Request, Response } from 'express'
import { successResponse } from '../../http/response.js'
import type { AccessTokenClaims } from '../auth/auth.types.js'
import { FollowUpsService } from './followUps.service.js'
import type {
  CreateFollowUpDTO,
  ListFollowUpsQueryDTO,
  UpdateFollowUpDTO,
} from './followUps.types.js'

export class FollowUpsController {
  // ── GET /students/:studentId/follow-ups ─────────────────────────────────
  static ListForStudent = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const studentId = req.params['studentId'] as string
      const result = await FollowUpsService.ListForStudent(
        studentId,
        req.query as unknown as ListFollowUpsQueryDTO,
        req.auth as AccessTokenClaims,
      )
      res
        .status(200)
        .json(
          successResponse(true, 'Follow-ups retrieved successfully', result, {
            requestId: req.id,
          }),
        )
    } catch (error) {
      next(error)
    }
  }

  // ── POST /students/:studentId/follow-ups ────────────────────────────────
  static Create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const studentId = req.params['studentId'] as string
      const result = await FollowUpsService.CreateForStudent(
        studentId,
        req.body as CreateFollowUpDTO,
        req.auth as AccessTokenClaims,
      )
      res
        .status(201)
        .json(
          successResponse(true, 'Follow-up created successfully', result, {
            requestId: req.id,
          }),
        )
    } catch (error) {
      next(error)
    }
  }

  // ── PATCH /students/:studentId/follow-ups/:followUpId ───────────────────
  static Update = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const studentId = req.params['studentId'] as string
      const followUpId = req.params['followUpId'] as string
      const result = await FollowUpsService.Update(
        studentId,
        followUpId,
        req.body as UpdateFollowUpDTO,
        req.auth as AccessTokenClaims,
      )
      res
        .status(200)
        .json(
          successResponse(true, 'Follow-up updated successfully', result, {
            requestId: req.id,
          }),
        )
    } catch (error) {
      next(error)
    }
  }

  // ── POST /students/:studentId/follow-ups/:followUpId/complete ───────────
  static Complete = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const studentId = req.params['studentId'] as string
      const followUpId = req.params['followUpId'] as string
      const result = await FollowUpsService.Complete(
        studentId,
        followUpId,
        req.auth as AccessTokenClaims,
      )
      res
        .status(200)
        .json(
          successResponse(true, 'Follow-up marked complete', result, {
            requestId: req.id,
          }),
        )
    } catch (error) {
      next(error)
    }
  }

  // ── POST /students/:studentId/follow-ups/:followUpId/cancel ─────────────
  static Cancel = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const studentId = req.params['studentId'] as string
      const followUpId = req.params['followUpId'] as string
      const result = await FollowUpsService.Cancel(
        studentId,
        followUpId,
        req.auth as AccessTokenClaims,
      )
      res
        .status(200)
        .json(
          successResponse(true, 'Follow-up canceled', result, {
            requestId: req.id,
          }),
        )
    } catch (error) {
      next(error)
    }
  }
}
