import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi'
import { z } from 'zod'

extendZodWithOpenApi(z)

const schoolTypeEnum = z.enum(['UNIVERSITY', 'COLLEGE', 'INSTITUTE', 'POLYTECHNIC'])
const schoolRecordStatusEnum = z.enum(['ACTIVE', 'INACTIVE'])
const partnerStatusEnum = z.enum(['PARTNER', 'PROSPECT', 'NON_PARTNER'])

export class SchoolsSchemas {
  static schoolIdParamsSchema = z.object({
    schoolId: z
      .string()
      .trim()
      .regex(/^SCH-\d{4}$/, 'Must be a valid school ID (e.g. SCH-1234)'),
  })

  static createSchoolSchema = z.object({
    name: z.string().trim().min(2, 'Name must be at least 2 characters').max(200),
    schoolType: schoolTypeEnum,
    recordStatus: schoolRecordStatusEnum.optional(),
    description: z.string().trim().max(5000).nullable().optional(),

    website: z.string().trim().url('Must be a valid URL').max(255).nullable().optional(),
    admissionsEmail: z.string().trim().email('Must be a valid email address').max(255).nullable().optional(),
    phoneNumbers: z.array(z.string().trim().min(3).max(40)).optional(),

    streetAddress: z.string().trim().max(255).nullable().optional(),
    city: z.string().trim().min(1).max(120),
    country: z.string().trim().min(1).max(120),
    postalCode: z.string().trim().max(20).nullable().optional(),

    partnerStatus: partnerStatusEnum.optional(),
    visaFriendlinessScore: z.number().int().min(0).max(100).nullable().optional(),
    visaFriendlinessNotes: z.string().trim().max(5000).nullable().optional(),
    admissionFriendlinessScore: z.number().int().min(0).max(100).nullable().optional(),
    admissionFriendlinessNotes: z.string().trim().max(5000).nullable().optional(),
    rankingReputationNotes: z.string().trim().max(5000).nullable().optional(),
  })

  static updateSchoolSchema = SchoolsSchemas.createSchoolSchema.partial().refine(
    (data) => Object.keys(data).length > 0,
    { message: 'At least one field must be provided' },
  )

  static listSchoolsQuerySchema = z.object({
    country: z.string().trim().min(1).optional(),
    city: z.string().trim().min(1).optional(),
    schoolType: schoolTypeEnum.optional(),
    partnerStatus: partnerStatusEnum.optional(),
    recordStatus: schoolRecordStatusEnum.optional(),
    search: z.string().trim().min(1).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
}
