import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi'
import { z } from 'zod'

extendZodWithOpenApi(z)

export class VisaRatesSchemas {
  static rateIdParamsSchema = z.object({
    rateId: z
      .string()
      .trim()
      .regex(
        /^VSR-\d{4}$/,
        'Must be a valid visa success rate ID (e.g. VSR-1048)',
      ),
  })

  static listVisaRatesQuerySchema = z.object({
    country: z.string().trim().min(1).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })

  static createVisaRateSchema = z.object({
    country: z.string().trim().min(1).max(120),
    sourcePartner: z.string().trim().min(1).max(120).optional(),
    periodLabel: z.string().trim().min(1).max(60),
    successRate: z.number().min(0).max(100),
    sampleSize: z.number().int().min(0).optional(),
    publishedAt: z.coerce.date(),
  })

  static updateVisaRateSchema = z
    .object({
      country: z.string().trim().min(1).max(120).optional(),
      sourcePartner: z.string().trim().min(1).max(120).nullable().optional(),
      periodLabel: z.string().trim().min(1).max(60).optional(),
      successRate: z.number().min(0).max(100).optional(),
      sampleSize: z.number().int().min(0).nullable().optional(),
      publishedAt: z.coerce.date().optional(),
      isActive: z.boolean().optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: 'At least one field must be provided',
    })
}
