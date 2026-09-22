import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi'
import { z } from 'zod'

extendZodWithOpenApi(z)

export class NotesSchemas {
  static noteIdParamsSchema = z.object({
    studentId: z
      .string()
      .trim()
      .regex(/^STU-\d{4}$/, 'Must be a valid student ID (e.g. STU-1048)'),
    noteId: z
      .string()
      .trim()
      .regex(/^NOTE-\d{4}$/, 'Must be a valid note ID (e.g. NOTE-1048)'),
  })

  static createNoteSchema = z.object({
    body: z.string().trim().min(1).max(4000),
  })

  static updateNoteSchema = z.object({
    body: z.string().trim().min(1).max(4000),
  })

  static listNotesQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
}
