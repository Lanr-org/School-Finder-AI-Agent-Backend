import type { NextFunction, Request, Response } from 'express'
import { SchoolsService } from './schools.service'
import { ProgramsService } from '../programs/programs.service'
import { successResponse } from '../../http/response'
import type { CreateSchoolDTO, ListSchoolsQueryDTO, UpdateSchoolDTO } from './schools.types'
import type { ListProgramsQueryDTO } from '../programs/programs.types'

export class SchoolsController {
  // ── POST /schools ─────────────────────────────────────────────────────────
  static CreateSchool = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await SchoolsService.CreateSchool(req.body as CreateSchoolDTO)
      res.status(201).json(
        successResponse(true, 'School created successfully', result, {
          requestId: req.id,
        }),
      )
    } catch (error) {
      next(error)
    }
  }

  // ── GET /schools ──────────────────────────────────────────────────────────
  static ListSchools = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await SchoolsService.ListSchools(
        req.query as unknown as ListSchoolsQueryDTO,
      )
      res.status(200).json(
        successResponse(true, 'Schools retrieved successfully', result, {
          requestId: req.id,
        }),
      )
    } catch (error) {
      next(error)
    }
  }

  // ── GET /schools/:schoolId ────────────────────────────────────────────────
  static GetSchool = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const schoolId = req.params['schoolId'] as string
      const result = await SchoolsService.GetSchool(schoolId)
      res.status(200).json(
        successResponse(true, 'School retrieved successfully', result, {
          requestId: req.id,
        }),
      )
    } catch (error) {
      next(error)
    }
  }

  // ── PATCH /schools/:schoolId ──────────────────────────────────────────────
  static UpdateSchool = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const schoolId = req.params['schoolId'] as string
      const result = await SchoolsService.UpdateSchool(
        schoolId,
        req.body as UpdateSchoolDTO,
      )
      res.status(200).json(
        successResponse(true, 'School updated successfully', result, {
          requestId: req.id,
        }),
      )
    } catch (error) {
      next(error)
    }
  }

  // ── GET /schools/:schoolId/programs ───────────────────────────────────────
  static ListSchoolPrograms = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const schoolId = req.params['schoolId'] as string
      const result = await ProgramsService.ListProgramsForSchool(
        schoolId,
        req.query as unknown as Omit<ListProgramsQueryDTO, 'schoolId'>,
      )
      res.status(200).json(
        successResponse(true, 'School programs retrieved successfully', result, {
          requestId: req.id,
        }),
      )
    } catch (error) {
      next(error)
    }
  }

  // ── DELETE /schools/:schoolId ─────────────────────────────────────────────
  static DeleteSchool = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const schoolId = req.params['schoolId'] as string
      const result = await SchoolsService.DeleteSchool(schoolId)
      res.status(200).json(
        successResponse(true, 'School deactivated successfully', result, {
          requestId: req.id,
        }),
      )
    } catch (error) {
      next(error)
    }
  }
}
