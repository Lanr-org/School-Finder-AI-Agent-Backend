import { createError } from '../../common/errors/AppError.js'
import { assertStudentOwnership } from '../../common/security/ownership.js'
import {
  createPublicNoteId,
  withUniquePublicId,
} from '../../common/security/publicId.js'
import type { AccessTokenClaims } from '../auth/auth.types.js'
import type { StudentNote } from '../../generated/prisma/index.js'
import { StudentsService } from './students.service.js'
import { NotesRepo } from './notes.repository.js'
import type {
  CreateNoteDTO,
  ListNotesQueryDTO,
  UpdateNoteDTO,
} from './notes.types.js'

const toNoteResponse = (note: StudentNote) => ({
  publicId: note.public_id,
  body: note.body,
  createdAt: note.created_at,
  updatedAt: note.updated_at,
})

export class NotesService {
  private static getOwnedStudent = async (
    studentPublicId: string,
    auth: AccessTokenClaims,
  ) => {
    const student = await StudentsService.getStudentByPublicId(studentPublicId)
    assertStudentOwnership(student.assigned_advisor_id, auth)
    return student
  }

  private static getOwnedNote = async (
    studentPublicId: string,
    noteId: string,
    auth: AccessTokenClaims,
  ) => {
    const student = await NotesService.getOwnedStudent(studentPublicId, auth)
    const note = await NotesRepo.findByPublicId(student.id, noteId)
    if (!note) {
      throw createError('Note not found', 404, {}, 'NOT_FOUND')
    }
    return note
  }

  // ── GET /students/:studentId/notes ──────────────────────────────────────
  static ListForStudent = async (
    studentPublicId: string,
    query: ListNotesQueryDTO,
    auth: AccessTokenClaims,
  ) => {
    const student = await NotesService.getOwnedStudent(studentPublicId, auth)
    const { notes, total } = await NotesRepo.listForStudent(student.id, query)

    return {
      notes: notes.map(toNoteResponse),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    }
  }

  // ── POST /students/:studentId/notes ─────────────────────────────────────
  static CreateForStudent = async (
    studentPublicId: string,
    dto: CreateNoteDTO,
    auth: AccessTokenClaims,
  ) => {
    const student = await NotesService.getOwnedStudent(studentPublicId, auth)

    const note = await withUniquePublicId(createPublicNoteId, (publicId) =>
      NotesRepo.createNote({
        publicId,
        studentId: student.id,
        advisorId: auth.sub,
        body: dto.body,
      }),
    )

    return toNoteResponse(note)
  }

  // ── PATCH /students/:studentId/notes/:noteId ────────────────────────────
  static Update = async (
    studentPublicId: string,
    noteId: string,
    dto: UpdateNoteDTO,
    auth: AccessTokenClaims,
  ) => {
    const note = await NotesService.getOwnedNote(studentPublicId, noteId, auth)
    const updated = await NotesRepo.updateNote(note.id, dto.body)
    return toNoteResponse(updated)
  }

  // ── DELETE /students/:studentId/notes/:noteId ───────────────────────────
  static Delete = async (
    studentPublicId: string,
    noteId: string,
    auth: AccessTokenClaims,
  ) => {
    const note = await NotesService.getOwnedNote(studentPublicId, noteId, auth)
    await NotesRepo.softDeleteNote(note.id)
  }
}
