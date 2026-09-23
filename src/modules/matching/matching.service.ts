import { createError } from '../../common/errors/AppError.js'
import { StudentsRepo } from '../students/students.repository.js'
import { VisaRatesRepo } from '../visaRates/visaRates.repository.js'
import { RecommendationsRepo } from '../recommendations/recommendations.repository.js'
import {
  scoreProgram,
  type VisaRate,
} from '../recommendations/recommendations.scoring.js'
import { MatchingRepo } from './matching.repository.js'
import { normalizeCountry } from './matching.normalizers.js'
import type { ProgramMatch } from './matching.types.js'

const POOL_CAP = 300

export class MatchingService {
  // Ephemeral AI-grounding shortlist — called on every chat turn
  // (ai-reply.service.ts), so it must never write to the database. Shares the
  // same scoring core as the persisted recommendation-runs path
  // (RecommendationsService.GenerateRun) via recommendations.scoring.ts.
  static FindMatchesForStudent = async (
    studentPublicId: string,
    limit = 10,
  ): Promise<ProgramMatch[]> => {
    const student = await StudentsRepo.findStudentByPublicId(studentPublicId)

    if (!student) {
      throw createError('Student not found', 404, {}, 'NOT_FOUND')
    }

    const countries =
      student.target_destinations.length > 0
        ? student.target_destinations.map(normalizeCountry)
        : undefined

    const [candidates, { weights }] = await Promise.all([
      MatchingRepo.findMatchingPrograms({ countries, poolCap: POOL_CAP }),
      RecommendationsRepo.getCurrentWeights(),
    ])

    const rates = await VisaRatesRepo.findLatestActiveForCountries(
      countries ?? [],
    )
    const visaRateByCountry = new Map<string, VisaRate>(
      rates.map((rate) => [rate.country.toLowerCase(), rate]),
    )

    const scored = candidates
      .map((program) =>
        scoreProgram(student, program, weights, visaRateByCountry),
      )
      .sort((a, b) => b.overallScore - a.overallScore)
      .slice(0, limit)

    return scored.map(({ program }) => ({
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
