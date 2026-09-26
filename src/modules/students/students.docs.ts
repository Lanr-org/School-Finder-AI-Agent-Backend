import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi'
import { z } from 'zod'
import { StudentsSchemas } from './students.schemas'
import {
  errorContent,
  paginationSchema,
  staffRefSchema,
  STUDENT_SCOPE_ROLE_NOTE as ROLE_NOTE,
  successEnvelope,
} from '../../docs/registry'

export const studentStatusEnum = z.enum([
  'NEW',
  'AWAITING_ASSIGNMENT',
  'ASSIGNED',
  'FOLLOW_UP',
  'APPLICATION_STARTED',
  'COMPLETED',
  'CLOSED',
])

// Mirrors toStudentResponse (students.service.ts). Also used by advisors.docs.ts
// for GET /advisors/{advisorId}/students and /advisors/me/students.
export const studentDataSchema = z.object({
  publicId: z.string(),
  status: studentStatusEnum,
  contact: z.object({
    firstName: z.string(),
    lastName: z.string().nullable(),
    email: z.string().nullable(),
    phone: z.string().nullable(),
    source: z.enum(['TELEGRAM', 'WHATSAPP', 'LIVE_CHAT', 'FACEBOOK', 'MANUAL']),
  }),
  studyLevel: z.string().nullable(),
  targetDestinations: z.array(z.string()),
  targetIntakeMonth: z.string().nullable(),
  targetIntakeYear: z.number().nullable(),
  budgetRange: z.string().nullable(),
  academicBackground: z.string().nullable(),
  englishTestScore: z.string().nullable(),
  assignedAdvisor: staffRefSchema.nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export const registerStudentsDocs = (registry: OpenAPIRegistry) => {
  const studentStatusHistoryResponseSchema = registry.register(
    'StudentStatusHistoryResponse',
    successEnvelope(
      z.array(
        z.object({
          fromStatus: z.string().nullable(),
          toStatus: z.string(),
          source: z.enum([
            'LEAD_CREATED',
            'MANUAL',
            'ADVISOR_ASSIGNED',
            'ADVISOR_UNASSIGNED',
            'FOLLOW_UP_CREATED',
            'APPLICATION_CREATED',
          ]),
          note: z.string().nullable(),
          changedBy: staffRefSchema.nullable(),
          changedAt: z.date(),
        }),
      ),
    ),
  )

  const studentResponseSchema = registry.register(
    'StudentResponse',
    successEnvelope(studentDataSchema),
  )
  const studentListResponseSchema = registry.register(
    'StudentListResponse',
    successEnvelope(
      z.object({
        students: z.array(studentDataSchema),
        pagination: paginationSchema,
      }),
    ),
  )

  const registeredStudentIdParamsSchema = registry.register(
    'StudentIdParams',
    StudentsSchemas.studentIdParamsSchema,
  )
  const registeredListStudentsQuerySchema = registry.register(
    'ListStudentsQuery',
    StudentsSchemas.listStudentsQuerySchema,
  )
  const registeredAssignAdvisorSchema = registry.register(
    'AssignAdvisorRequest',
    StudentsSchemas.assignAdvisorSchema,
  )
  const registeredUpdateStudentStatusSchema = registry.register(
    'UpdateStudentStatusRequest',
    StudentsSchemas.updateStatusSchema,
  )

  const unauthorized = errorContent('Bearer token is missing or invalid.')
  const forbiddenStudent = errorContent(
    'Role not allowed, or the student is not assigned to this advisor.',
  )
  const studentNotFound = errorContent('Student not found.')

  registry.registerPath({
    method: 'get',
    path: '/api/v1/students',
    tags: ['Students'],
    security: [{ bearerAuth: [] }],
    summary: 'List students',
    description: `Requires a bearer access token. ${ROLE_NOTE} ADVISOR results are always limited to their own students (advisorId is ignored); ADMIN may filter by a public advisorId. search matches the student ID, first/last name, and email. Newest first.`,
    request: { query: registeredListStudentsQuerySchema },
    responses: {
      200: {
        description: 'Students retrieved successfully.',
        content: { 'application/json': { schema: studentListResponseSchema } },
      },
      400: errorContent('Query parameter validation failed.'),
      401: unauthorized,
      403: errorContent('Role not allowed.'),
      404: errorContent(
        'The advisor referenced by the advisorId filter was not found.',
      ),
    },
  })

  registry.registerPath({
    method: 'get',
    path: '/api/v1/students/{studentId}',
    tags: ['Students'],
    security: [{ bearerAuth: [] }],
    summary: 'Get a student',
    description: `Requires a bearer access token. ${ROLE_NOTE}`,
    request: { params: registeredStudentIdParamsSchema },
    responses: {
      200: {
        description: 'Student retrieved successfully.',
        content: { 'application/json': { schema: studentResponseSchema } },
      },
      400: errorContent('studentId path parameter is malformed.'),
      401: unauthorized,
      403: forbiddenStudent,
      404: studentNotFound,
    },
  })

  registry.registerPath({
    method: 'patch',
    path: '/api/v1/students/{studentId}/advisor',
    tags: ['Students'],
    security: [{ bearerAuth: [] }],
    summary: 'Assign or unassign a student’s advisor',
    description:
      'Requires a bearer access token. Allowed roles: ADMIN only. advisorId null unassigns. Assigning only advances the student from NEW/AWAITING_ASSIGNMENT to ASSIGNED (a student further along keeps their status); unassigning moves an open student to AWAITING_ASSIGNMENT but never reopens COMPLETED/CLOSED ones. Enforces the advisor’s capacity. Recorded in status history; audited as student.advisor_assigned / student.advisor_unassigned.',
    request: {
      params: registeredStudentIdParamsSchema,
      body: {
        required: true,
        content: {
          'application/json': { schema: registeredAssignAdvisorSchema },
        },
      },
    },
    responses: {
      200: {
        description: 'Advisor assignment updated.',
        content: { 'application/json': { schema: studentResponseSchema } },
      },
      400: errorContent('Request validation failed.'),
      401: unauthorized,
      403: errorContent('Only ADMIN may assign advisors.'),
      404: errorContent(
        'Student, or an ADVISOR with that public ID, not found.',
      ),
      409: errorContent('The advisor is at capacity.'),
    },
  })

  registry.registerPath({
    method: 'patch',
    path: '/api/v1/students/{studentId}/status',
    tags: ['Students'],
    security: [{ bearerAuth: [] }],
    summary: 'Change a student’s workflow status',
    description: `Requires a bearer access token. ${ROLE_NOTE} Manual status change with an optional note, recorded in status history. Setting the current status again is a no-op. Audited as student.status_changed.`,
    request: {
      params: registeredStudentIdParamsSchema,
      body: {
        required: true,
        content: {
          'application/json': { schema: registeredUpdateStudentStatusSchema },
        },
      },
    },
    responses: {
      200: {
        description: 'Student status updated.',
        content: { 'application/json': { schema: studentResponseSchema } },
      },
      400: errorContent('Request validation failed.'),
      401: unauthorized,
      403: forbiddenStudent,
      404: studentNotFound,
    },
  })

  registry.registerPath({
    method: 'get',
    path: '/api/v1/students/{studentId}/status-history',
    tags: ['Students'],
    security: [{ bearerAuth: [] }],
    summary: "Get a student's status history",
    description: `Requires a bearer access token. ${ROLE_NOTE} Newest first. changedBy is null for system changes (e.g. a lead created from Telegram). History starts from when this feature shipped; earlier changes were not recorded.`,
    request: { params: registeredStudentIdParamsSchema },
    responses: {
      200: {
        description: 'Student status history retrieved successfully.',
        content: {
          'application/json': { schema: studentStatusHistoryResponseSchema },
        },
      },
      400: errorContent('studentId path parameter is malformed.'),
      401: unauthorized,
      403: forbiddenStudent,
      404: studentNotFound,
    },
  })

  // Advisors documents its student lists with the same response schema.
  return { registeredStudentIdParamsSchema, studentListResponseSchema }
}
