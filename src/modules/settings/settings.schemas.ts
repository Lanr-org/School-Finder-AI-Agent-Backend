import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi'
import { z } from 'zod'

extendZodWithOpenApi(z)

const settingGroupKeyEnum = z.enum(['countries', 'categories', 'study-levels'])

export class SettingsSchemas {
  static groupKeyParamsSchema = z.object({
    groupKey: settingGroupKeyEnum,
  })

  static valueIdParamsSchema = z.object({
    groupKey: settingGroupKeyEnum,
    valueId: z.string().uuid(),
  })

  static createValueSchema = z.object({
    label: z.string().trim().min(1).max(160),
  })

  static updateValueSchema = z
    .object({
      label: z.string().trim().min(1).max(160).optional(),
      isActive: z.boolean().optional(),
    })
    .refine((data) => data.label !== undefined || data.isActive !== undefined, {
      message: 'At least one field (label or isActive) must be provided',
    })
}
