import type { NextFunction, Request, Response } from 'express'
import { StudentsService } from './students.service.js'
import { successResponse } from '../../http/response.js'
import type { AccessTokenClaims } from '../auth/auth.types.js'
import type { AssignAdvisorToStudentDTO, ListStudentsQueryDTO } from './students.types.js'

export class StudentsController {
  // ── GET /students ────────────────────────────────────────────────────────
  static ListStudents = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await StudentsService.ListStudents(req.query as unknown as ListStudentsQueryDTO, req.auth as AccessTokenClaims)
      res.status(200).json(
        successResponse(true, 'Students retrieved successfully', result, {
          requestId: req.id,
        }),
      )
    } catch (error) {
      next(error)
    }
  }

  // ── GET /students/:studentId ────────────────────────────────────────────
  static GetStudent = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const studentId = req.params['studentId'] as string
      const result = await StudentsService.GetStudent(studentId, req.auth as AccessTokenClaims)
      res.status(200).json(
        successResponse(true, 'Student retrieved successfully', result, {
          requestId: req.id,
        }),
      )
    } catch (error) {
      next(error)
    }
  }

  // ── PATCH /students/:studentId/advisor ──────────────────────────────────
  static AssignAdvisor = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const studentId = req.params['studentId'] as string
      const result = await StudentsService.AssignAdvisor(studentId, req.body as AssignAdvisorToStudentDTO)
      res.status(200).json(
        successResponse(true, 'Student advisor assignment updated successfully', result, {
          requestId: req.id,
        }),
      )
    } catch (error) {
      next(error)
    }
  }
}
