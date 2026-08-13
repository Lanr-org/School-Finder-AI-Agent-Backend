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
  const match = (Object.entries(STUDY_LEVEL_KEYWORDS) as [StudyLevel, string[]][]).find(([, keywords]) =>
    keywords.some((kw) => lower.includes(kw)),
  )
  return match?.[0]
}

export class MatchingService {
  static FindMatchesForStudent = async (studentPublicId: string, limit = 10): Promise<ProgramMatch[]> => {
    const student = await StudentsRepo.findStudentByPublicId(studentPublicId)

    if (!student) {
      throw createError('Student not found', 404, {}, 'NOT_FOUND')
    }

    const studyLevel = normalizeStudyLevel(student.study_level)
    const countries = student.target_destinations.length > 0 ? student.target_destinations : undefined

    const programs = await MatchingRepo.findMatchingPrograms({ studyLevel, countries, limit })

    return programs.map((program) => ({
      publicId: program.public_id,
      name: program.name,
      studyLevel: program.study_level,
      qualification: program.qualification,
      category: program.category,
      tuitionAmount: Number(program.tuition_amount),
      tuitionCurrency: program.tuition_currency,
      school: {
        publicId: program.school.public_id,
        name: program.school.name,
        country: program.school.country,
        city: program.school.city,
      },
    }))
  }
}
