import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi'
import { z } from 'zod'

extendZodWithOpenApi(z)

const studyLevelEnum = z.enum(['UNDERGRADUATE', 'POSTGRADUATE', 'DOCTORATE', 'FOUNDATION'])
const intakeMonthEnum = z.enum([
  'JANUARY',
  'FEBRUARY',
  'MARCH',
  'APRIL',
  'MAY',
  'JUNE',
  'JULY',
  'AUGUST',
  'SEPTEMBER',
  'OCTOBER',
  'NOVEMBER',
  'DECEMBER',
])
const schoolIdSchema = z
  .string()
  .trim()
  .regex(/^SCH-\d{4}$/, 'Must be a valid school ID (e.g. SCH-1234)')

export class ProgramsSchemas {
  static programIdParamsSchema = z.object({
    programId: z
      .string()
      .trim()
      .regex(/^PRG-\d{4}$/, 'Must be a valid program ID (e.g. PRG-1234)'),
  })

  static createProgramSchema = z.object({
    name: z.string().trim().min(2, 'Name must be at least 2 characters').max(200),
    studyLevel: studyLevelEnum,
    qualification: z.string().trim().min(1).max(100),
    category: z.string().trim().min(1).max(120),
    duration: z.string().trim().min(1).max(50),
    schoolId: schoolIdSchema,

    tuitionAmount: z.number().positive('Tuition amount must be greater than 0'),
    tuitionCurrency: z.string().trim().length(3, 'Must be a 3-letter ISO currency code').toUpperCase(),
    scholarshipAvailability: z.string().trim().max(100).nullable().optional(),

    intakePeriods: z.array(intakeMonthEnum).optional(),
    applicationDeadline: z.coerce.date().nullable().optional(),
    primaryIntakeYear: z.number().int().min(2000).max(2100).nullable().optional(),

    academicRequirements: z.string().trim().max(5000).nullable().optional(),
    englishRequirements: z.string().trim().max(5000).nullable().optional(),
    operationNotes: z.string().trim().max(5000).nullable().optional(),
  })

  static updateProgramSchema = ProgramsSchemas.createProgramSchema.partial().refine(
    (data) => Object.keys(data).length > 0,
    { message: 'At least one field must be provided' },
  )

  static listProgramsQuerySchema = z.object({
    schoolId: schoolIdSchema.optional(),
    studyLevel: studyLevelEnum.optional(),
    category: z.string().trim().min(1).optional(),
    search: z.string().trim().min(1).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })

  // Used by GET /schools/:schoolId/programs — schoolId comes from the path, not the query.
  static listSchoolProgramsQuerySchema = z.object({
    studyLevel: studyLevelEnum.optional(),
    category: z.string().trim().min(1).optional(),
    search: z.string().trim().min(1).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
}
