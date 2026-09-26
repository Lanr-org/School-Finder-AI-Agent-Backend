import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi'
import { z } from 'zod'
import { ApplicationsSchemas } from './applications.schemas'
import type { StudentsSchemas } from '../students/students.schemas'
import {
  errorContent,
  paginationSchema,
  staffRefSchema,
  STUDENT_SCOPE_ROLE_NOTE as ROLE_NOTE,
  successEnvelope,
} from '../../docs/registry'

export const registerApplicationsDocs = (
  registry: OpenAPIRegistry,
  {
    registeredStudentIdParamsSchema,
  }: {
    registeredStudentIdParamsSchema: typeof StudentsSchemas.studentIdParamsSchema
  },
) => {
  const applicationStatusEnum = z.enum([
    'DRAFT',
    'DOCUMENTS_PENDING',
    'SUBMITTED',
    'OFFER_RECEIVED',
    'VISA_PROCESSING',
    'COMPLETED',
    'REJECTED',
    'WITHDRAWN',
  ])

  const applicationDataSchema = z.object({
    publicId: z.string(),
    status: applicationStatusEnum,
    student: z.object({
      publicId: z.string(),
      firstName: z.string(),
      lastName: z.string().nullable(),
    }),
    program: z.object({
      publicId: z.string(),
      name: z.string(),
      studyLevel: z.enum([
        'UNDERGRADUATE',
        'POSTGRADUATE',
        'DOCTORATE',
        'FOUNDATION',
      ]),
    }),
    school: z.object({
      publicId: z.string(),
      name: z.string(),
      country: z.string(),
    }),
    intake: z
      .object({
        month: z.string(),
        year: z.number(),
        applicationDeadline: z.date().nullable(),
      })
      .nullable(),
    externalReference: z.string().nullable(),
    notes: z.string().nullable(),
    createdBy: staffRefSchema,
    createdAt: z.date(),
    updatedAt: z.date(),
  })

  const applicationHistoryEntrySchema = z.object({
    fromStatus: applicationStatusEnum.nullable(),
    toStatus: applicationStatusEnum,
    note: z.string().nullable(),
    changedBy: staffRefSchema.nullable(),
    changedAt: z.date(),
  })

  const applicationResponseSchema = registry.register(
    'ApplicationResponse',
    successEnvelope(applicationDataSchema),
  )

  const applicationDetailResponseSchema = registry.register(
    'ApplicationDetailResponse',
    successEnvelope(
      applicationDataSchema.extend({
        history: z.array(applicationHistoryEntrySchema),
      }),
    ),
  )

  const applicationListResponseSchema = registry.register(
    'ApplicationListResponse',
    successEnvelope(
      z.object({
        applications: z.array(applicationDataSchema),
        summary: z.record(applicationStatusEnum, z.number()),
        pagination: paginationSchema,
      }),
    ),
  )

  const studentApplicationListResponseSchema = registry.register(
    'StudentApplicationListResponse',
    successEnvelope(
      z.object({
        applications: z.array(applicationDataSchema),
        pagination: paginationSchema,
      }),
    ),
  )

  const registeredApplicationIdParamsSchema = registry.register(
    'ApplicationIdParams',
    ApplicationsSchemas.applicationIdParamsSchema,
  )
  const registeredCreateApplicationSchema = registry.register(
    'CreateApplicationRequest',
    ApplicationsSchemas.createApplicationSchema,
  )
  const registeredUpdateApplicationSchema = registry.register(
    'UpdateApplicationRequest',
    ApplicationsSchemas.updateApplicationSchema,
  )
  const registeredUpdateApplicationStatusSchema = registry.register(
    'UpdateApplicationStatusRequest',
    ApplicationsSchemas.updateStatusSchema,
  )
  const registeredListApplicationsQuerySchema = registry.register(
    'ListApplicationsQuery',
    ApplicationsSchemas.listApplicationsQuerySchema,
  )
  const registeredListStudentApplicationsQuerySchema = registry.register(
    'ListStudentApplicationsQuery',
    ApplicationsSchemas.listStudentApplicationsQuerySchema,
  )

  registry.registerPath({
    method: 'get',
    path: '/api/v1/students/{studentId}/applications',
    tags: ['Applications'],
    security: [{ bearerAuth: [] }],
    summary: "List a student's applications",
    description: `Requires a bearer access token. ${ROLE_NOTE} Newest first, optionally filtered by status.`,
    request: {
      params: registeredStudentIdParamsSchema,
      query: registeredListStudentApplicationsQuerySchema,
    },
    responses: {
      200: {
        description: 'Applications retrieved successfully.',
        content: {
          'application/json': { schema: studentApplicationListResponseSchema },
        },
      },
      400: errorContent('Path or query parameter validation failed.'),
      401: errorContent('Bearer token is missing or invalid.'),
      403: errorContent(
        'Role not allowed, or the student is not assigned to this advisor.',
      ),
      404: errorContent('Student not found.'),
    },
  })

  registry.registerPath({
    method: 'post',
    path: '/api/v1/students/{studentId}/applications',
    tags: ['Applications'],
    security: [{ bearerAuth: [] }],
    summary: 'Create an application for a student',
    description: `Requires a bearer access token. ${ROLE_NOTE} Creates a DRAFT application for a program. intakeMonth and intakeYear must be sent together and must match one of the program's stored intakes. If the student is ASSIGNED or FOLLOW_UP they are moved to APPLICATION_STARTED (never moved backwards), and both changes are recorded in status history.`,
    request: {
      params: registeredStudentIdParamsSchema,
      body: {
        required: true,
        content: {
          'application/json': { schema: registeredCreateApplicationSchema },
        },
      },
    },
    responses: {
      201: {
        description: 'Application created successfully.',
        content: { 'application/json': { schema: applicationResponseSchema } },
      },
      400: errorContent(
        'Validation failed, or the intake is not a listed intake for the program.',
      ),
      401: errorContent('Bearer token is missing or invalid.'),
      403: errorContent(
        'Role not allowed, or the student is not assigned to this advisor.',
      ),
      404: errorContent('Student or program not found.'),
      409: errorContent(
        'The student already has an open application for this program.',
      ),
    },
  })

  registry.registerPath({
    method: 'get',
    path: '/api/v1/applications',
    tags: ['Applications'],
    security: [{ bearerAuth: [] }],
    summary: 'List applications across students',
    description: `Requires a bearer access token. ${ROLE_NOTE} ADVISOR results are always limited to their own students (advisorId is ignored); ADMIN may filter by a public advisorId. search matches the application ID, student ID/name, and program name. summary counts every status within the same advisor/search scope, ignoring the status filter.`,
    request: { query: registeredListApplicationsQuerySchema },
    responses: {
      200: {
        description: 'Applications retrieved successfully.',
        content: {
          'application/json': { schema: applicationListResponseSchema },
        },
      },
      400: errorContent('Query parameter validation failed.'),
      401: errorContent('Bearer token is missing or invalid.'),
      403: errorContent('Role not allowed.'),
      404: errorContent(
        'The advisor referenced by the advisorId filter was not found.',
      ),
    },
  })

  registry.registerPath({
    method: 'get',
    path: '/api/v1/applications/{applicationId}',
    tags: ['Applications'],
    security: [{ bearerAuth: [] }],
    summary: 'Get an application with its status history',
    description: `Requires a bearer access token. ${ROLE_NOTE} history is oldest first; the first entry (fromStatus null) is the creation.`,
    request: { params: registeredApplicationIdParamsSchema },
    responses: {
      200: {
        description: 'Application retrieved successfully.',
        content: {
          'application/json': { schema: applicationDetailResponseSchema },
        },
      },
      400: errorContent('applicationId path parameter is malformed.'),
      401: errorContent('Bearer token is missing or invalid.'),
      403: errorContent(
        "Role not allowed, or the application's student is not assigned to this advisor.",
      ),
      404: errorContent('Application not found.'),
    },
  })

  registry.registerPath({
    method: 'patch',
    path: '/api/v1/applications/{applicationId}',
    tags: ['Applications'],
    security: [{ bearerAuth: [] }],
    summary: 'Update application details',
    description: `Requires a bearer access token. ${ROLE_NOTE} Updates intake, externalReference, or notes (null clears a field). Final applications (COMPLETED, REJECTED, WITHDRAWN) cannot be edited.`,
    request: {
      params: registeredApplicationIdParamsSchema,
      body: {
        required: true,
        content: {
          'application/json': { schema: registeredUpdateApplicationSchema },
        },
      },
    },
    responses: {
      200: {
        description: 'Application updated successfully.',
        content: { 'application/json': { schema: applicationResponseSchema } },
      },
      400: errorContent(
        'Validation failed, or the intake is not a listed intake for the program.',
      ),
      401: errorContent('Bearer token is missing or invalid.'),
      403: errorContent(
        "Role not allowed, or the application's student is not assigned to this advisor.",
      ),
      404: errorContent('Application not found.'),
      409: errorContent(
        'The application is final and can no longer be edited.',
      ),
    },
  })

  registry.registerPath({
    method: 'patch',
    path: '/api/v1/applications/{applicationId}/status',
    tags: ['Applications'],
    security: [{ bearerAuth: [] }],
    summary: 'Change application status',
    description: `Requires a bearer access token. ${ROLE_NOTE} Forward-only along DRAFT → DOCUMENTS_PENDING → SUBMITTED → OFFER_RECEIVED → VISA_PROCESSING → COMPLETED (skipping forward is allowed). REJECTED and WITHDRAWN are allowed from any open status. COMPLETED, REJECTED, and WITHDRAWN are final. Each change appends a status history entry with the optional note.`,
    request: {
      params: registeredApplicationIdParamsSchema,
      body: {
        required: true,
        content: {
          'application/json': {
            schema: registeredUpdateApplicationStatusSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Application status updated successfully.',
        content: { 'application/json': { schema: applicationResponseSchema } },
      },
      400: errorContent('Request validation failed.'),
      401: errorContent('Bearer token is missing or invalid.'),
      403: errorContent(
        "Role not allowed, or the application's student is not assigned to this advisor.",
      ),
      404: errorContent('Application not found.'),
      409: errorContent(
        'Transition not allowed, or the status changed since it was loaded.',
      ),
    },
  })
}
