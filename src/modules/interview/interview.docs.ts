import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi'
import { z } from 'zod'
import { errorContent, successEnvelope } from '../../docs/registry'
import { InterviewStatus, InterviewType } from '../../generated/prisma/index.js'
import { sessionIdParamsSchema, startInterviewSchema, submitAnswerSchema } from './interview.schemas'

const NOTE =
  "Student-facing API (the Smetase web app). Requires a student access token from /api/v1/student/auth; staff tokens are rejected. Only the signed-in student's own interviews are reachable. Practice only: the AI never states visa or admission rules as fact."

const unauthorized = errorContent('Missing, invalid or expired student token, or the session has ended.')
const json = <T extends z.ZodTypeAny>(schema: T) => ({ 'application/json': { schema } })

export const registerInterviewDocs = (registry: OpenAPIRegistry) => {
  const resultSchema = z.object({
    overallScore: z.number().openapi({ description: '0-100' }),
    summary: z.string(),
    strengths: z.array(z.string()),
    improvements: z.array(z.string()),
  })

  const turnSchema = registry.register(
    'InterviewTurn',
    z.object({
      sessionId: z.string().uuid(),
      feedback: z
        .object({
          tip: z.string(),
          score: z.number().int().openapi({ description: '0-10' }),
          sampleAnswer: z
            .string()
            .nullable()
            .openapi({ description: 'An example strong answer, given only when the score is 6 or lower.' }),
        })
        .nullable()
        .openapi({ description: 'Feedback on the answer just given; null right after starting.' }),
      nextQuestion: z
        .object({ index: z.number().int(), text: z.string() })
        .nullable()
        .openapi({ description: 'Null once the interview is finished.' }),
      result: resultSchema.nullable().openapi({ description: 'Set on the final turn.' }),
    }),
  )

  const sessionSchema = registry.register(
    'InterviewSession',
    z.object({
      id: z.string().uuid(),
      type: z.enum(InterviewType),
      status: z.enum(InterviewStatus),
      channel: z.enum(['TELEGRAM', 'WEB']),
      targetCountry: z.string().nullable(),
      programLabel: z.string().nullable(),
      questionCount: z.number().int(),
      createdAt: z.string().datetime(),
      completedAt: z.string().datetime().nullable(),
      result: resultSchema.nullable(),
      answers: z.array(
        z.object({
          index: z.number().int(),
          question: z.string(),
          answer: z.string().nullable(),
          tip: z.string().nullable(),
          sampleAnswer: z.string().nullable(),
          score: z.number().int().nullable(),
        }),
      ),
    }),
  )

  registry.registerPath({
    method: 'post',
    path: '/api/v1/student/interview-sessions',
    tags: ['Interview practice'],
    security: [{ bearerAuth: [] }],
    summary: 'Start a mock interview',
    description: `${NOTE} Starts a 5-question VISA or ADMISSION interview tailored to the student's destination and chosen programme, and returns the first question. One interview in progress per student; a daily limit applies.`,
    request: { body: { required: true, content: json(startInterviewSchema) } },
    responses: {
      201: { description: 'Started; returns the first question.', content: json(successEnvelope(turnSchema)) },
      400: errorContent('Validation failed.'),
      401: unauthorized,
      409: errorContent('An interview is already in progress (details.sessionId).'),
      429: errorContent("Daily interview limit or the platform's AI budget reached."),
    },
  })

  registry.registerPath({
    method: 'get',
    path: '/api/v1/student/interview-sessions',
    tags: ['Interview practice'],
    security: [{ bearerAuth: [] }],
    summary: 'List my interviews',
    description: `${NOTE} The 20 most recent interviews, newest first, with questions, answers, tips and results.`,
    responses: {
      200: { description: 'Interviews retrieved.', content: json(successEnvelope(z.array(sessionSchema))) },
      401: unauthorized,
    },
  })

  registry.registerPath({
    method: 'get',
    path: '/api/v1/student/interview-sessions/active',
    tags: ['Interview practice'],
    security: [{ bearerAuth: [] }],
    summary: 'Get my interview in progress',
    description: `${NOTE} Returns null when there is none. The open question is the last entry in answers with answer null.`,
    responses: {
      200: { description: 'Active interview, or null.', content: json(successEnvelope(sessionSchema.nullable())) },
      401: unauthorized,
    },
  })

  registry.registerPath({
    method: 'get',
    path: '/api/v1/student/interview-sessions/{sessionId}',
    tags: ['Interview practice'],
    security: [{ bearerAuth: [] }],
    summary: 'Get one interview',
    description: NOTE,
    request: { params: sessionIdParamsSchema },
    responses: {
      200: { description: 'Interview retrieved.', content: json(successEnvelope(sessionSchema)) },
      401: unauthorized,
      404: errorContent('Interview not found (or not yours).'),
    },
  })

  registry.registerPath({
    method: 'post',
    path: '/api/v1/student/interview-sessions/{sessionId}/answers',
    tags: ['Interview practice'],
    security: [{ bearerAuth: [] }],
    summary: 'Answer the current question',
    description: `${NOTE} Returns a tip and 0-10 score for the answer plus the next question; the fifth answer returns the final result instead. If the AI reply fails nothing is saved and the same question can be answered again.`,
    request: { params: sessionIdParamsSchema, body: { required: true, content: json(submitAnswerSchema) } },
    responses: {
      200: { description: 'Answer recorded.', content: json(successEnvelope(turnSchema)) },
      400: errorContent('Validation failed (empty or over 1500 characters).'),
      401: unauthorized,
      404: errorContent('Interview not found (or not yours).'),
      409: errorContent('Interview already finished, or the question was already answered.'),
      429: errorContent("The platform's AI budget is reached for today."),
    },
  })

  registry.registerPath({
    method: 'post',
    path: '/api/v1/student/interview-sessions/{sessionId}/abandon',
    tags: ['Interview practice'],
    security: [{ bearerAuth: [] }],
    summary: 'Stop an interview',
    description: `${NOTE} Marks an in-progress interview as abandoned so a new one can start.`,
    request: { params: sessionIdParamsSchema },
    responses: {
      200: {
        description: 'Stopped.',
        content: json(successEnvelope(z.object({ sessionId: z.string().uuid(), status: z.literal('ABANDONED') }))),
      },
      401: unauthorized,
      404: errorContent('No in-progress interview with that id.'),
    },
  })
}
