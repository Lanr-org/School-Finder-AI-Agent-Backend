import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi'
import { z } from 'zod'
import type { RouteConfig } from '@asteasolutions/zod-to-openapi'
import { emptySuccessResponseSchema, errorContent, successEnvelope } from '../../docs/registry'
import { JourneyCheckKey } from '../../generated/prisma/index.js'
import { StudentsSchemas } from '../students/students.schemas.js'
import {
  chooseProgrammeSchema,
  journeyCheckParamsSchema,
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
          checklist: z.array(
            z.object({
              id: z.string(),
              label: z.string(),
              done: z.boolean(),
              checkKey: z
                .enum(JourneyCheckKey)
                .nullable()
                .openapi({ description: 'Set for steps ticked by hand; null for steps derived from data.' }),
              canTick: z.boolean().openapi({
                description:
                  'Whether this viewer may tick or untick it. Students: deposit and English only. False when the data already makes it done.',
              }),
            }),
          ),
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
    description: `${PORTAL_NOTE} Derived from data: the furthest open application first (DRAFT–SUBMITTED → APPLY, OFFER_RECEIVED → OFFER, VISA_PROCESSING/COMPLETED → VISA; rejected and withdrawn ignored), then profile completeness, then shortlist and choice. After an offer, the hand-ticked steps decide the stage: deposit paid → ENGLISH, English score received (or an actual result in the profile) → FUNDS, funds documents ready → VISA.`,
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

  const journeyCheckPath = (method: 'put' | 'delete'): RouteConfig => ({
    method,
    path: '/api/v1/student/journey/checks/{key}',
    tags: ['Student portal'],
    security: [{ bearerAuth: [] }],
    summary: method === 'put' ? 'Tick a journey step' : 'Untick a journey step',
    description: `${PORTAL_NOTE} For steps the system can't detect. Students may change DEPOSIT_PAID, ENGLISH_TEST_BOOKED and ENGLISH_SCORE_RECEIVED; the proof-of-funds steps are their advisor's. Idempotent. Audited as student.journey_check_set / student.journey_check_cleared.`,
    request: { params: journeyCheckParamsSchema },
    responses: {
      200: { description: 'Updated; returns the journey.', content: json(successEnvelope(journeySchema)) },
      400: errorContent('Unknown step key.'),
      401: unauthorized,
      403: errorContent('This step is updated by the advisor.'),
    },
  })
  registry.registerPath(journeyCheckPath('put'))
  registry.registerPath(journeyCheckPath('delete'))

  registry.registerPath({
    method: 'post',
    path: '/api/v1/student/study-plan/link',
    tags: ['Student portal'],
    security: [{ bearerAuth: [] }],
    summary: 'Create a public link to the study plan',
    description: `${PORTAL_NOTE} Returns a read-only link (student app /p/{token}) a parent or sponsor can open without signing in. Only a hash of the token is stored, so each call makes a new link; earlier links keep working for 90 days unless revoked. The linked page is live and always shows the current choice. Also records the first share (the "study plans shared" measure).`,
    responses: {
      201: {
        description: 'Link created.',
        content: json(successEnvelope(z.object({ url: z.string().url(), expiresAt: z.string() }))),
      },
      401: unauthorized,
      409: errorContent('No programme chosen yet.'),
    },
  })

  registry.registerPath({
    method: 'delete',
    path: '/api/v1/student/study-plan/link',
    tags: ['Student portal'],
    security: [{ bearerAuth: [] }],
    summary: 'Stop sharing the study plan',
    description: `${PORTAL_NOTE} Revokes every public link to the student's study plan. Idempotent.`,
    responses: {
      200: { description: 'Links revoked.', content: json(emptySuccessResponseSchema) },
      401: unauthorized,
    },
  })

  return { journeySchema, programmeMatchSchema, money }
}

// Staff view of the same journey, registered here because it reuses StudentJourney.
export const registerStaffJourneyDocs = (
  registry: OpenAPIRegistry,
  {
    registeredStudentIdParamsSchema,
    journeySchema,
  }: {
    registeredStudentIdParamsSchema: typeof StudentsSchemas.studentIdParamsSchema
    journeySchema: z.ZodTypeAny
  },
) => {
  const json = <T extends z.ZodTypeAny>(schema: T) => ({ 'application/json': { schema } })
  const staffNote =
    'ADMIN, or the ADVISOR assigned to the student. Staff may tick every hand-ticked step, including proof of funds.'

  registry.registerPath({
    method: 'get',
    path: '/api/v1/students/{studentId}/journey',
    tags: ['Students'],
    security: [{ bearerAuth: [] }],
    summary: "Get a student's journey",
    description: `${staffNote} Same shape the student sees; canTick is computed for staff.`,
    request: { params: registeredStudentIdParamsSchema },
    responses: {
      200: { description: 'Journey retrieved.', content: json(successEnvelope(journeySchema)) },
      400: errorContent('Invalid student ID.'),
      401: errorContent('Not authenticated.'),
      403: errorContent('Not ADMIN, and not the assigned advisor.'),
      404: errorContent('Student not found.'),
    },
  })

  const staffCheckPath = (method: 'put' | 'delete'): RouteConfig => ({
    method,
    path: '/api/v1/students/{studentId}/journey/checks/{key}',
    tags: ['Students'],
    security: [{ bearerAuth: [] }],
    summary: method === 'put' ? "Tick a student's journey step" : "Untick a student's journey step",
    description: `${staffNote} Idempotent. Records who ticked it, and audits student.journey_check_set / student.journey_check_cleared.`,
    request: { params: StudentsSchemas.journeyCheckParamsSchema },
    responses: {
      200: { description: 'Updated; returns the journey.', content: json(successEnvelope(journeySchema)) },
      400: errorContent('Invalid student ID or step key.'),
      401: errorContent('Not authenticated.'),
      403: errorContent('Not ADMIN, and not the assigned advisor.'),
      404: errorContent('Student not found.'),
    },
  })
  registry.registerPath(staffCheckPath('put'))
  registry.registerPath(staffCheckPath('delete'))
}
