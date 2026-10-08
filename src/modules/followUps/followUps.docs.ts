import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi'
import { z } from 'zod'
import { FollowUpsSchemas } from './followUps.schemas'
import type { StudentsSchemas } from '../students/students.schemas'
import {
  errorContent,
  paginationSchema,
  STUDENT_SCOPE_ROLE_NOTE as ROLE_NOTE,
  successEnvelope,
} from '../../docs/registry'

// Mirrors toFollowUpResponse (followUps.service.ts). OVERDUE is derived at
// read time from a PENDING follow-up whose dueAt has passed; it's never stored.
// studentId is only present on advisor-wide lists. Also used by advisors.docs.ts.
export const followUpDataSchema = z.object({
  publicId: z.string(),
  studentId: z.string().optional(),
  dueAt: z.date(),
  priority: z.enum(['NORMAL', 'HIGH', 'URGENT']),
  status: z.enum(['PENDING', 'COMPLETED', 'CANCELED', 'OVERDUE']),
  description: z.string(),
  completedAt: z.date().nullable(),
  canceledAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export const registerFollowUpsDocs = (
  registry: OpenAPIRegistry,
  {
    registeredStudentIdParamsSchema,
  }: {
    registeredStudentIdParamsSchema: typeof StudentsSchemas.studentIdParamsSchema
  },
) => {
  const followUpResponseSchema = registry.register(
    'FollowUpResponse',
    successEnvelope(followUpDataSchema),
  )
  const followUpListResponseSchema = registry.register(
    'FollowUpListResponse',
    successEnvelope(
      z.object({
        followUps: z.array(followUpDataSchema),
        pagination: paginationSchema,
      }),
    ),
  )

  const registeredFollowUpIdParamsSchema = registry.register(
    'FollowUpIdParams',
    FollowUpsSchemas.followUpIdParamsSchema,
  )
  const registeredCreateFollowUpSchema = registry.register(
    'CreateFollowUpRequest',
    FollowUpsSchemas.createFollowUpSchema,
  )
  const registeredUpdateFollowUpSchema = registry.register(
    'UpdateFollowUpRequest',
    FollowUpsSchemas.updateFollowUpSchema,
  )
  const registeredListFollowUpsQuerySchema = registry.register(
    'ListFollowUpsQuery',
    FollowUpsSchemas.listFollowUpsQuerySchema,
  )

  const unauthorized = errorContent('Bearer token is missing or invalid.')
  const forbiddenStudent = errorContent(
    'Role not allowed, or the student is not assigned to this advisor.',
  )
  const followUpNotFound = errorContent('Student or follow-up not found.')

  registry.registerPath({
    method: 'get',
    path: '/api/v1/students/{studentId}/follow-ups',
    tags: ['Follow-ups'],
    security: [{ bearerAuth: [] }],
    summary: "List a student's follow-ups",
    description: `Requires a bearer access token. ${ROLE_NOTE} Soonest due first. A PENDING follow-up past its due date is returned as OVERDUE.`,
    request: {
      params: registeredStudentIdParamsSchema,
      query: registeredListFollowUpsQuerySchema,
    },
    responses: {
      200: {
        description: 'Follow-ups retrieved successfully.',
        content: {
          'application/json': { schema: followUpListResponseSchema },
        },
      },
      400: errorContent('Path or query parameter validation failed.'),
      401: unauthorized,
      403: forbiddenStudent,
      404: errorContent('Student not found.'),
    },
  })

  registry.registerPath({
    method: 'post',
    path: '/api/v1/students/{studentId}/follow-ups',
    tags: ['Follow-ups'],
    security: [{ bearerAuth: [] }],
    summary: 'Schedule a follow-up',
    description: `Requires a bearer access token. ${ROLE_NOTE} Owned by the authenticated user. If the student is ASSIGNED, they move to FOLLOW_UP (recorded in status history; never moves a student backwards).`,
    request: {
      params: registeredStudentIdParamsSchema,
      body: {
        required: true,
        content: {
          'application/json': { schema: registeredCreateFollowUpSchema },
        },
      },
    },
    responses: {
      201: {
        description: 'Follow-up created successfully.',
        content: { 'application/json': { schema: followUpResponseSchema } },
      },
      400: errorContent('Request validation failed.'),
      401: unauthorized,
      403: forbiddenStudent,
      404: errorContent('Student not found.'),
    },
  })

  registry.registerPath({
    method: 'patch',
    path: '/api/v1/students/{studentId}/follow-ups/{followUpId}',
    tags: ['Follow-ups'],
    security: [{ bearerAuth: [] }],
    summary: 'Reschedule or edit a follow-up',
    description: `Requires a bearer access token. ${ROLE_NOTE} At least one of dueAt, priority, or description is required.`,
    request: {
      params: registeredFollowUpIdParamsSchema,
      body: {
        required: true,
        content: {
          'application/json': { schema: registeredUpdateFollowUpSchema },
        },
      },
    },
    responses: {
      200: {
        description: 'Follow-up updated successfully.',
        content: { 'application/json': { schema: followUpResponseSchema } },
      },
      400: errorContent('Request validation failed.'),
      401: unauthorized,
      403: forbiddenStudent,
      404: followUpNotFound,
    },
  })

  registry.registerPath({
    method: 'post',
    path: '/api/v1/students/{studentId}/follow-ups/{followUpId}/complete',
    tags: ['Follow-ups'],
    security: [{ bearerAuth: [] }],
    summary: 'Mark a follow-up complete',
    description: `Requires a bearer access token. ${ROLE_NOTE}`,
    request: { params: registeredFollowUpIdParamsSchema },
    responses: {
      200: {
        description: 'Follow-up marked complete.',
        content: { 'application/json': { schema: followUpResponseSchema } },
      },
      400: errorContent('Path parameter validation failed.'),
      401: unauthorized,
      403: forbiddenStudent,
      404: followUpNotFound,
      409: errorContent('The follow-up is already completed or canceled.'),
    },
  })

  registry.registerPath({
    method: 'post',
    path: '/api/v1/students/{studentId}/follow-ups/{followUpId}/cancel',
    tags: ['Follow-ups'],
    security: [{ bearerAuth: [] }],
    summary: 'Cancel a follow-up',
    description: `Requires a bearer access token. ${ROLE_NOTE}`,
    request: { params: registeredFollowUpIdParamsSchema },
    responses: {
      200: {
        description: 'Follow-up canceled.',
        content: { 'application/json': { schema: followUpResponseSchema } },
      },
      400: errorContent('Path parameter validation failed.'),
      401: unauthorized,
      403: forbiddenStudent,
      404: followUpNotFound,
      409: errorContent('The follow-up is already completed or canceled.'),
    },
  })

  return { followUpListResponseSchema, registeredListFollowUpsQuerySchema }
}
