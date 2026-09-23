import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi'
import { z } from 'zod'

extendZodWithOpenApi(z)

export class BulletinsSchemas {
  static bulletinIdParamsSchema = z.object({
    bulletinId: z
      .string()
      .trim()
      .regex(/^BUL-\d{4}$/, 'Must be a valid bulletin ID (e.g. BUL-1048)'),
  })

  static listBulletinsQuerySchema = z.object({
    country: z.string().trim().min(1).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })

  static createBulletinSchema = z.object({
    title: z.string().trim().min(1).max(200),
    body: z.string().trim().min(1).max(5000),
    sourcePartner: z.string().trim().min(1).max(120).optional(),
    countries: z.array(z.string().trim().min(1).max(120)).max(30).optional(),
    publishedAt: z.coerce.date(),
    expiresAt: z.coerce.date().optional(),
  })

  static updateBulletinSchema = z
    .object({
      title: z.string().trim().min(1).max(200).optional(),
      body: z.string().trim().min(1).max(5000).optional(),
      sourcePartner: z.string().trim().min(1).max(120).nullable().optional(),
      countries: z.array(z.string().trim().min(1).max(120)).max(30).optional(),
      publishedAt: z.coerce.date().optional(),
      expiresAt: z.coerce.date().nullable().optional(),
      isActive: z.boolean().optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: 'At least one field must be provided',
    })
}
