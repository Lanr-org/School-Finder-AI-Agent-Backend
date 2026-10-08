import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi'
import { z } from 'zod'
import { errorContent, successEnvelope } from '../../docs/registry'

export const registerDashboardDocs = (registry: OpenAPIRegistry) => {
  const studentStatusCounts = z.object({
    NEW: z.number(),
    AWAITING_ASSIGNMENT: z.number(),
    ASSIGNED: z.number(),
    FOLLOW_UP: z.number(),
    APPLICATION_STARTED: z.number(),
    COMPLETED: z.number(),
    CLOSED: z.number(),
  })

  const summarySchema = z.object({
    scope: z.enum(['ALL', 'OWN']).openapi({
      description:
        'OWN for ADVISOR (their assigned students only); ALL otherwise.',
    }),
    generatedAt: z.date(),
    timezone: z.literal('Africa/Lagos').openapi({
      description:
        'Timezone that defines "today" and "this week" (weeks start Monday).',
    }),
    leads: z.object({
      total: z.number(),
      newThisWeek: z.number(),
      newToday: z.number(),
      newTodayFromTelegram: z.number(),
      unassigned: z.number().openapi({
        description: 'Students with no advisor that are not COMPLETED/CLOSED.',
      }),
      byStatus: studentStatusCounts,
      assignedShareOfOpen: z.number().openapi({
        description: 'Percent (0–100) of open students that have an advisor.',
      }),
    }),
    conversations: z.object({ active: z.number(), escalated: z.number() }),
    topDestinations: z.array(
      z.object({
        country: z.string(),
        leads: z.number(),
        percent: z
          .number()
          .openapi({ description: 'Share of all leads in scope.' }),
      }),
    ),
    advisorWorkload: z.array(
      z.object({
        advisorId: z.string(),
        fullName: z.string(),
        activeStudents: z.number(),
        pendingFollowUps: z.number(),
        maxCapacity: z.number().nullable(),
      }),
    ),
    pendingFollowUps: z
      .array(
        z.object({
          publicId: z.string(),
          studentId: z.string(),
          studentName: z.string(),
          description: z.string(),
          dueAt: z.date(),
          priority: z.enum(['NORMAL', 'HIGH', 'URGENT']),
          overdue: z.boolean(),
        }),
      )
      .nullable()
      .openapi({
        description: 'null for OPERATIONS (no student-level lists).',
      }),
    recentRecommendations: z
      .array(
        z.object({
          studentId: z.string(),
          studentName: z.string(),
          program: z.object({ publicId: z.string(), name: z.string() }),
          school: z.object({ publicId: z.string(), name: z.string() }),
          country: z.string(),
          overallScore: z.number(),
          createdAt: z.date(),
        }),
      )
      .nullable()
      .openapi({
        description: 'null for OPERATIONS (no student-level lists).',
      }),
  })

  const summaryResponseSchema = registry.register(
    'DashboardSummaryResponse',
    successEnvelope(summarySchema),
  )

  registry.registerPath({
    method: 'get',
    path: '/api/v1/dashboard/summary',
    tags: ['Dashboard'],
    security: [{ bearerAuth: [] }],
    summary: 'Operations dashboard summary',
    description:
      'Requires a bearer access token. Allowed roles: ADMIN, ADVISOR, OPERATIONS. Scope is taken from the token, never the client: ADMIN sees the whole operation; ADVISOR sees only their assigned students, those students’ conversations, their own follow-ups, and their own workload row; OPERATIONS sees organisation-wide counts and charts, with pendingFollowUps and recentRecommendations returned as null.',
    responses: {
      200: {
        description: 'Dashboard summary retrieved.',
        content: { 'application/json': { schema: summaryResponseSchema } },
      },
      401: errorContent('Bearer token is missing or invalid.'),
    },
  })
}
