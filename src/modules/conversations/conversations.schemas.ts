import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi'
import { z } from 'zod'

extendZodWithOpenApi(z)

const conversationStatusEnum = z.enum(['ACTIVE', 'ESCALATED', 'RESOLVED'])

const advisorIdSchema = z
  .string()
  .trim()
  .regex(/^USR-[A-F0-9]{12}$/, 'Must be a valid advisor ID (e.g. USR-1A2B3C4D5E6F)')

export class ConversationsSchemas {
  static conversationIdParamsSchema = z.object({
    conversationId: z
      .string()
      .trim()
      .regex(/^CON-\d{4}$/, 'Must be a valid conversation ID (e.g. CON-4811)'),
  })

  static listConversationsQuerySchema = z.object({
    status: conversationStatusEnum.optional(),
    advisorId: advisorIdSchema.optional(),
    unassigned: z.coerce.boolean().optional(),
    search: z.string().trim().min(1).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })

  static createReplySchema = z.object({
    content: z.string().trim().min(1, 'Reply content is required').max(4000),
  })
}
