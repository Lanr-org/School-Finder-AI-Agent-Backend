import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi'
import { z } from 'zod'
import { errorContent, successEnvelope } from '../../docs/registry'
import { studyPlanTokenParamsSchema } from './studyPlanLinks.schemas'

// The public study plan reuses the portal's ProgrammeMatch and money shapes.
export const registerStudyPlanLinkDocs = (
  registry: OpenAPIRegistry,
  {
    programmeMatchSchema,
    money,
  }: { programmeMatchSchema: z.ZodTypeAny; money: z.ZodTypeAny },
) => {
  const publicStudyPlanSchema = registry.register(
    'PublicStudyPlan',
    z.object({
      studentFirstName: z
        .string()
        .openapi({
          description: 'First name only; no full name, email or ids.',
        }),
      programme: programmeMatchSchema,
      costBreakdown: z.array(z.object({ label: z.string(), amount: money })),
      total: money,
      requirementsMet: z.array(z.string()),
      requirementsMissing: z.array(z.string()),
      nextSteps: z.array(z.object({ title: z.string(), when: z.string() })),
      advisor: z
        .object({ name: z.string(), email: z.string().nullable() })
        .nullable(),
      generatedAt: z.string(),
    }),
  )

  registry.registerPath({
    method: 'get',
    path: '/api/v1/public/study-plans/{token}',
    tags: ['Public'],
    summary: 'Open a shared study plan',
    description:
      "Public, no sign-in: the token from a student's share link is the only credential. Returns the student's current study plan (live, so it follows their choice). Rate limited to 30 requests a minute per IP; responses are sent with Cache-Control: no-store and X-Robots-Tag: noindex. Unknown, expired and revoked links, and plans with no chosen programme, all get the same 404.",
    request: { params: studyPlanTokenParamsSchema },
    responses: {
      200: {
        description: 'Study plan retrieved.',
        content: {
          'application/json': {
            schema: successEnvelope(publicStudyPlanSchema),
          },
        },
      },
      400: errorContent('Malformed token.'),
      404: errorContent('This study plan link is not available.'),
      429: errorContent('Too many requests.'),
    },
  })
}
