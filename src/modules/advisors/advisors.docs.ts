import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi'
import { z } from 'zod'
import { AdvisorsSchemas } from './advisors.schemas'
import { errorContent, successEnvelope } from '../../docs/registry'

type SharedSchemas = {
  // From students.docs.ts / followUps.docs.ts, registered once and reused here.
  studentListResponseSchema: z.ZodTypeAny
  followUpListResponseSchema: z.ZodTypeAny
  registeredListFollowUpsQuerySchema: z.ZodObject
}

export const registerAdvisorsDocs = (
  registry: OpenAPIRegistry,
  {
    studentListResponseSchema,
    followUpListResponseSchema,
    registeredListFollowUpsQuerySchema,
  }: SharedSchemas,
) => {
  // Mirrors toProfileResponse (advisors.service.ts). Workload counts are
  // derived (non-closed assigned students, pending follow-ups), never stored.
  const profileDataSchema = z.object({
    advisorId: z.string(),
    fullName: z.string(),
    email: z.string().email(),
    availability: z.enum(['AVAILABLE', 'LIMITED', 'UNAVAILABLE']),
    maxCapacity: z.number().nullable(),
    activeStudentCount: z.number(),
    pendingFollowUpCount: z.number(),
    createdAt: z.date(),
    updatedAt: z.date(),
  })

  const profileResponseSchema = registry.register(
    'AdvisorProfileResponse',
    successEnvelope(profileDataSchema),
  )
  const profileListResponseSchema = registry.register(
    'AdvisorProfileListResponse',
    successEnvelope(z.array(profileDataSchema)),
  )

  const registeredAdvisorIdParamsSchema = registry.register(
    'AdvisorIdParams',
    AdvisorsSchemas.advisorIdParamsSchema,
  )
  const registeredCreateProfileSchema = registry.register(
    'CreateAdvisorProfileRequest',
    AdvisorsSchemas.createAdvisorProfileSchema,
  )
  const registeredUpdateProfileSchema = registry.register(
    'UpdateAdvisorProfileRequest',
    AdvisorsSchemas.updateAdvisorProfileSchema,
  )
  const registeredUpdateOwnAvailabilitySchema = registry.register(
    'UpdateOwnAvailabilityRequest',
    AdvisorsSchemas.updateOwnAvailabilitySchema,
  )
  const registeredListAdvisorStudentsQuerySchema = registry.register(
    'ListAdvisorStudentsQuery',
    AdvisorsSchemas.listAdvisorStudentsQuerySchema,
  )

  const unauthorized = errorContent('Bearer token is missing or invalid.')
  const ADVISOR_SELF =
    'Requires a bearer access token. Allowed roles: ADVISOR only — always acts on the caller’s own profile.'
  const ADMIN_OR_OWN =
    'Requires a bearer access token. Allowed roles: ADMIN (any advisor) and ADVISOR (own advisorId only — enforced server-side).'
  const ADMIN_ONLY =
    'Requires a bearer access token. Allowed roles: ADMIN only.'

  registry.registerPath({
    method: 'get',
    path: '/api/v1/advisors',
    tags: ['Advisors'],
    security: [{ bearerAuth: [] }],
    summary: 'List advisor profiles with workload',
    description:
      'Requires a bearer access token. Allowed roles: ADMIN (every profile) and ADVISOR (their own profile only). Advisors without a profile are not listed.',
    responses: {
      200: {
        description: 'Advisor profiles retrieved.',
        content: {
          'application/json': { schema: profileListResponseSchema },
        },
      },
      401: unauthorized,
      403: errorContent('Role not allowed.'),
    },
  })

  registry.registerPath({
    method: 'get',
    path: '/api/v1/advisors/me',
    tags: ['Advisors'],
    security: [{ bearerAuth: [] }],
    summary: 'Get my advisor profile',
    description: ADVISOR_SELF,
    responses: {
      200: {
        description: 'Profile retrieved.',
        content: { 'application/json': { schema: profileResponseSchema } },
      },
      401: unauthorized,
      403: errorContent('Only ADVISOR accounts have a "me" profile.'),
      404: errorContent('No advisor profile exists for this account yet.'),
    },
  })

  registry.registerPath({
    method: 'patch',
    path: '/api/v1/advisors/me',
    tags: ['Advisors'],
    security: [{ bearerAuth: [] }],
    summary: 'Update my availability',
    description: `${ADVISOR_SELF} Advisors may change their availability only; capacity is set by ADMIN.`,
    request: {
      body: {
        required: true,
        content: {
          'application/json': { schema: registeredUpdateOwnAvailabilitySchema },
        },
      },
    },
    responses: {
      200: {
        description: 'Availability updated.',
        content: { 'application/json': { schema: profileResponseSchema } },
      },
      400: errorContent('Request validation failed.'),
      401: unauthorized,
      403: errorContent('Only ADVISOR accounts have a "me" profile.'),
      404: errorContent('No advisor profile exists for this account yet.'),
    },
  })

  registry.registerPath({
    method: 'get',
    path: '/api/v1/advisors/me/students',
    tags: ['Advisors'],
    security: [{ bearerAuth: [] }],
    summary: 'List my assigned students',
    description: `${ADVISOR_SELF} Filterable by status and search (student ID, name, email).`,
    request: { query: registeredListAdvisorStudentsQuerySchema },
    responses: {
      200: {
        description: 'Students retrieved.',
        content: { 'application/json': { schema: studentListResponseSchema } },
      },
      400: errorContent('Query parameter validation failed.'),
      401: unauthorized,
      403: errorContent('Only ADVISOR accounts may use this route.'),
    },
  })

  registry.registerPath({
    method: 'get',
    path: '/api/v1/advisors/me/follow-ups',
    tags: ['Advisors'],
    security: [{ bearerAuth: [] }],
    summary: 'List my follow-ups across students',
    description: `${ADVISOR_SELF} Each follow-up includes its studentId. PENDING follow-ups past due are returned as OVERDUE.`,
    request: { query: registeredListFollowUpsQuerySchema },
    responses: {
      200: {
        description: 'Follow-ups retrieved.',
        content: {
          'application/json': { schema: followUpListResponseSchema },
        },
      },
      400: errorContent('Query parameter validation failed.'),
      401: unauthorized,
      403: errorContent('Only ADVISOR accounts may use this route.'),
    },
  })

  registry.registerPath({
    method: 'post',
    path: '/api/v1/advisors',
    tags: ['Advisors'],
    security: [{ bearerAuth: [] }],
    summary: 'Create an advisor profile',
    description: `${ADMIN_ONLY} Creates the capacity/availability profile for an existing ADVISOR account (userId is their public ID). maxCapacity null means unlimited.`,
    request: {
      body: {
        required: true,
        content: {
          'application/json': { schema: registeredCreateProfileSchema },
        },
      },
    },
    responses: {
      201: {
        description: 'Profile created.',
        content: { 'application/json': { schema: profileResponseSchema } },
      },
      400: errorContent('Request validation failed.'),
      401: unauthorized,
      403: errorContent('Only ADMIN may create advisor profiles.'),
      404: errorContent('No ADVISOR account with that public ID.'),
      409: errorContent('This advisor already has a profile.'),
    },
  })

  registry.registerPath({
    method: 'get',
    path: '/api/v1/advisors/{advisorId}',
    tags: ['Advisors'],
    security: [{ bearerAuth: [] }],
    summary: 'Get an advisor profile',
    description: ADMIN_OR_OWN,
    request: { params: registeredAdvisorIdParamsSchema },
    responses: {
      200: {
        description: 'Profile retrieved.',
        content: { 'application/json': { schema: profileResponseSchema } },
      },
      400: errorContent('advisorId path parameter is malformed.'),
      401: unauthorized,
      403: errorContent('Advisors may only view their own profile.'),
      404: errorContent('Advisor or advisor profile not found.'),
    },
  })

  registry.registerPath({
    method: 'patch',
    path: '/api/v1/advisors/{advisorId}',
    tags: ['Advisors'],
    security: [{ bearerAuth: [] }],
    summary: 'Update an advisor’s availability or capacity',
    description: `${ADMIN_ONLY} At least one of availability or maxCapacity is required. Capacity is enforced when students are assigned.`,
    request: {
      params: registeredAdvisorIdParamsSchema,
      body: {
        required: true,
        content: {
          'application/json': { schema: registeredUpdateProfileSchema },
        },
      },
    },
    responses: {
      200: {
        description: 'Profile updated.',
        content: { 'application/json': { schema: profileResponseSchema } },
      },
      400: errorContent('Request validation failed.'),
      401: unauthorized,
      403: errorContent('Only ADMIN may change another advisor’s profile.'),
      404: errorContent('Advisor or advisor profile not found.'),
    },
  })

  registry.registerPath({
    method: 'get',
    path: '/api/v1/advisors/{advisorId}/students',
    tags: ['Advisors'],
    security: [{ bearerAuth: [] }],
    summary: "List an advisor's assigned students",
    description: ADMIN_OR_OWN,
    request: {
      params: registeredAdvisorIdParamsSchema,
      query: registeredListAdvisorStudentsQuerySchema,
    },
    responses: {
      200: {
        description: 'Students retrieved.',
        content: { 'application/json': { schema: studentListResponseSchema } },
      },
      400: errorContent('Path or query parameter validation failed.'),
      401: unauthorized,
      403: errorContent('Advisors may only list their own students.'),
      404: errorContent('Advisor not found.'),
    },
  })

  registry.registerPath({
    method: 'get',
    path: '/api/v1/advisors/{advisorId}/follow-ups',
    tags: ['Advisors'],
    security: [{ bearerAuth: [] }],
    summary: "List an advisor's follow-ups across students",
    description: `${ADMIN_OR_OWN} Each follow-up includes its studentId.`,
    request: {
      params: registeredAdvisorIdParamsSchema,
      query: registeredListFollowUpsQuerySchema,
    },
    responses: {
      200: {
        description: 'Follow-ups retrieved.',
        content: {
          'application/json': { schema: followUpListResponseSchema },
        },
      },
      400: errorContent('Path or query parameter validation failed.'),
      401: unauthorized,
      403: errorContent('Advisors may only list their own follow-ups.'),
      404: errorContent('Advisor not found.'),
    },
  })
}
