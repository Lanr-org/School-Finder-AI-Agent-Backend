import type { NextFunction, Request, Response } from 'express'
import { ProgramsService } from './programs.service'
import { successResponse } from '../../http/response'
import type { CreateProgramDTO, ListProgramsQueryDTO, UpdateProgramDTO } from './programs.types'

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
}
