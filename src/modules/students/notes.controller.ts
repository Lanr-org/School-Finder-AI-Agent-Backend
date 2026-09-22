import type { NextFunction, Request, Response } from 'express'
import { successResponse } from '../../http/response.js'
import type { AccessTokenClaims } from '../auth/auth.types.js'
import { NotesService } from './notes.service.js'
import type {
  CreateNoteDTO,
  ListNotesQueryDTO,
  UpdateNoteDTO,
} from './notes.types.js'

export class NotesController {
  // ── GET /students/:studentId/notes ──────────────────────────────────────
  static ListForStudent = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const studentId = req.params['studentId'] as string
      const result = await NotesService.ListForStudent(
        studentId,
        req.query as unknown as ListNotesQueryDTO,
        req.auth as AccessTokenClaims,
      )
      res
        .status(200)
        .json(
          successResponse(true, 'Notes retrieved successfully', result, {
            requestId: req.id,
          }),
        )
    } catch (error) {
      next(error)
    }
  }

  // ── POST /students/:studentId/notes ─────────────────────────────────────
  static Create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const studentId = req.params['studentId'] as string
      const result = await NotesService.CreateForStudent(
        studentId,
        req.body as CreateNoteDTO,
        req.auth as AccessTokenClaims,
      )
      res
        .status(201)
        .json(
          successResponse(true, 'Note created successfully', result, {
            requestId: req.id,
          }),
        )
    } catch (error) {
      next(error)
    }
  }

  // ── PATCH /students/:studentId/notes/:noteId ────────────────────────────
  static Update = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const studentId = req.params['studentId'] as string
      const noteId = req.params['noteId'] as string
      const result = await NotesService.Update(
        studentId,
        noteId,
        req.body as UpdateNoteDTO,
        req.auth as AccessTokenClaims,
      )
      res
        .status(200)
        .json(
          successResponse(true, 'Note updated successfully', result, {
            requestId: req.id,
          }),
        )
    } catch (error) {
      next(error)
    }
  }

  // ── DELETE /students/:studentId/notes/:noteId ───────────────────────────
  static Delete = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const studentId = req.params['studentId'] as string
      const noteId = req.params['noteId'] as string
      await NotesService.Delete(
        studentId,
        noteId,
        req.auth as AccessTokenClaims,
      )
      res
        .status(200)
        .json(
          successResponse(true, 'Note deleted successfully', undefined, {
            requestId: req.id,
          }),
        )
    } catch (error) {
      next(error)
    }
  }
}
