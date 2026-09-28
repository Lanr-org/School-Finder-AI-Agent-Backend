import { z } from 'zod'
import { IntakeMonth } from '../../generated/prisma/index.js'

// Same codes the Telegram bot writes, so matching treats both channels the same.
export const STUDY_LEVEL_CODES = ['MASTERS', 'BACHELORS', 'PHD', 'DIPLOMA'] as const

// Telegram's four, plus other countries we have programmes in. The matcher maps UK/USA
// to full names and matches the rest case-insensitively against schools.country.
export const DESTINATION_CODES = [
  'UK',
  'USA',
  'CANADA',
  'IRELAND',
  'AUSTRALIA',
  'GERMANY',
  'NETHERLANDS',
  'NEW ZEALAND',
] as const

const thisYear = new Date().getFullYear()

export const updateProfileSchema = z
  .object({
    studyLevel: z.enum(STUDY_LEVEL_CODES).optional(),
    destinations: z.array(z.enum(DESTINATION_CODES)).min(1).max(5).optional(),
    intake: z
      .object({
        month: z.enum(IntakeMonth),
        year: z.number().int().min(thisYear).max(thisYear + 10),
      })
      .optional(),
    budgetRange: z.string().trim().min(1).max(100).optional(),
    // Free text, e.g. "BSc Computer Science, 2:1" or "WAEC, 7 credits".
    academicBackground: z.string().trim().min(2).max(300).optional(),
    // e.g. "IELTS 6.5", "IELTS booked", "Not taken yet", "WAEC English credit".
    englishTest: z.string().trim().min(1).max(100).optional(),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: 'Provide at least one field to update',
  })

export const programIdParamsSchema = z.object({
  programId: z.string().trim().min(1).max(24),
})

export const chooseProgrammeSchema = z.object({
  programId: z.string().trim().min(1).max(24),
})

export const sendMessageSchema = z.object({
  content: z.string().trim().min(1).max(2000),
})
