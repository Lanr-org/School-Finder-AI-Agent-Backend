import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi'
import { z } from 'zod'
import { ProgramsSchemas } from './programs.schemas'
import type { SchoolsSchemas } from '../schools/schools.schemas'
import { errorResponseSchema } from '../../docs/registry'

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

    createdAt: z.date(),
    updatedAt: z.date(),
  })

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
}
