import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi'
import { z } from 'zod'
import {
  ProgramsSchemas,
  reportStatusEnum,
  verificationStatusEnum,
} from './programs.schemas'
import type { SchoolsSchemas } from '../schools/schools.schemas'
import {
  errorContent,
  errorResponseSchema,
  staffRefSchema,
  successEnvelope,
} from '../../docs/registry'

export const registerProgramsDocs = (
  registry: OpenAPIRegistry,
  {
    registeredSchoolIdParamsSchema,
  }: {
    registeredSchoolIdParamsSchema: typeof SchoolsSchemas.schoolIdParamsSchema
  },
) => {
  const programDataSchema = z.object({
    publicId: z.string(),
    name: z.string(),
    studyLevel: z.enum([
      'UNDERGRADUATE',
      'POSTGRADUATE',
      'DOCTORATE',
      'FOUNDATION',
    ]),
    qualification: z.string(),
    category: z.string(),
    duration: z.string(),
    school: z.object({ publicId: z.string(), name: z.string() }),

    tuitionAmount: z.union([z.number(), z.string()]),
    tuitionCurrency: z.string(),
    scholarshipAvailability: z.string().nullable(),

    intakePeriods: z.array(
      z.enum([
        'JANUARY',
        'FEBRUARY',
        'MARCH',
        'APRIL',
        'MAY',
        'JUNE',
        'JULY',
        'AUGUST',
        'SEPTEMBER',
        'OCTOBER',
        'NOVEMBER',
        'DECEMBER',
      ]),
    ),
    applicationDeadline: z.date().nullable(),
    primaryIntakeYear: z.number().nullable(),

    academicRequirements: z.string().nullable(),
    englishRequirements: z.string().nullable(),
    operationNotes: z.string().nullable(),

    sourceUrl: z.string().nullable(),
    feesAcademicYear: z.string().nullable(),
    verificationStatus: verificationStatusEnum,
    verifiedAt: z.date().nullable(),
    verifiedBy: staffRefSchema.nullable(),
    evidence: z.record(z.string(), z.string()).nullable(),
    lastCheckedAt: z.date().nullable(),

    createdAt: z.date(),
    updatedAt: z.date(),
  })

  const reportDataSchema = z.object({
    id: z.string().uuid(),
    program: z.object({
      publicId: z.string(),
      name: z.string(),
      schoolName: z.string(),
    }),
    message: z.string(),
    status: reportStatusEnum,
    reportedBy: staffRefSchema,
    resolvedBy: staffRefSchema.nullable(),
    createdAt: z.date(),
    resolvedAt: z.date().nullable(),
  })

  const reportResponseSchema = registry.register(
    'ProgramDataReportResponse',
    successEnvelope(reportDataSchema),
  )

  const reportListResponseSchema = registry.register(
    'ProgramDataReportListResponse',
    successEnvelope(
      z.object({
        reports: z.array(reportDataSchema),
        pagination: z.object({
          page: z.number(),
          limit: z.number(),
          total: z.number(),
          totalPages: z.number(),
        }),
      }),
    ),
  )

  const programResponseSchema = registry.register(
    'ProgramResponse',
    z.object({
      success: z.literal(true),
      message: z.string(),
      data: programDataSchema,
      meta: z.object({ requestId: z.string() }),
    }),
  )

  const programListResponseSchema = registry.register(
    'ProgramListResponse',
    z.object({
      success: z.literal(true),
      message: z.string(),
      data: z.object({
        programs: z.array(programDataSchema),
        pagination: z.object({
          page: z.number(),
          limit: z.number(),
          total: z.number(),
          totalPages: z.number(),
        }),
      }),
      meta: z.object({ requestId: z.string() }),
    }),
  )

  const registeredCreateProgramSchema = registry.register(
    'CreateProgramRequest',
    ProgramsSchemas.createProgramSchema,
  )
  const registeredUpdateProgramSchema = registry.register(
    'UpdateProgramRequest',
    ProgramsSchemas.updateProgramSchema,
  )
  const registeredProgramIdParamsSchema = registry.register(
    'ProgramIdParams',
    ProgramsSchemas.programIdParamsSchema,
  )
  const registeredListProgramsQuerySchema = registry.register(
    'ListProgramsQuery',
    ProgramsSchemas.listProgramsQuerySchema,
  )
  const registeredListSchoolProgramsQuerySchema = registry.register(
    'ListSchoolProgramsQuery',
    ProgramsSchemas.listSchoolProgramsQuerySchema,
  )

  registry.registerPath({
    method: 'get',
    path: '/api/v1/programs',
    tags: ['Programs'],
    security: [{ bearerAuth: [] }],
    summary: 'List programs',
    description:
      'Requires a bearer access token. Returns a paginated, filterable list of programs — filterable by school (public ID), study level, category, and free-text name search.',
    request: {
      query: registeredListProgramsQuerySchema,
    },
    responses: {
      200: {
        description: 'Programs retrieved successfully.',
        content: { 'application/json': { schema: programListResponseSchema } },
      },
      400: {
        description: 'Query parameter validation failed.',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      401: {
        description: 'Bearer token is missing or invalid.',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      404: {
        description:
          'The school referenced by the schoolId filter was not found.',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
    },
  })

  registry.registerPath({
    method: 'post',
    path: '/api/v1/programs',
    tags: ['Programs'],
    security: [{ bearerAuth: [] }],
    summary: 'Create a program',
    description:
      'Requires a bearer access token. Creates a new program under an existing school (identified by its public school ID), with tuition/funding, intake, entry-requirement, and internal operations details, and returns the created record with a generated public ID (e.g. PRG-1234).',
    request: {
      body: {
        required: true,
        content: {
          'application/json': { schema: registeredCreateProgramSchema },
        },
      },
    },
    responses: {
      201: {
        description: 'Program created successfully.',
        content: { 'application/json': { schema: programResponseSchema } },
      },
      400: {
        description: 'Request validation failed.',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      401: {
        description: 'Bearer token is missing or invalid.',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      404: {
        description: 'The referenced school was not found.',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
    },
  })

  registry.registerPath({
    method: 'get',
    path: '/api/v1/programs/{programId}',
    tags: ['Programs'],
    security: [{ bearerAuth: [] }],
    summary: 'Get a program by public ID',
    description:
      'Requires a bearer access token. Looks up a program by its public display ID (e.g. PRG-1234).',
    request: { params: registeredProgramIdParamsSchema },
    responses: {
      200: {
        description: 'Program retrieved successfully.',
        content: { 'application/json': { schema: programResponseSchema } },
      },
      400: {
        description: 'programId path parameter is malformed.',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      401: {
        description: 'Bearer token is missing or invalid.',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      404: {
        description: 'Program not found.',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
    },
  })

  registry.registerPath({
    method: 'patch',
    path: '/api/v1/programs/{programId}',
    tags: ['Programs'],
    security: [{ bearerAuth: [] }],
    summary: 'Update a program',
    description:
      'Requires a bearer access token. Partially updates a program by public ID, including reassigning it to a different school; at least one field must be provided.',
    request: {
      params: registeredProgramIdParamsSchema,
      body: {
        required: true,
        content: {
          'application/json': { schema: registeredUpdateProgramSchema },
        },
      },
    },
    responses: {
      200: {
        description: 'Program updated successfully.',
        content: { 'application/json': { schema: programResponseSchema } },
      },
      400: {
        description: 'Request validation failed.',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      401: {
        description: 'Bearer token is missing or invalid.',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      404: {
        description: 'Program (or the reassigned school) was not found.',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
    },
  })

  registry.registerPath({
    method: 'get',
    path: '/api/v1/schools/{schoolId}/programs',
    tags: ['Schools', 'Programs'],
    security: [{ bearerAuth: [] }],
    summary: "List a school's programs",
    description:
      'Requires a bearer access token. Returns a paginated, filterable list of programs offered by a specific school (identified by its public school ID).',
    request: {
      params: registeredSchoolIdParamsSchema,
      query: registeredListSchoolProgramsQuerySchema,
    },
    responses: {
      200: {
        description: "School's programs retrieved successfully.",
        content: { 'application/json': { schema: programListResponseSchema } },
      },
      400: {
        description: 'Path or query parameter validation failed.',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      401: {
        description: 'Bearer token is missing or invalid.',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      404: {
        description: 'School not found.',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
    },
  })

  const registeredCreateReportSchema = registry.register(
    'CreateProgramDataReportRequest',
    ProgramsSchemas.createReportSchema,
  )
  const registeredReportIdParamsSchema = registry.register(
    'ProgramDataReportIdParams',
    ProgramsSchemas.reportIdParamsSchema,
  )
  const registeredListReportsQuerySchema = registry.register(
    'ListProgramDataReportsQuery',
    ProgramsSchemas.listReportsQuerySchema,
  )

  registry.registerPath({
    method: 'post',
    path: '/api/v1/programs/{programId}/verify',
    tags: ['Programs'],
    security: [{ bearerAuth: [] }],
    summary: 'Mark a program verified',
    description:
      'ADMIN or OPERATIONS. Records that a person checked every fee and requirement against the official course page today. Requires sourceUrl to be set. Any later edit to a fact field drops the program back to UNVERIFIED.',
    request: { params: registeredProgramIdParamsSchema },
    responses: {
      200: {
        description: 'Program marked verified.',
        content: { 'application/json': { schema: programResponseSchema } },
      },
      400: errorContent(
        'programId is malformed, or the program has no sourceUrl yet.',
      ),
      401: errorContent('Bearer token is missing or invalid.'),
      403: errorContent('Only ADMIN or OPERATIONS may verify programs.'),
      404: errorContent('Program not found.'),
    },
  })

  registry.registerPath({
    method: 'post',
    path: '/api/v1/programs/{programId}/reports',
    tags: ['Programs'],
    security: [{ bearerAuth: [] }],
    summary: 'Report outdated program data',
    description:
      'Any signed-in staff member. Files a report for ADMIN/OPERATIONS to check; a VERIFIED program becomes NEEDS_RECHECK.',
    request: {
      params: registeredProgramIdParamsSchema,
      body: {
        required: true,
        content: {
          'application/json': { schema: registeredCreateReportSchema },
        },
      },
    },
    responses: {
      201: {
        description: 'Report filed.',
        content: { 'application/json': { schema: reportResponseSchema } },
      },
      400: errorContent('Request validation failed.'),
      401: errorContent('Bearer token is missing or invalid.'),
      404: errorContent('Program not found.'),
    },
  })

  registry.registerPath({
    method: 'get',
    path: '/api/v1/program-reports',
    tags: ['Programs'],
    security: [{ bearerAuth: [] }],
    summary: 'List outdated-data reports',
    description:
      'ADMIN or OPERATIONS. Paginated, newest first; status defaults to OPEN.',
    request: { query: registeredListReportsQuerySchema },
    responses: {
      200: {
        description: 'Reports retrieved successfully.',
        content: { 'application/json': { schema: reportListResponseSchema } },
      },
      400: errorContent('Query parameter validation failed.'),
      401: errorContent('Bearer token is missing or invalid.'),
      403: errorContent('Only ADMIN or OPERATIONS may list reports.'),
    },
  })

  registry.registerPath({
    method: 'post',
    path: '/api/v1/program-reports/{reportId}/resolve',
    tags: ['Programs'],
    security: [{ bearerAuth: [] }],
    summary: 'Resolve an outdated-data report',
    description:
      'ADMIN or OPERATIONS. Closes the report. It does not re-verify the program; use the verify endpoint after fixing the data.',
    request: { params: registeredReportIdParamsSchema },
    responses: {
      200: {
        description: 'Report resolved.',
        content: { 'application/json': { schema: reportResponseSchema } },
      },
      400: errorContent('reportId is malformed.'),
      401: errorContent('Bearer token is missing or invalid.'),
      403: errorContent('Only ADMIN or OPERATIONS may resolve reports.'),
      404: errorContent('Report not found.'),
      409: errorContent('The report is already resolved.'),
    },
  })
}
