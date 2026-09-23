import type { IntakeMonth } from '../../generated/prisma/index.js'
import { normalizeStudyLevel } from '../matching/matching.normalizers.js'
import type { MatchingRepo } from '../matching/matching.repository.js'
import type { StudentsRepo } from '../students/students.repository.js'
import type { VisaRatesRepo } from '../visaRates/visaRates.repository.js'
import type { ProgramFitBreakdown, ScoredFit } from './recommendations.types.js'

// Pure, synchronous, fully unit-testable — no Prisma/DB access here. Both
// MatchingService (ephemeral AI-grounding shortlist) and RecommendationsService
// (persisted recommendation runs) fetch their own data and call scoreProgram,
// which is the single shared scoring core between the two.

export type CandidateStudent = NonNullable<
  Awaited<ReturnType<typeof StudentsRepo.findStudentByPublicId>>
>
export type CandidateProgram = Awaited<
  ReturnType<typeof MatchingRepo.findMatchingPrograms>
>[number]
export type VisaRate = Awaited<
  ReturnType<typeof VisaRatesRepo.findLatestActiveForCountries>
>[number]

export interface RecommendationWeightsInput {
  programWeight: number
  budgetWeight: number
  intakeWeight: number
  visaWeight: number
}

export interface ScoredProgram {
  program: CandidateProgram
  fits: ProgramFitBreakdown
  overallScore: number
  reasons: string[]
  missingRequirements: string[]
}

const clamp = (value: number): number => Math.max(0, Math.min(100, value))

// programFit: study-level match (reused keyword-based normalizer — free-text
// Student.study_level has no other structured signal today) plus whether the
// student has *something* on file to weigh against each requirement field.
// Genuinely deterministic given today's data; not a real admissions read.
export const scoreProgramFit = (
  student: CandidateStudent,
  program: CandidateProgram,
): ScoredFit => {
  const reasons: string[] = []
  const missingRequirements: string[] = []

  const studentLevel = normalizeStudyLevel(student.study_level)
  let score: number
  if (studentLevel === undefined) {
    score = 50
    missingRequirements.push('Study level not specified')
  } else if (studentLevel === program.study_level) {
    score = 70
    reasons.push(
      `Study level matches this ${program.study_level.toLowerCase()} program`,
    )
  } else {
    score = 20
    reasons.push(
      `Student is targeting ${studentLevel.toLowerCase()} while this program is ${program.study_level.toLowerCase()}`,
    )
  }

  if (!program.academic_requirements) {
    score += 15
  } else if (student.academic_background) {
    score += 15
    reasons.push(
      'Academic background on file to weigh against entry requirements',
    )
  } else {
    missingRequirements.push(
      'Academic background not provided — cannot verify against entry requirements',
    )
  }

  if (!program.english_requirements) {
    score += 15
  } else if (student.english_test_score) {
    score += 15
    reasons.push('English test score on file')
  } else {
    missingRequirements.push(
      'English test score not provided — cannot verify against entry requirements',
    )
  }

  return { score: clamp(score), reasons, missingRequirements }
}

// Lenient free-text parse of Student.budget_range ("10k-20k", "$15,000",
// "under 20000", a bare ceiling). No producer populates this field with a
// guaranteed format today, so this is a best-effort heuristic, not a real
// numeric field — see plan decision on shipping against today's data.
const parseBudgetCeiling = (raw: string | null): number | undefined => {
  if (!raw) return undefined
  const normalized = raw.toLowerCase().replace(/,/g, '')
  const numbers: number[] = []
  const numberPattern = /(\d+(?:\.\d+)?)\s*k?/g
  let match: RegExpExecArray | null
  while ((match = numberPattern.exec(normalized)) !== null) {
    const raw10 = match[0]
    const value = parseFloat(match[1] as string)
    numbers.push(raw10.includes('k') ? value * 1000 : value)
  }
  if (numbers.length === 0) return undefined
  return Math.max(...numbers)
}

export const scoreBudgetFit = (
  student: CandidateStudent,
  program: CandidateProgram,
): ScoredFit => {
  const reasons: string[] = []
  const missingRequirements: string[] = []
  const ceiling = parseBudgetCeiling(student.budget_range)
  const tuition = Number(program.tuition_amount)

  let score: number
  if (ceiling === undefined) {
    score = 50
    missingRequirements.push('Budget not specified or not parseable')
  } else if (tuition <= ceiling) {
    score = 100
    reasons.push(
      `Tuition (${program.tuition_currency} ${tuition}) is within budget`,
    )
  } else if (tuition >= ceiling * 2) {
    score = 0
    reasons.push(
      `Tuition (${program.tuition_currency} ${tuition}) is well over budget`,
    )
  } else {
    const overRatio = (tuition - ceiling) / ceiling
    score = Math.round(100 - overRatio * 100)
    reasons.push(
      `Tuition (${program.tuition_currency} ${tuition}) is over the stated budget`,
    )
  }

  if (
    program.scholarship_availability &&
    program.scholarship_availability.toLowerCase() !== 'none'
  ) {
    score = Math.min(100, score + 10)
    reasons.push(
      `Scholarship availability: ${program.scholarship_availability}`,
    )
  }

  return { score: clamp(score), reasons, missingRequirements }
}

const MONTH_INDEX: Record<IntakeMonth, number> = {
  JANUARY: 0,
  FEBRUARY: 1,
  MARCH: 2,
  APRIL: 3,
  MAY: 4,
  JUNE: 5,
  JULY: 6,
  AUGUST: 7,
  SEPTEMBER: 8,
  OCTOBER: 9,
  NOVEMBER: 10,
  DECEMBER: 11,
}

export const scoreIntakeFit = (
  student: CandidateStudent,
  program: CandidateProgram,
): ScoredFit => {
  const reasons: string[] = []
  const missingRequirements: string[] = []

  if (!student.target_intake_month || !student.target_intake_year) {
    missingRequirements.push('Target intake not specified')
    return { score: 50, reasons, missingRequirements }
  }

  const targetMonth = student.target_intake_month
  const targetYear = student.target_intake_year

  const exactMatch = program.intakes.some(
    (intake) => intake.month === targetMonth && intake.year === targetYear,
  )
  if (exactMatch) {
    reasons.push(`Intake available in ${targetMonth} ${targetYear}`)
    return { score: 100, reasons, missingRequirements }
  }

  const sameYear = program.intakes.some((intake) => intake.year === targetYear)
  if (sameYear) {
    reasons.push(
      `Program has an intake in ${targetYear}, though not the exact target month`,
    )
    return { score: 70, reasons, missingRequirements }
  }

  const targetDate = new Date(targetYear, MONTH_INDEX[targetMonth])
  const hasFutureIntake = program.intakes.some((intake) => {
    const intakeDate = new Date(intake.year, MONTH_INDEX[intake.month])
    return intakeDate > targetDate
  })
  if (hasFutureIntake) {
    reasons.push("Program has a later intake than the student's target")
    return { score: 40, reasons, missingRequirements }
  }

  missingRequirements.push('No matching or upcoming intake available')
  return { score: 0, reasons, missingRequirements }
}

// Combines two independent, currently-unused-elsewhere visa signals: the
// per-school internal editorial score (Schools.visa_friendliness_score) and
// the freshest active per-country partner-sourced rate (VisaSuccessRate,
// passed in already keyed by lowercased country — see buildVisaRateLookup
// callers in matching.service.ts / recommendations.service.ts).
export const scoreVisaFit = (
  program: CandidateProgram,
  visaRateByCountry: Map<string, VisaRate>,
): ScoredFit => {
  const reasons: string[] = []
  const missingRequirements: string[] = []
  const signals: number[] = []

  if (
    program.school.visa_friendliness_score !== null &&
    program.school.visa_friendliness_score !== undefined
  ) {
    signals.push(program.school.visa_friendliness_score)
    reasons.push(
      `Internal visa-friendliness assessment: ${program.school.visa_friendliness_score}/100`,
    )
  }

  const rate = visaRateByCountry.get(program.school.country.toLowerCase())
  if (rate) {
    const rateValue = Number(rate.success_rate)
    signals.push(rateValue)
    reasons.push(
      `${program.school.country} visa success rate: ${rateValue}% (${rate.period_label}${rate.source_partner ? ` via ${rate.source_partner}` : ''})`,
    )
  }

  if (signals.length === 0) {
    missingRequirements.push(
      `No visa-friendliness data available for ${program.school.country}`,
    )
    return { score: 50, reasons, missingRequirements }
  }

  const score = signals.reduce((sum, s) => sum + s, 0) / signals.length
  return { score: clamp(score), reasons, missingRequirements }
}

export const computeOverallScore = (
  fits: ProgramFitBreakdown,
  weights: RecommendationWeightsInput,
): number => {
  const overall =
    (fits.program.score * weights.programWeight +
      fits.budget.score * weights.budgetWeight +
      fits.intake.score * weights.intakeWeight +
      fits.visa.score * weights.visaWeight) /
    100
  return Math.round(overall * 100) / 100
}

export const scoreProgram = (
  student: CandidateStudent,
  program: CandidateProgram,
  weights: RecommendationWeightsInput,
  visaRateByCountry: Map<string, VisaRate>,
): ScoredProgram => {
  const fits: ProgramFitBreakdown = {
    program: scoreProgramFit(student, program),
    budget: scoreBudgetFit(student, program),
    intake: scoreIntakeFit(student, program),
    visa: scoreVisaFit(program, visaRateByCountry),
  }

  return {
    program,
    fits,
    overallScore: computeOverallScore(fits, weights),
    reasons: [
      ...fits.program.reasons,
      ...fits.budget.reasons,
      ...fits.intake.reasons,
      ...fits.visa.reasons,
    ],
    missingRequirements: [
      ...fits.program.missingRequirements,
      ...fits.budget.missingRequirements,
      ...fits.intake.missingRequirements,
      ...fits.visa.missingRequirements,
    ],
  }
}
