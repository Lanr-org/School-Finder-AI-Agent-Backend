import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi'
import { email, z } from 'zod'

extendZodWithOpenApi(z)

export class TeamSchemas {
  static invitationSchema = z.object({
    fullName: z
      .string()
      .trim()
      .min(2, 'Full name must be at least 2 characters'),
    email: z.string().trim().email('Must be a valid email address').max(160),
    role: z.enum(['ADMIN', 'ADVISOR', 'OPERATIONS']),
    phone: z.string().trim().min(3).max(40).nullable().optional(),
  })

  static updateMemberSchema = z
    .object({
      fullName: z
        .string()
        .trim()
        .min(2, 'Full name must be at least 2 characters')
        .optional(),
      email: z.string().trim().email('Must be a valid email address').max(160),
      phone: z.string().trim().min(3).max(40).nullable().optional(),
    }).refine(
    (data) =>
      data.fullName !== undefined ||
      data.email !== undefined ||
      data.phone !== undefined,
    {
      message: 'At least one field (fullName, email, or phone) must be provided',
    })

  static updateStatusSchema = z.object({
    status: z.enum(['ACTIVE', 'DISABLED']),
  })
}
