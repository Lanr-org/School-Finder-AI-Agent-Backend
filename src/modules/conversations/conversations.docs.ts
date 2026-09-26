import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi'
import { z } from 'zod'
import { ConversationsSchemas } from './conversations.schemas'
import {
  errorContent,
  paginationSchema,
  staffRefSchema,
  successEnvelope,
} from '../../docs/registry'

const ROLE_NOTE =
  'Allowed roles: ADMIN (any conversation) and ADVISOR (conversations of their assigned students only — enforced server-side).'

export const registerConversationsDocs = (registry: OpenAPIRegistry) => {
  const modeEnum = z.enum(['AI_BOT', 'HUMAN_ADVISOR'])
  const statusEnum = z.enum(['ACTIVE', 'ESCALATED', 'RESOLVED'])

  // Mirrors toConversationSummary (conversations.service.ts).
  const summaryStudentSchema = z.object({
    publicId: z.string(),
    firstName: z.string(),
    lastName: z.string().nullable(),
    assignedAdvisor: staffRefSchema.nullable(),
  })
  const conversationSummarySchema = z.object({
    publicId: z.string(),
    mode: modeEnum.openapi({
      description: 'Who replies right now: the AI bot or a human advisor.',
    }),
    status: statusEnum,
    lastActivityAt: z.date(),
    createdAt: z.date(),
    student: summaryStudentSchema,
  })
  const messageSchema = z.object({
    senderType: z.enum(['STUDENT', 'AGENT', 'ADVISOR', 'SYSTEM']),
    content: z.string(),
    createdAt: z.date(),
  })

  const conversationSummaryResponseSchema = registry.register(
    'ConversationSummaryResponse',
    successEnvelope(conversationSummarySchema),
  )
  const conversationListResponseSchema = registry.register(
    'ConversationListResponse',
    successEnvelope(
      z.object({
        conversations: z.array(conversationSummarySchema),
        pagination: paginationSchema,
      }),
    ),
  )
  const conversationDetailResponseSchema = registry.register(
    'ConversationDetailResponse',
    successEnvelope(
      conversationSummarySchema.extend({
        student: summaryStudentSchema.extend({
          email: z.string().nullable(),
          phone: z.string().nullable(),
        }),
        messages: z.array(messageSchema),
      }),
    ),
  )
  const replyResponseSchema = registry.register(
    'ConversationReplyResponse',
    successEnvelope(
      messageSchema.extend({
        delivered: z.boolean().openapi({
          description:
            'Whether Telegram accepted the message. false means it was saved but not delivered.',
        }),
      }),
    ),
  )

  const registeredConversationIdParamsSchema = registry.register(
    'ConversationIdParams',
    ConversationsSchemas.conversationIdParamsSchema,
  )
  const registeredListConversationsQuerySchema = registry.register(
    'ListConversationsQuery',
    ConversationsSchemas.listConversationsQuerySchema,
  )
  const registeredCreateReplySchema = registry.register(
    'CreateReplyRequest',
    ConversationsSchemas.createReplySchema,
  )

  const unauthorized = errorContent('Bearer token is missing or invalid.')
  const forbidden = errorContent(
    "Role not allowed, or the conversation's student is not assigned to this advisor.",
  )
  const notFound = errorContent('Conversation not found.')

  registry.registerPath({
    method: 'get',
    path: '/api/v1/conversations',
    tags: ['Conversations'],
    security: [{ bearerAuth: [] }],
    summary: 'List conversations',
    description: `Requires a bearer access token. ${ROLE_NOTE} ADVISOR results are always limited to their own students (advisorId and unassigned are ignored). ADMIN may filter by a public advisorId, or unassigned=true for conversations whose student has no advisor (false or omitted applies no filter). search matches the student ID and first/last name. Most recent activity first.`,
    request: { query: registeredListConversationsQuerySchema },
    responses: {
      200: {
        description: 'Conversations retrieved.',
        content: {
          'application/json': { schema: conversationListResponseSchema },
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
    path: '/api/v1/conversations/{conversationId}',
    tags: ['Conversations'],
    security: [{ bearerAuth: [] }],
    summary: 'Get a conversation with its messages',
    description: `Requires a bearer access token. ${ROLE_NOTE} Returns up to the 100 most recent messages, oldest first, plus the student's contact details.`,
    request: { params: registeredConversationIdParamsSchema },
    responses: {
      200: {
        description: 'Conversation retrieved.',
        content: {
          'application/json': { schema: conversationDetailResponseSchema },
        },
      },
      400: errorContent('conversationId path parameter is malformed.'),
      401: unauthorized,
      403: forbidden,
      404: notFound,
    },
  })

  registry.registerPath({
    method: 'post',
    path: '/api/v1/conversations/{conversationId}/replies',
    tags: ['Conversations'],
    security: [{ bearerAuth: [] }],
    summary: 'Reply to the student as an advisor',
    description: `Requires a bearer access token. ${ROLE_NOTE} Saves the reply as an ADVISOR message and sends it to the student on Telegram. If Telegram delivery fails, the reply is still saved and delivered is false.`,
    request: {
      params: registeredConversationIdParamsSchema,
      body: {
        required: true,
        content: {
          'application/json': { schema: registeredCreateReplySchema },
        },
      },
    },
    responses: {
      201: {
        description: 'Reply saved (and delivered if delivered is true).',
        content: { 'application/json': { schema: replyResponseSchema } },
      },
      400: errorContent('Request validation failed.'),
      401: unauthorized,
      403: forbidden,
      404: notFound,
    },
  })

  registry.registerPath({
    method: 'post',
    path: '/api/v1/conversations/{conversationId}/escalate',
    tags: ['Conversations'],
    security: [{ bearerAuth: [] }],
    summary: 'Escalate to a human advisor',
    description: `Requires a bearer access token. ${ROLE_NOTE} Sets status ESCALATED and mode HUMAN_ADVISOR, so the AI stops replying on this thread.`,
    request: { params: registeredConversationIdParamsSchema },
    responses: {
      200: {
        description: 'Conversation escalated.',
        content: {
          'application/json': { schema: conversationSummaryResponseSchema },
        },
      },
      400: errorContent('conversationId path parameter is malformed.'),
      401: unauthorized,
      403: forbidden,
      404: notFound,
    },
  })

  registry.registerPath({
    method: 'post',
    path: '/api/v1/conversations/{conversationId}/resolve',
    tags: ['Conversations'],
    security: [{ bearerAuth: [] }],
    summary: 'Mark a conversation resolved',
    description: `Requires a bearer access token. ${ROLE_NOTE} Sets status RESOLVED and leaves mode unchanged. The student's next message starts a new conversation thread.`,
    request: { params: registeredConversationIdParamsSchema },
    responses: {
      200: {
        description: 'Conversation resolved.',
        content: {
          'application/json': { schema: conversationSummaryResponseSchema },
        },
      },
      400: errorContent('conversationId path parameter is malformed.'),
      401: unauthorized,
      403: forbidden,
      404: notFound,
    },
  })

  registry.registerPath({
    method: 'post',
    path: '/api/v1/conversations/{conversationId}/handback',
    tags: ['Conversations'],
    security: [{ bearerAuth: [] }],
    summary: 'Hand the conversation back to the AI',
    description: `Requires a bearer access token. ${ROLE_NOTE} Sets mode AI_BOT and status ACTIVE on the same thread, keeping its message history (unlike resolve).`,
    request: { params: registeredConversationIdParamsSchema },
    responses: {
      200: {
        description: 'Conversation handed back to the AI.',
        content: {
          'application/json': { schema: conversationSummaryResponseSchema },
        },
      },
      400: errorContent('conversationId path parameter is malformed.'),
      401: unauthorized,
      403: forbidden,
      404: notFound,
      409: errorContent(
        'The conversation is not currently handled by an advisor.',
      ),
    },
  })
}
