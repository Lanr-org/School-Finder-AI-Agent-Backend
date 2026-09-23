import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi'
import { z } from 'zod'
import { advisorIdSchema } from '../students/students.schemas.js'

extendZodWithOpenApi(z)

const weightField = z.number().int().min(0).max(100)

export class RecommendationsSchemas {
  static listRecommendationsQuerySchema = z.object({
    search: z.string().trim().min(1).optional(),
    country: z.string().trim().min(1).optional(),
    advisorId: advisorIdSchema.optional(),
    minScore: z.coerce.number().min(0).max(100).optional(),
    hasMissingRequirements: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })

  static runIdParamsSchema = z.object({
    runId: z
      .string()
      .trim()
      .regex(/^RUN-\d{4}$/, 'Must be a valid run ID (e.g. RUN-1048)'),
  })

  static studentProgramParamsSchema = z.object({
    studentId: z
      .string()
      .trim()
      .regex(/^STU-\d{4}$/, 'Must be a valid student ID (e.g. STU-1048)'),
    programId: z
      .string()
      .trim()
      .regex(/^PRG-\d{4}$/, 'Must be a valid program ID (e.g. PRG-1234)'),
  })

  static generateRunSchema = z.object({
    limit: z.coerce.number().int().min(1).max(50).default(10),
  })

  static createShortlistSchema = z.object({
    programId: z
      .string()
      .trim()
      .regex(/^PRG-\d{4}$/, 'Must be a valid program ID (e.g. PRG-1234)'),
  })

  static updateWeightsSchema = z
    .object({
      programWeight: weightField,
      budgetWeight: weightField,
      intakeWeight: weightField,
      visaWeight: weightField,
    })
    .refine(
      (data) =>
        data.programWeight +
          data.budgetWeight +
          data.intakeWeight +
          data.visaWeight ===
        100,
      { message: 'Weights must sum to exactly 100' },
    )
}
