import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi'
import { z } from 'zod'
import { advisorIdSchema } from '../students/students.schemas.js'
import { AUDIT_ACTION_VALUES, AUDIT_ENTITY_TYPES } from './audit.actions.js'

extendZodWithOpenApi(z)

export class AuditSchemas {
  static listAuditLogsQuerySchema = z
    .object({
      action: z.enum(AUDIT_ACTION_VALUES).optional(),
      entityType: z.enum(AUDIT_ENTITY_TYPES).optional(),
      entityId: z.string().trim().min(1).max(64).optional(),
      // Public USR- id; the format is the same for every role.
      actorId: advisorIdSchema.optional(),
      from: z.coerce.date().optional(),
      to: z.coerce.date().optional(),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(20),
    })
    .refine((query) => !query.from || !query.to || query.from <= query.to, {
      message: '`from` must be before `to`',
      path: ['to'],
    })
}
