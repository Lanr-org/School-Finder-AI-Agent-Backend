import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi'
import { z } from 'zod'

extendZodWithOpenApi(z)

const priorityEnum = z.enum(['NORMAL', 'HIGH', 'URGENT'])
const statusEnum = z.enum(['PENDING', 'COMPLETED', 'CANCELED', 'OVERDUE'])

const studentIdSchema = z
  .string()
  .trim()
  .regex(/^STU-\d{4}$/, 'Must be a valid student ID (e.g. STU-1048)')

export class FollowUpsSchemas {
  static studentIdParamsSchema = z.object({
    studentId: studentIdSchema,
  })

  static followUpIdParamsSchema = z.object({
    studentId: studentIdSchema,
    followUpId: z
      .string()
      .trim()
      .regex(/^FUP-\d{4}$/, 'Must be a valid follow-up ID (e.g. FUP-1048)'),
  })

  static createFollowUpSchema = z.object({
    dueAt: z.coerce.date(),
    priority: priorityEnum.optional(),
    description: z.string().trim().min(1).max(2000),
  })

  static updateFollowUpSchema = z
    .object({
      dueAt: z.coerce.date().optional(),
      priority: priorityEnum.optional(),
      description: z.string().trim().min(1).max(2000).optional(),
    })
    .refine(
      (data) =>
        data.dueAt !== undefined ||
        data.priority !== undefined ||
        data.description !== undefined,
      {
        message:
          'At least one field (dueAt, priority, or description) must be provided',
      },
    )

  static listFollowUpsQuerySchema = z.object({
    status: statusEnum.optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
}
