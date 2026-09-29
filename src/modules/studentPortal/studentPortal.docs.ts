import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi'
import { z } from 'zod'
import { emptySuccessResponseSchema, errorContent, successEnvelope } from '../../docs/registry'
import {
  chooseProgrammeSchema,
  programIdParamsSchema,
  sendMessageSchema,
  updateProfileSchema,
} from './studentPortal.schemas'

const PORTAL_NOTE =
  "Student-facing API (the Smetase web app). Requires a student access token from /api/v1/student/auth; staff tokens are rejected. Every route reads and changes only the signed-in student's own record, identified from the token."

const unauthorized = errorContent('Missing, invalid or expired student token, or the session has ended.')

export const registerStudentPortalDocs = (registry: OpenAPIRegistry) => {
  const money = z.object({ amount: z.number(), currency: z.string().openapi({ description: 'ISO 4217 code' }) })

  const studentMeSchema = registry.register(
    'StudentMe',
    z.object({
      publicId: z.string(),
      firstName: z.string(),
      fullName: z.string(),
      email: z.string().email().nullable(),
      studyLevel: z.string().nullable(),
      destinations: z.array(z.string()),
      intake: z.object({ month: z.string(), year: z.number() }).nullable(),
      budgetRange: z.string().nullable(),
      academicBackground: z.string().nullable(),
      englishTest: z.string().nullable(),
      advisor: z
        .object({
          name: z.string(),
          handling: z.boolean().openapi({ description: 'true when the conversation has been handed to this advisor' }),
        })
        .nullable(),
      conversationMode: z.enum(['AI_BOT', 'HUMAN_ADVISOR']),
      telegramLinked: z.boolean().openapi({ description: 'true once a Telegram account is linked to this student' }),
    }),
  )

  const journeySchema = registry.register(
    'StudentJourney',
    z.object({
      currentStage: z.enum(['PROFILE', 'EXPLORE', 'CHOOSE', 'APPLY', 'OFFER', 'ENGLISH', 'FUNDS', 'VISA']),
      stages: z.array(
        z.object({
          key: z.string(),
          title: z.string(),
          description: z.string(),
          status: z.enum(['DONE', 'CURRENT', 'UPCOMING']),
          owner: z.enum(['YOU', 'SMETASE', 'ADVISOR']),
          checklist: z.array(z.object({ id: z.string(), label: z.string(), done: z.boolean() })),
        }),
      ),
      nextStep: z.object({
        title: z.string(),
        description: z.string(),
        action: z.object({ label: z.string(), target: z.enum(['CHAT', 'PLAN', 'STUDY_PLAN']) }).nullable(),
      }),
    }),
  )

  const programmeMatchSchema = registry.register(
    'ProgrammeMatch',
    z.object({
      programmeId: z.string(),
      programmeName: z.string(),
      level: z.string(),
      schoolName: z.string(),
      city: z.string(),
      country: z.string(),
      duration: z.string(),
      intakes: z.array(z.string()).openapi({ example: ['September 2027'] }),
      tuition: money,
      scores: z.object({
        overall: z.number(),
        programmeFit: z.number(),
        budgetFit: z.number(),
        intakeFit: z.number(),
        visaFit: z.number(),
      }),
      reasons: z.array(z.string()),
      missingRequirements: z.array(z.string()),
      shortlisted: z.boolean(),
      chosen: z.boolean(),
    }),
  )

  const studyPlanSchema = registry.register(
    'StudyPlan',
    z.object({
      studentName: z.string(),
      programme: programmeMatchSchema,
      costBreakdown: z.array(z.object({ label: z.string(), amount: money })),
      total: money,
      requirementsMet: z.array(z.string()),
      requirementsMissing: z.array(z.string()),
      nextSteps: z.array(z.object({ title: z.string(), when: z.string() })),
      advisor: z.object({ name: z.string(), email: z.string().nullable() }).nullable(),
      generatedAt: z.string(),
    }),
  )

  const json = <T extends z.ZodTypeAny>(schema: T) => ({ 'application/json': { schema } })

  registry.registerPath({
    method: 'get',
    path: '/api/v1/student/me',
    tags: ['Student portal'],
    security: [{ bearerAuth: [] }],
    summary: "Get the signed-in student's profile",
    description: `${PORTAL_NOTE} Includes the profile fields, the assigned advisor (if any) and whether the conversation is currently with them.`,
    responses: {
      200: { description: 'Student retrieved.', content: json(successEnvelope(studentMeSchema)) },
      401: unauthorized,
    },
  })

  registry.registerPath({
    method: 'patch',
    path: '/api/v1/student/me/profile',
    tags: ['Student portal'],
    security: [{ bearerAuth: [] }],
    summary: "Update the signed-in student's profile",
    description: `${PORTAL_NOTE} Uses the same codes the Telegram bot writes (study level MASTERS/BACHELORS/PHD/DIPLOMA; destinations such as UK, USA, CANADA), so matching treats both channels the same. Academic background and English test are free text. At least one field is required.`,
    request: { body: { required: true, content: json(updateProfileSchema) } },
    responses: {
      200: { description: 'Profile updated; returns the updated profile.', content: json(successEnvelope(studentMeSchema)) },
      400: errorContent('Validation failed (unknown code, year out of range, or an empty body).'),
      401: unauthorized,
    },
  })

  registry.registerPath({
    method: 'get',
    path: '/api/v1/student/journey',
    tags: ['Student portal'],
    security: [{ bearerAuth: [] }],
    summary: "Get the signed-in student's journey",
    description: `${PORTAL_NOTE} Derived from data: the furthest open application first (DRAFT–SUBMITTED → APPLY, OFFER_RECEIVED → OFFER, VISA_PROCESSING/COMPLETED → VISA; rejected and withdrawn ignored), then profile completeness, then shortlist and choice. ENGLISH and FUNDS aren't detected yet.`,
    responses: {
      200: { description: 'Journey retrieved.', content: json(successEnvelope(journeySchema)) },
      401: unauthorized,
    },
  })

  registry.registerPath({
    method: 'get',
    path: '/api/v1/student/matches',
    tags: ['Student portal'],
    security: [{ bearerAuth: [] }],
    summary: 'Get programme matches for the signed-in student',
    description: `${PORTAL_NOTE} Scores programmes at active schools in the student's destinations live (the same scorer as recommendation runs, nothing saved) and returns the top 10 by overall score, plus any shortlisted or chosen programme so saved ones never disappear.`,
    responses: {
      200: { description: 'Matches retrieved.', content: json(successEnvelope(z.array(programmeMatchSchema))) },
      401: unauthorized,
    },
  })

  registry.registerPath({
    method: 'post',
    path: '/api/v1/student/shortlist/{programId}',
    tags: ['Student portal'],
    security: [{ bearerAuth: [] }],
    summary: 'Add a programme to the shortlist',
    description: `${PORTAL_NOTE} Adding the same programme twice is harmless.`,
    request: { params: programIdParamsSchema },
    responses: {
      200: { description: 'Added; returns the scored programme.', content: json(successEnvelope(programmeMatchSchema)) },
      401: unauthorized,
      404: errorContent('Programme not found, or its school is inactive.'),
    },
  })

  registry.registerPath({
    method: 'delete',
    path: '/api/v1/student/shortlist/{programId}',
    tags: ['Student portal'],
    security: [{ bearerAuth: [] }],
    summary: 'Remove a programme from the shortlist',
    description: `${PORTAL_NOTE} Removing the chosen programme also clears the choice. Works even if the school has since become inactive.`,
    request: { params: programIdParamsSchema },
    responses: {
      200: { description: 'Removed; returns the scored programme.', content: json(successEnvelope(programmeMatchSchema)) },
      401: unauthorized,
      404: errorContent('Programme not found.'),
    },
  })

  registry.registerPath({
    method: 'post',
    path: '/api/v1/student/choice',
    tags: ['Student portal'],
    security: [{ bearerAuth: [] }],
    summary: 'Choose a programme',
    description: `${PORTAL_NOTE} Sets the student's chosen programme and shortlists it. Doesn't create an application; staff do that.`,
    request: { body: { required: true, content: json(chooseProgrammeSchema) } },
    responses: {
      200: { description: 'Programme chosen; returns the updated journey.', content: json(successEnvelope(journeySchema)) },
      400: errorContent('Validation failed.'),
      401: unauthorized,
      404: errorContent('Programme not found, or its school is inactive.'),
    },
  })

  registry.registerPath({
    method: 'get',
    path: '/api/v1/student/study-plan',
    tags: ['Student portal'],
    security: [{ bearerAuth: [] }],
    summary: "Get the signed-in student's study plan",
    description: `${PORTAL_NOTE} A one-page summary to share with a parent, sponsor or anyone helping the student. \`data\` is null until a programme is chosen. The cost table holds only the programme's real tuition: living and visa costs aren't in our data and are never estimated.`,
    responses: {
      200: {
        description: 'Study plan retrieved (data is null before a programme is chosen).',
        content: json(successEnvelope(studyPlanSchema.nullable())),
      },
      401: unauthorized,
    },
  })

  const chatMessageSchema = registry.register(
    'StudentChatMessage',
    z.object({
      id: z.string().uuid(),
      senderType: z.enum(['STUDENT', 'AGENT', 'ADVISOR', 'SYSTEM']),
      senderName: z
        .string()
        .nullable()
        .openapi({ description: '"Smetase AI" for the AI, the advisor\'s name for advisor messages, null for the student.' }),
      content: z.string(),
      channel: z.enum(['TELEGRAM', 'WEB']),
      createdAt: z.date(),
    }),
  )

  registry.registerPath({
    method: 'get',
    path: '/api/v1/student/messages',
    tags: ['Student portal'],
    security: [{ bearerAuth: [] }],
    summary: "Get the signed-in student's chat",
    description: `${PORTAL_NOTE} The latest 50 messages across all the student's conversations and both channels (Telegram and web), oldest first. advisorHandling is true once an advisor has taken over; the AI doesn't reply until it's handed back. The web app polls this for advisor replies.`,
    responses: {
      200: {
        description: 'Messages retrieved.',
        content: json(
          successEnvelope(z.object({ messages: z.array(chatMessageSchema), advisorHandling: z.boolean() })),
        ),
      },
      401: unauthorized,
    },
  })

  registry.registerPath({
    method: 'post',
    path: '/api/v1/student/messages',
    tags: ['Student portal'],
    security: [{ bearerAuth: [] }],
    summary: 'Send a chat message',
    description: `${PORTAL_NOTE} Saves the message on the web channel. While the AI handles the conversation, its reply is generated in the same request and returned after the student's message; once an advisor has taken over, only the student's message is returned and the advisor answers later. If there's no open conversation (the last one was resolved), a new one is started. Limited to 20 messages a minute per student.`,
    request: { body: { required: true, content: json(sendMessageSchema) } },
    responses: {
      201: {
        description: "Message saved; returns it, plus the AI's reply when there is one.",
        content: json(successEnvelope(z.object({ messages: z.array(chatMessageSchema) }))),
      },
      400: errorContent('Validation failed (empty, or longer than 2000 characters).'),
      401: unauthorized,
      429: errorContent('More than 20 messages in a minute.'),
    },
  })

  registry.registerPath({
    method: 'post',
    path: '/api/v1/student/study-plan/shared',
    tags: ['Student portal'],
    security: [{ bearerAuth: [] }],
    summary: 'Record that the study plan was shared',
    description: `${PORTAL_NOTE} Sets the first-share time (later shares don't change it). Feeds the "study plans shared" measure.`,
    responses: {
      200: { description: 'Share recorded.', content: json(emptySuccessResponseSchema) },
      401: unauthorized,
    },
  })
}
