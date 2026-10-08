import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi'
import { z } from 'zod'
import { NotesSchemas } from './notes.schemas'
import type { StudentsSchemas } from './students.schemas'
import {
  emptySuccessResponseSchema,
  errorContent,
  paginationSchema,
  STUDENT_SCOPE_ROLE_NOTE as ROLE_NOTE,
  successEnvelope,
} from '../../docs/registry'

export const registerNotesDocs = (
  registry: OpenAPIRegistry,
  {
    registeredStudentIdParamsSchema,
  }: {
    registeredStudentIdParamsSchema: typeof StudentsSchemas.studentIdParamsSchema
  },
) => {
  // Mirrors toNoteResponse (notes.service.ts).
  const noteDataSchema = z.object({
    publicId: z.string(),
    body: z.string(),
    createdAt: z.date(),
    updatedAt: z.date(),
  })

  const noteResponseSchema = registry.register(
    'NoteResponse',
    successEnvelope(noteDataSchema),
  )
  const noteListResponseSchema = registry.register(
    'NoteListResponse',
    successEnvelope(
      z.object({
        notes: z.array(noteDataSchema),
        pagination: paginationSchema,
      }),
    ),
  )

  const registeredNoteIdParamsSchema = registry.register(
    'NoteIdParams',
    NotesSchemas.noteIdParamsSchema,
  )
  const registeredCreateNoteSchema = registry.register(
    'CreateNoteRequest',
    NotesSchemas.createNoteSchema,
  )
  const registeredUpdateNoteSchema = registry.register(
    'UpdateNoteRequest',
    NotesSchemas.updateNoteSchema,
  )
  const registeredListNotesQuerySchema = registry.register(
    'ListNotesQuery',
    NotesSchemas.listNotesQuerySchema,
  )

  const unauthorized = errorContent('Bearer token is missing or invalid.')
  const forbiddenStudent = errorContent(
    'Role not allowed, or the student is not assigned to this advisor.',
  )

  registry.registerPath({
    method: 'get',
    path: '/api/v1/students/{studentId}/notes',
    tags: ['Notes'],
    security: [{ bearerAuth: [] }],
    summary: "List a student's internal notes",
    description: `Requires a bearer access token. ${ROLE_NOTE} Notes are internal (never shown to the student). Deleted notes are excluded.`,
    request: {
      params: registeredStudentIdParamsSchema,
      query: registeredListNotesQuerySchema,
    },
    responses: {
      200: {
        description: 'Notes retrieved successfully.',
        content: { 'application/json': { schema: noteListResponseSchema } },
      },
      400: errorContent('Path or query parameter validation failed.'),
      401: unauthorized,
      403: forbiddenStudent,
      404: errorContent('Student not found.'),
    },
  })

  registry.registerPath({
    method: 'post',
    path: '/api/v1/students/{studentId}/notes',
    tags: ['Notes'],
    security: [{ bearerAuth: [] }],
    summary: 'Add a note to a student',
    description: `Requires a bearer access token. ${ROLE_NOTE} The author is the authenticated user.`,
    request: {
      params: registeredStudentIdParamsSchema,
      body: {
        required: true,
        content: { 'application/json': { schema: registeredCreateNoteSchema } },
      },
    },
    responses: {
      201: {
        description: 'Note created successfully.',
        content: { 'application/json': { schema: noteResponseSchema } },
      },
      400: errorContent('Request validation failed.'),
      401: unauthorized,
      403: forbiddenStudent,
      404: errorContent('Student not found.'),
    },
  })

  registry.registerPath({
    method: 'patch',
    path: '/api/v1/students/{studentId}/notes/{noteId}',
    tags: ['Notes'],
    security: [{ bearerAuth: [] }],
    summary: 'Edit a note',
    description: `Requires a bearer access token. ${ROLE_NOTE}`,
    request: {
      params: registeredNoteIdParamsSchema,
      body: {
        required: true,
        content: { 'application/json': { schema: registeredUpdateNoteSchema } },
      },
    },
    responses: {
      200: {
        description: 'Note updated successfully.',
        content: { 'application/json': { schema: noteResponseSchema } },
      },
      400: errorContent('Request validation failed.'),
      401: unauthorized,
      403: forbiddenStudent,
      404: errorContent('Student or note not found.'),
    },
  })

  registry.registerPath({
    method: 'delete',
    path: '/api/v1/students/{studentId}/notes/{noteId}',
    tags: ['Notes'],
    security: [{ bearerAuth: [] }],
    summary: 'Delete a note',
    description: `Requires a bearer access token. ${ROLE_NOTE} Soft delete: the note disappears from lists but is kept in the database.`,
    request: { params: registeredNoteIdParamsSchema },
    responses: {
      200: {
        description: 'Note deleted successfully.',
        content: {
          'application/json': { schema: emptySuccessResponseSchema },
        },
      },
      400: errorContent('Path parameter validation failed.'),
      401: unauthorized,
      403: forbiddenStudent,
      404: errorContent('Student or note not found.'),
    },
  })
}
