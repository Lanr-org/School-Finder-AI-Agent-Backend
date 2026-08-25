import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi'
import { z } from 'zod'

extendZodWithOpenApi(z)

const studentStatusEnum = z.enum([
  'NEW',
  'AWAITING_ASSIGNMENT',
  'ASSIGNED',
  'FOLLOW_UP',
  'APPLICATION_STARTED',
  'COMPLETED',
  'CLOSED',
])

const advisorIdSchema = z
  .string()
  .trim()
  .regex(/^USR-[A-F0-9]{12}$/, 'Must be a valid advisor ID (e.g. USR-1A2B3C4D5E6F)')

export class StudentsSchemas {
  static studentIdParamsSchema = z.object({
    studentId: z
      .string()
      .trim()
      .regex(/^STU-\d{4}$/, 'Must be a valid student ID (e.g. STU-1048)'),
  })

  static listStudentsQuerySchema = z.object({
    status: studentStatusEnum.optional(),
    advisorId: advisorIdSchema.optional(),
    search: z.string().trim().min(1).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })

  static assignAdvisorSchema = z.object({
    advisorId: advisorIdSchema.nullable(),
  })
}
