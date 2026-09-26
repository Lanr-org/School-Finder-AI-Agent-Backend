import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi'
import { z } from 'zod'
import { RecommendationsSchemas } from './recommendations.schemas'
import type { StudentsSchemas } from '../students/students.schemas'
import {
  emptySuccessResponseSchema,
  errorContent,
  paginationSchema,
  STUDENT_SCOPE_ROLE_NOTE as ROLE_NOTE,
  successEnvelope,
} from '../../docs/registry'

const SCORING_NOTE =
  'Scores (0–100) come from deterministic weighted rules over stored program and school records (program, budget, intake, visa fit) — no LLM is involved.'

export const registerRecommendationsDocs = (
  registry: OpenAPIRegistry,
  {
    registeredStudentIdParamsSchema,
  }: {
    registeredStudentIdParamsSchema: typeof StudentsSchemas.studentIdParamsSchema
  },
) => {
  // Mirrors toPersistedRecommendationResponse / toGeneratedRecommendationResponse.
  const recommendationSchema = z.object({
    publicId: z.string(),
    program: z.object({
      publicId: z.string(),
      name: z.string(),
      qualification: z.string(),
      category: z.string(),
      tuitionAmount: z.number(),
      tuitionCurrency: z.string(),
    }),
    school: z.object({
      publicId: z.string(),
      name: z.string(),
      country: z.string(),
      city: z.string(),
    }),
    overallScore: z.number(),
    scoreBreakdown: z.object({
      program: z.number(),
      budget: z.number(),
      intake: z.number(),
      visa: z.number(),
    }),
    reasons: z.array(z.string()),
    missingRequirements: z.array(z.string()),
    shortlisted: z.boolean(),
  })

  const runSummarySchema = z.object({
    publicId: z.string(),
    weightsVersion: z.number(),
    scoringVersion: z.string(),
    createdAt: z.date(),
  })
  const runWithRecommendationsSchema = runSummarySchema.extend({
    recommendations: z.array(recommendationSchema),
  })

  const weightsSchema = z.object({
    version: z.number().openapi({
      description: '0 means no version has been saved yet (defaults in use).',
    }),
    programWeight: z.number(),
    budgetWeight: z.number(),
    intakeWeight: z.number(),
    visaWeight: z.number(),
    createdAt: z.date().nullable(),
  })

  const runResponseSchema = registry.register(
    'RecommendationRunResponse',
    successEnvelope(runWithRecommendationsSchema),
  )
  const runDetailResponseSchema = registry.register(
    'RecommendationRunDetailResponse',
    successEnvelope(
      runWithRecommendationsSchema.extend({ studentId: z.string() }),
    ),
  )
  const latestForStudentResponseSchema = registry.register(
    'LatestStudentRecommendationsResponse',
    successEnvelope(
      z.union([
        runWithRecommendationsSchema,
        z
          .object({
            run: z.null(),
            recommendations: z.array(recommendationSchema),
          })
          .openapi({ description: 'Returned when no run exists yet.' }),
      ]),
    ),
  )
  const recommendationListResponseSchema = registry.register(
    'RecommendationListResponse',
    successEnvelope(
      z.object({
        recommendations: z.array(
          recommendationSchema.extend({
            studentId: z.string(),
            studentName: z.string(),
            createdAt: z.date(),
          }),
        ),
        pagination: paginationSchema,
        summary: z.object({
          generated: z.number(),
          strongMatches: z.number(),
          missingRequirements: z.number(),
          shortlisted: z.number(),
        }),
      }),
    ),
  )
  const shortlistResponseSchema = registry.register(
    'ShortlistResponse',
    successEnvelope(z.object({ studentId: z.string(), programId: z.string() })),
  )
  const weightsResponseSchema = registry.register(
    'RecommendationWeightsResponse',
    successEnvelope(weightsSchema),
  )

  const registeredRunIdParamsSchema = registry.register(
    'RecommendationRunIdParams',
    RecommendationsSchemas.runIdParamsSchema,
  )
  const registeredStudentProgramParamsSchema = registry.register(
    'StudentProgramParams',
    RecommendationsSchemas.studentProgramParamsSchema,
  )
  const registeredGenerateRunSchema = registry.register(
    'GenerateRecommendationRunRequest',
    RecommendationsSchemas.generateRunSchema,
  )
  const registeredCreateShortlistSchema = registry.register(
    'CreateShortlistRequest',
    RecommendationsSchemas.createShortlistSchema,
  )
  const registeredListRecommendationsQuerySchema = registry.register(
    'ListRecommendationsQuery',
    RecommendationsSchemas.listRecommendationsQuerySchema,
  )
  const registeredUpdateWeightsSchema = registry.register(
    'UpdateRecommendationWeightsRequest',
    RecommendationsSchemas.updateWeightsSchema,
  )

  const unauthorized = errorContent('Bearer token is missing or invalid.')
  const forbiddenStudent = errorContent(
    'Role not allowed, or the student is not assigned to this advisor.',
  )

  registry.registerPath({
    method: 'post',
    path: '/api/v1/students/{studentId}/recommendation-runs',
    tags: ['Recommendations'],
    security: [{ bearerAuth: [] }],
    summary: 'Generate recommendations for a student',
    description: `Requires a bearer access token. ${ROLE_NOTE} ${SCORING_NOTE} Each run stores the student snapshot, the weights and scoring version used, and every score, so results are reproducible. The new run replaces the student's current list.`,
    request: {
      params: registeredStudentIdParamsSchema,
      body: {
        required: true,
        content: {
          'application/json': { schema: registeredGenerateRunSchema },
        },
      },
    },
    responses: {
      201: {
        description: 'Run created with its scored recommendations.',
        content: { 'application/json': { schema: runResponseSchema } },
      },
      400: errorContent('Request validation failed.'),
      401: unauthorized,
      403: forbiddenStudent,
      404: errorContent('Student not found.'),
    },
  })

  registry.registerPath({
    method: 'get',
    path: '/api/v1/students/{studentId}/recommendations',
    tags: ['Recommendations'],
    security: [{ bearerAuth: [] }],
    summary: "Get a student's latest recommendations",
    description: `Requires a bearer access token. ${ROLE_NOTE} Returns the latest run, highest score first. When no run exists yet, the response is { run: null, recommendations: [] } instead.`,
    request: { params: registeredStudentIdParamsSchema },
    responses: {
      200: {
        description: 'Latest recommendations retrieved.',
        content: {
          'application/json': { schema: latestForStudentResponseSchema },
        },
      },
      400: errorContent('studentId path parameter is malformed.'),
      401: unauthorized,
      403: forbiddenStudent,
      404: errorContent('Student not found.'),
    },
  })

  registry.registerPath({
    method: 'post',
    path: '/api/v1/students/{studentId}/shortlists',
    tags: ['Recommendations'],
    security: [{ bearerAuth: [] }],
    summary: 'Shortlist a program for a student',
    description: `Requires a bearer access token. ${ROLE_NOTE} Idempotent: shortlisting an already-shortlisted program succeeds without change.`,
    request: {
      params: registeredStudentIdParamsSchema,
      body: {
        required: true,
        content: {
          'application/json': { schema: registeredCreateShortlistSchema },
        },
      },
    },
    responses: {
      201: {
        description: 'Program shortlisted.',
        content: { 'application/json': { schema: shortlistResponseSchema } },
      },
      400: errorContent('Request validation failed.'),
      401: unauthorized,
      403: forbiddenStudent,
      404: errorContent('Student or program not found.'),
    },
  })

  registry.registerPath({
    method: 'delete',
    path: '/api/v1/students/{studentId}/shortlists/{programId}',
    tags: ['Recommendations'],
    security: [{ bearerAuth: [] }],
    summary: 'Remove a program from a student’s shortlist',
    description: `Requires a bearer access token. ${ROLE_NOTE}`,
    request: { params: registeredStudentProgramParamsSchema },
    responses: {
      200: {
        description: 'Program removed from the shortlist.',
        content: {
          'application/json': { schema: emptySuccessResponseSchema },
        },
      },
      400: errorContent('Path parameter validation failed.'),
      401: unauthorized,
      403: forbiddenStudent,
      404: errorContent('Student, program, or shortlist entry not found.'),
    },
  })

  registry.registerPath({
    method: 'get',
    path: '/api/v1/recommendation-runs/{runId}',
    tags: ['Recommendations'],
    security: [{ bearerAuth: [] }],
    summary: 'Get a recommendation run',
    description: `Requires a bearer access token. ${ROLE_NOTE} Any run (not only the latest), with its stored scores.`,
    request: { params: registeredRunIdParamsSchema },
    responses: {
      200: {
        description: 'Run retrieved.',
        content: { 'application/json': { schema: runDetailResponseSchema } },
      },
      400: errorContent('runId path parameter is malformed.'),
      401: unauthorized,
      403: forbiddenStudent,
      404: errorContent('Recommendation run not found.'),
    },
  })

  registry.registerPath({
    method: 'get',
    path: '/api/v1/recommendations',
    tags: ['Recommendations'],
    security: [{ bearerAuth: [] }],
    summary: 'List latest recommendations across students',
    description: `Requires a bearer access token. ${ROLE_NOTE} Each student's latest run, flattened. ADVISOR results are always limited to their own students (advisorId is ignored); ADMIN may filter by a public advisorId. summary counts cover the whole filtered set, not just the page.`,
    request: { query: registeredListRecommendationsQuerySchema },
    responses: {
      200: {
        description: 'Recommendations retrieved.',
        content: {
          'application/json': { schema: recommendationListResponseSchema },
        },
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
    path: '/api/v1/settings/recommendation-weights',
    tags: ['Recommendations', 'Settings'],
    security: [{ bearerAuth: [] }],
    summary: 'Get the current recommendation weights',
    description:
      'Requires a bearer access token. Allowed roles: ADMIN, ADVISOR, OPERATIONS. The four weights always sum to 100.',
    responses: {
      200: {
        description: 'Current weights retrieved.',
        content: { 'application/json': { schema: weightsResponseSchema } },
      },
      401: unauthorized,
    },
  })

  registry.registerPath({
    method: 'put',
    path: '/api/v1/settings/recommendation-weights',
    tags: ['Recommendations', 'Settings'],
    security: [{ bearerAuth: [] }],
    summary: 'Save new recommendation weights',
    description:
      'Requires a bearer access token. Allowed roles: ADMIN only. Weights must be whole numbers that sum to exactly 100. Saves a new version (past runs keep the version they used). Audited as recommendation_weights.updated.',
    request: {
      body: {
        required: true,
        content: {
          'application/json': { schema: registeredUpdateWeightsSchema },
        },
      },
    },
    responses: {
      200: {
        description: 'New weights version saved.',
        content: { 'application/json': { schema: weightsResponseSchema } },
      },
      400: errorContent('Validation failed (e.g. weights do not sum to 100).'),
      401: unauthorized,
      403: errorContent('Only ADMIN may change recommendation weights.'),
    },
  })
}
