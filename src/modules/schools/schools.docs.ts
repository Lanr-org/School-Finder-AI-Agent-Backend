import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi'
import { z } from 'zod'
import { SchoolsSchemas } from './schools.schemas'
import { errorResponseSchema } from '../../docs/registry'

export const registerSchoolsDocs = (registry: OpenAPIRegistry) => {
  const schoolDataSchema = z.object({
    publicId: z.string(),
    name: z.string(),
    schoolType: z.enum(['UNIVERSITY', 'COLLEGE', 'INSTITUTE', 'POLYTECHNIC']),
    recordStatus: z.enum(['ACTIVE', 'INACTIVE']),
    description: z.string().nullable(),

    website: z.string().nullable(),
    admissionsEmail: z.string().nullable(),
    phoneNumbers: z.array(z.string()),

    streetAddress: z.string().nullable(),
    city: z.string(),
    country: z.string(),
    postalCode: z.string().nullable(),

    partnerStatus: z.enum(['PARTNER', 'PROSPECT', 'NON_PARTNER']),
    visaFriendlinessScore: z.number().nullable(),
    visaFriendlinessNotes: z.string().nullable(),
    admissionFriendlinessScore: z.number().nullable(),
    admissionFriendlinessNotes: z.string().nullable(),
    rankingReputationNotes: z.string().nullable(),

    createdAt: z.date(),
    updatedAt: z.date(),
  })

  const schoolResponseSchema = registry.register(
    'SchoolResponse',
    z.object({
      success: z.literal(true),
      message: z.string(),
      data: schoolDataSchema,
      meta: z.object({ requestId: z.string() }),
    }),
  )

  const schoolListResponseSchema = registry.register(
    'SchoolListResponse',
    z.object({
      success: z.literal(true),
      message: z.string(),
      data: z.object({
        schools: z.array(schoolDataSchema),
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

  const registeredCreateSchoolSchema = registry.register(
    'CreateSchoolRequest',
    SchoolsSchemas.createSchoolSchema,
  )
  const registeredUpdateSchoolSchema = registry.register(
    'UpdateSchoolRequest',
    SchoolsSchemas.updateSchoolSchema,
  )
  const registeredSchoolIdParamsSchema = registry.register(
    'SchoolIdParams',
    SchoolsSchemas.schoolIdParamsSchema,
  )
  const registeredListSchoolsQuerySchema = registry.register(
    'ListSchoolsQuery',
    SchoolsSchemas.listSchoolsQuerySchema,
  )

  registry.registerPath({
    method: 'get',
    path: '/api/v1/schools',
    tags: ['Schools'],
    security: [{ bearerAuth: [] }],
    summary: 'List schools',
    description:
      'Requires a bearer access token. Returns a paginated, filterable list of schools for admin/operations staff — filterable by country, city, school type, partner status, record status, and free-text name search.',
    request: {
      query: registeredListSchoolsQuerySchema,
    },
    responses: {
      200: {
        description: 'Schools retrieved successfully.',
        content: { 'application/json': { schema: schoolListResponseSchema } },
      },
      400: {
        description: 'Query parameter validation failed.',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      401: {
        description: 'Bearer token is missing or invalid.',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
    },
  })

  registry.registerPath({
    method: 'post',
    path: '/api/v1/schools',
    tags: ['Schools'],
    security: [{ bearerAuth: [] }],
    summary: 'Create a school',
    description:
      'Requires a bearer access token. Creates a new school profile with contact/website, location, and partnership & internal-assessment details, and returns the created record with a generated public ID (e.g. SCH-1234).',
    request: {
      body: {
        required: true,
        content: {
          'application/json': { schema: registeredCreateSchoolSchema },
        },
      },
    },
    responses: {
      201: {
        description: 'School created successfully.',
        content: { 'application/json': { schema: schoolResponseSchema } },
      },
      400: {
        description: 'Request validation failed.',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      401: {
        description: 'Bearer token is missing or invalid.',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
    },
  })

  registry.registerPath({
    method: 'get',
    path: '/api/v1/schools/{schoolId}',
    tags: ['Schools'],
    security: [{ bearerAuth: [] }],
    summary: 'Get a school by public ID',
    description:
      'Requires a bearer access token. Looks up a school by its public display ID (e.g. SCH-1234).',
    request: { params: registeredSchoolIdParamsSchema },
    responses: {
      200: {
        description: 'School retrieved successfully.',
        content: { 'application/json': { schema: schoolResponseSchema } },
      },
      400: {
        description: 'schoolId path parameter is malformed.',
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

  registry.registerPath({
    method: 'patch',
    path: '/api/v1/schools/{schoolId}',
    tags: ['Schools'],
    security: [{ bearerAuth: [] }],
    summary: 'Update a school',
    description:
      'Requires a bearer access token. Partially updates a school profile by public ID; at least one field must be provided.',
    request: {
      params: registeredSchoolIdParamsSchema,
      body: {
        required: true,
        content: {
          'application/json': { schema: registeredUpdateSchoolSchema },
        },
      },
    },
    responses: {
      200: {
        description: 'School updated successfully.',
        content: { 'application/json': { schema: schoolResponseSchema } },
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
        description: 'School not found.',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
    },
  })

  registry.registerPath({
    method: 'delete',
    path: '/api/v1/schools/{schoolId}',
    tags: ['Schools'],
    security: [{ bearerAuth: [] }],
    summary: 'Deactivate a school (soft delete)',
    description:
      'Requires a bearer access token. Sets the school record_status to INACTIVE by public ID; the row is retained, not removed. Returns a conflict if the school is already inactive.',
    request: { params: registeredSchoolIdParamsSchema },
    responses: {
      200: {
        description: 'School deactivated successfully.',
        content: { 'application/json': { schema: schoolResponseSchema } },
      },
      400: {
        description: 'schoolId path parameter is malformed.',
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
      409: {
        description: 'School is already inactive.',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
    },
  })

  return { registeredSchoolIdParamsSchema }
}
