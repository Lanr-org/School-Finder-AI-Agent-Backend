import { createError } from '../../common/errors/AppError.js'
import { StudentsRepo } from '../students/students.repository.js'
import { MatchingRepo } from './matching.repository.js'
import { StudyLevel } from '../../generated/prisma/index.js'
import type { ProgramMatch } from './matching.types.js'

const STUDY_LEVEL_KEYWORDS: Record<StudyLevel, string[]> = {
  UNDERGRADUATE: ['undergrad', 'bachelor', 'bsc', 'first degree'],
  POSTGRADUATE: ['postgrad', 'master', 'msc', 'mba'],
  DOCTORATE: ['phd', 'doctorate', 'doctoral'],
  FOUNDATION: ['foundation', 'pre-university', 'access course'],
}

const normalizeStudyLevel = (raw: string | null): StudyLevel | undefined => {
  if (!raw) return undefined
  const lower = raw.toLowerCase()
  const match = (
    Object.entries(STUDY_LEVEL_KEYWORDS) as [StudyLevel, string[]][]
  ).find(([, keywords]) => keywords.some((kw) => lower.includes(kw)))
  return match?.[0]
}

// Maps abbreviations used by the Telegram destination buttons (e.g. "UK") to the full country
// names stored on Schools.country. Anything not listed here passes through as-is and is matched
// case-insensitively by the repo query, which covers plain casing differences on its own.
const COUNTRY_ALIASES: Record<string, string> = {
  UK: 'United Kingdom',
  USA: 'United States',
  US: 'United States',
}

export const normalizeCountry = (raw: string): string =>
  COUNTRY_ALIASES[raw.toUpperCase()] ?? raw

export class MatchingService {
  static FindMatchesForStudent = async (
    studentPublicId: string,
    limit = 10,
  ): Promise<ProgramMatch[]> => {
    const student = await StudentsRepo.findStudentByPublicId(studentPublicId)

    if (!student) {
      throw createError('Student not found', 404, {}, 'NOT_FOUND')
    }

    const studyLevel = normalizeStudyLevel(student.study_level)
    const countries =
      student.target_destinations.length > 0
        ? student.target_destinations.map(normalizeCountry)
        : undefined

    const programs = await MatchingRepo.findMatchingPrograms({
      studyLevel,
      countries,
      intakeMonth: student.target_intake_month ?? undefined,
      intakeYear: student.target_intake_year ?? undefined,
      limit,
    })

    return programs.map((program) => ({
      publicId: program.public_id,
      name: program.name,
      studyLevel: program.study_level,
      qualification: program.qualification,
      category: program.category,
      tuitionAmount: Number(program.tuition_amount),
      tuitionCurrency: program.tuition_currency,
      intakes: program.intakes.map((intake) => ({
        month: intake.month,
        year: intake.year,
        applicationDeadline: intake.application_deadline,
      })),
      school: {
        publicId: program.school.public_id,
        name: program.school.name,
        country: program.school.country,
        city: program.school.city,
      },
    }))
  }
}
