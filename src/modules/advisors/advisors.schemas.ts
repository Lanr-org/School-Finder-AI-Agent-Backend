import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi'
import { z } from 'zod'

extendZodWithOpenApi(z)

const availabilityEnum = z.enum(['AVAILABLE', 'LIMITED', 'UNAVAILABLE'])

const studentStatusEnum = z.enum([
  'NEW',
  'AWAITING_ASSIGNMENT',
  'ASSIGNED',
  'FOLLOW_UP',
  'APPLICATION_STARTED',
  'COMPLETED',
  'CLOSED',
])

const userPublicIdSchema = z
  .string()
  .trim()
  .regex(
    /^USR-[A-F0-9]{12}$/,
    'Must be a valid user ID (e.g. USR-1A2B3C4D5E6F)',
  )

export class AdvisorsSchemas {
  static advisorIdParamsSchema = z.object({
    advisorId: userPublicIdSchema,
  })

  static createAdvisorProfileSchema = z.object({
    userId: userPublicIdSchema,
    availability: availabilityEnum.optional(),
    maxCapacity: z.number().int().min(1).nullable().optional(),
  })

  static updateAdvisorProfileSchema = z
    .object({
      availability: availabilityEnum.optional(),
      maxCapacity: z.number().int().min(1).nullable().optional(),
    })
    .refine(
      (data) =>
        data.availability !== undefined || data.maxCapacity !== undefined,
      {
        message:
          'At least one field (availability or maxCapacity) must be provided',
      },
    )

  static updateOwnAvailabilitySchema = z.object({
    availability: availabilityEnum,
  })

  static listAdvisorStudentsQuerySchema = z.object({
    status: studentStatusEnum.optional(),
    search: z.string().trim().min(1).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
}
