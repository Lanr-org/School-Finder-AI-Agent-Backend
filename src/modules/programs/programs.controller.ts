import type { NextFunction, Request, Response } from 'express'
import { ProgramsService } from './programs.service'
import { successResponse } from '../../http/response'
import type { AccessTokenClaims } from '../auth/auth.types.js'
import type {
  CreateProgramDTO,
  ListProgramsQueryDTO,
  ListReportsQueryDTO,
  UpdateProgramDTO,
} from './programs.types'

export class ProgramsController {
  // ── POST /programs ───────────────────────────────────────────────────────
  static CreateProgram = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await ProgramsService.CreateProgram(req.body as CreateProgramDTO)
      res.status(201).json(
        successResponse(true, 'Program created successfully', result, {
          requestId: req.id,
        }),
      )
    } catch (error) {
      next(error)
    }
  }

  // ── GET /programs ────────────────────────────────────────────────────────
  static ListPrograms = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await ProgramsService.ListPrograms(
        req.query as unknown as ListProgramsQueryDTO,
      )
      res.status(200).json(
        successResponse(true, 'Programs retrieved successfully', result, {
          requestId: req.id,
        }),
      )
    } catch (error) {
      next(error)
    }
  }

  // ── GET /programs/:programId ────────────────────────────────────────────
  static GetProgram = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const programId = req.params['programId'] as string
      const result = await ProgramsService.GetProgram(programId)
      res.status(200).json(
        successResponse(true, 'Program retrieved successfully', result, {
          requestId: req.id,
        }),
      )
    } catch (error) {
      next(error)
    }
  }

  // ── PATCH /programs/:programId ──────────────────────────────────────────
  static UpdateProgram = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const programId = req.params['programId'] as string
      const result = await ProgramsService.UpdateProgram(
        programId,
        req.body as UpdateProgramDTO,
      )
      res.status(200).json(
        successResponse(true, 'Program updated successfully', result, {
          requestId: req.id,
        }),
      )
    } catch (error) {
      next(error)
    }
  }

  // ── POST /programs/:programId/verify ────────────────────────────────────
  static VerifyProgram = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.auth as AccessTokenClaims
      const programId = req.params['programId'] as string
      const result = await ProgramsService.VerifyProgram(programId, auth.sub)
      res.status(200).json(
        successResponse(true, 'Program marked verified', result, {
          requestId: req.id,
        }),
      )
    } catch (error) {
      next(error)
    }
  }

  // ── POST /programs/:programId/reports ───────────────────────────────────
  static ReportOutdated = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.auth as AccessTokenClaims
      const programId = req.params['programId'] as string
      const { message } = req.body as { message: string }
      const result = await ProgramsService.ReportOutdated(programId, auth.sub, message)
      res.status(201).json(
        successResponse(true, 'Report sent', result, {
          requestId: req.id,
        }),
      )
    } catch (error) {
      next(error)
    }
  }

  // ── GET /program-reports ─────────────────────────────────────────────────
  static ListReports = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await ProgramsService.ListReports(req.query as unknown as ListReportsQueryDTO)
      res.status(200).json(
        successResponse(true, 'Reports retrieved successfully', result, {
          requestId: req.id,
        }),
      )
    } catch (error) {
      next(error)
    }
  }

  // ── POST /program-reports/:reportId/resolve ──────────────────────────────
  static ResolveReport = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.auth as AccessTokenClaims
      const reportId = req.params['reportId'] as string
      const result = await ProgramsService.ResolveReport(reportId, auth.sub)
      res.status(200).json(
        successResponse(true, 'Report resolved', result, {
          requestId: req.id,
        }),
      )
    } catch (error) {
      next(error)
    }
  }
}
