import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi'
import { z } from 'zod'
import { intakeMonthEnum } from '../programs/programs.schemas.js'
import { advisorIdSchema } from '../students/students.schemas.js'

extendZodWithOpenApi(z)

const applicationIdSchema = z
  .string()
  .trim()
  .regex(/^APP-\d{4}$/, 'Must be a valid application ID (e.g. APP-1048)')

const programIdSchema = z
  .string()
  .trim()
  .regex(/^PRG-\d{4}$/, 'Must be a valid program ID (e.g. PRG-1234)')

const statusEnum = z.enum([
  'DRAFT',
  'DOCUMENTS_PENDING',
  'SUBMITTED',
  'OFFER_RECEIVED',
  'VISA_PROCESSING',
  'COMPLETED',
  'REJECTED',
  'WITHDRAWN',
])

const intakeYearSchema = z.number().int().min(2000).max(2100)

// Month and year only make sense together — both set, or both absent/null.
const intakePaired = (data: { intakeMonth?: unknown; intakeYear?: unknown }) =>
  (data.intakeMonth === undefined) === (data.intakeYear === undefined) &&
  (data.intakeMonth === null) === (data.intakeYear === null)

const intakePairedMessage = {
  message: 'intakeMonth and intakeYear must be provided together',
  path: ['intakeYear'],
}

export class ApplicationsSchemas {
  static applicationIdParamsSchema = z.object({
    applicationId: applicationIdSchema,
  })

  static createApplicationSchema = z
    .object({
      programId: programIdSchema,
      intakeMonth: intakeMonthEnum.optional(),
      intakeYear: intakeYearSchema.optional(),
      externalReference: z.string().trim().min(1).max(100).optional(),
      notes: z.string().trim().min(1).max(5000).optional(),
    })
    .refine(intakePaired, intakePairedMessage)

  // null clears a field; omitted leaves it unchanged.
  static updateApplicationSchema = z
    .object({
      intakeMonth: intakeMonthEnum.nullable().optional(),
      intakeYear: intakeYearSchema.nullable().optional(),
      externalReference: z
        .string()
        .trim()
        .min(1)
        .max(100)
        .nullable()
        .optional(),
      notes: z.string().trim().min(1).max(5000).nullable().optional(),
    })
    .refine(
      (data) => Object.values(data).some((value) => value !== undefined),
      {
        message: 'At least one field must be provided',
      },
    )
    .refine(intakePaired, intakePairedMessage)

  static updateStatusSchema = z.object({
    status: statusEnum,
    note: z.string().trim().min(1).max(2000).optional(),
  })

  static listApplicationsQuerySchema = z.object({
    status: statusEnum.optional(),
    advisorId: advisorIdSchema.optional(),
    search: z.string().trim().min(1).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })

  static listStudentApplicationsQuerySchema = z.object({
    status: statusEnum.optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
}
