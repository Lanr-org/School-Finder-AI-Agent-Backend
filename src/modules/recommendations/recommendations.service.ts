import { createError } from '../../common/errors/AppError.js'
import { assertStudentOwnership } from '../../common/security/ownership.js'
import {
  createPublicRecommendationRunId,
  withUniquePublicId,
} from '../../common/security/publicId.js'
import type { AccessTokenClaims } from '../auth/auth.types.js'
import { StudentsService } from '../students/students.service.js'
import { ProgramsRepo } from '../programs/programs.repository.js'
import { MatchingRepo } from '../matching/matching.repository.js'
import { normalizeCountry } from '../matching/matching.normalizers.js'
import { VisaRatesRepo } from '../visaRates/visaRates.repository.js'
import TeamRepo from '../team/team.repository.js'
import type { Prisma } from '../../generated/prisma/index.js'
import { RecommendationsRepo } from './recommendations.repository.js'
import { AuditService } from '../audit/audit.service.js'
import { AUDIT_ACTIONS } from '../audit/audit.actions.js'
import {
  scoreProgram,
  type ScoredProgram,
  type VisaRate,
} from './recommendations.scoring.js'
import type {
  CreateShortlistDTO,
  GenerateRunDTO,
  ListRecommendationsQueryDTO,
  UpdateWeightsDTO,
} from './recommendations.types.js'

// Bumped only when the scoring algorithm itself changes (not when weights
// change — that's weights_version) so past runs stay interpretable even after
// the formula evolves.
const toWeightsSnapshot = (row: {
  version: number
  program_weight: number
  budget_weight: number
  intake_weight: number
  visa_weight: number
}) => ({
  version: row.version,
  programWeight: row.program_weight,
  budgetWeight: row.budget_weight,
  intakeWeight: row.intake_weight,
  visaWeight: row.visa_weight,
})

const SCORING_VERSION = 'v1'
const POOL_CAP = 300

type ProgramWithSchool = {
  public_id: string
  name: string
  qualification: string
  category: string
  tuition_amount: unknown
  tuition_currency: string
  school: { public_id: string; name: string; country: string; city: string }
}

const toProgramResponse = (program: ProgramWithSchool) => ({
  publicId: program.public_id,
  name: program.name,
  qualification: program.qualification,
  category: program.category,
  tuitionAmount: Number(program.tuition_amount),
  tuitionCurrency: program.tuition_currency,
})

const toSchoolResponse = (program: ProgramWithSchool) => ({
  publicId: program.school.public_id,
  name: program.school.name,
  country: program.school.country,
  city: program.school.city,
})

const toGeneratedRecommendationResponse = (
  scored: ScoredProgram,
  runPublicId: string,
  shortlistedProgramIds: Set<string>,
) => ({
  publicId: `${runPublicId}:${scored.program.public_id}`,
  program: toProgramResponse(scored.program),
  school: toSchoolResponse(scored.program),
  overallScore: scored.overallScore,
  scoreBreakdown: {
    program: scored.fits.program.score,
    budget: scored.fits.budget.score,
    intake: scored.fits.intake.score,
    visa: scored.fits.visa.score,
  },
  reasons: scored.reasons,
  missingRequirements: scored.missingRequirements,
  shortlisted: shortlistedProgramIds.has(scored.program.id),
})

type PersistedRecommendation = {
  public_id: string
  program_id: string
  program_fit: unknown
  budget_fit: unknown
  intake_fit: unknown
  visa_fit: unknown
  overall_score: unknown
  reasons: string[]
  missing_requirements: string[]
  program: ProgramWithSchool
}

const toPersistedRecommendationResponse = (
  rec: PersistedRecommendation,
  shortlistedProgramIds: Set<string>,
) => ({
  publicId: rec.public_id,
  program: toProgramResponse(rec.program),
  school: toSchoolResponse(rec.program),
  overallScore: Number(rec.overall_score),
  scoreBreakdown: {
    program: Number(rec.program_fit),
    budget: Number(rec.budget_fit),
    intake: Number(rec.intake_fit),
    visa: Number(rec.visa_fit),
  },
  reasons: rec.reasons,
  missingRequirements: rec.missing_requirements,
  shortlisted: shortlistedProgramIds.has(rec.program_id),
})

type ListRow = PersistedRecommendation & {
  run: {
    student_id: string
    created_at: Date
    student: {
      public_id: string
      contact: { first_name: string; last_name: string | null }
    }
  }
}

const toListRecommendationResponse = (
  rec: ListRow,
  shortlistPairs: Set<string>,
) => ({
  ...toPersistedRecommendationResponse(rec, new Set()),
  shortlisted: shortlistPairs.has(`${rec.run.student_id}:${rec.program_id}`),
  studentId: rec.run.student.public_id,
  studentName: [
    rec.run.student.contact.first_name,
    rec.run.student.contact.last_name,
  ]
    .filter(Boolean)
    .join(' '),
  createdAt: rec.run.created_at,
})

const toRunSummary = (run: {
  public_id: string
  weights_version: number
  scoring_version: string
  created_at: Date
}) => ({
  publicId: run.public_id,
  weightsVersion: run.weights_version,
  scoringVersion: run.scoring_version,
  createdAt: run.created_at,
})

export class RecommendationsService {
  private static getOwnedStudent = async (
    studentPublicId: string,
    auth: AccessTokenClaims,
  ) => {
    const student = await StudentsService.getStudentByPublicId(studentPublicId)
    assertStudentOwnership(student.assigned_advisor_id, auth)
    return student
  }

  private static getOwnedProgram = async (programPublicId: string) => {
    const program = await ProgramsRepo.findProgramByPublicId(programPublicId)
    if (!program) {
      throw createError('Program not found', 404, {}, 'NOT_FOUND')
    }
    return program
  }

  // ── GET /settings/recommendation-weights ────────────────────────────────
  static GetWeights = async () => {
    const row = await RecommendationsRepo.getLatestWeightsRow()
    if (!row) {
      const { weights } = await RecommendationsRepo.getCurrentWeights()
      return { version: 0, ...weights, createdAt: null }
    }
    return {
      version: row.version,
      programWeight: row.program_weight,
      budgetWeight: row.budget_weight,
      intakeWeight: row.intake_weight,
      visaWeight: row.visa_weight,
      createdAt: row.created_at,
    }
  }

  // ── PUT /settings/recommendation-weights ────────────────────────────────
  static UpdateWeights = async (dto: UpdateWeightsDTO) => {
    // Previous version read inside the same transaction as the insert, so the
    // audit "before" is exactly the version this one replaced.
    const { row } = await AuditService.withAudit(
      async (tx) => {
        const previous = await RecommendationsRepo.getLatestWeightsRow(tx)
        const inserted = await RecommendationsRepo.insertNextWeightsVersion(
          dto,
          tx,
        )
        return { row: inserted, previous }
      },
      ({ row: inserted, previous }) => ({
        action: AUDIT_ACTIONS.RECOMMENDATION_WEIGHTS_UPDATED,
        entityType: 'recommendation_weights',
        entityId: String(inserted.version),
        before: previous ? toWeightsSnapshot(previous) : null,
        after: toWeightsSnapshot(inserted),
      }),
    )
    return {
      version: row.version,
      programWeight: row.program_weight,
      budgetWeight: row.budget_weight,
      intakeWeight: row.intake_weight,
      visaWeight: row.visa_weight,
      createdAt: row.created_at,
    }
  }

  // ── POST /students/:studentId/recommendation-runs ───────────────────────
  static GenerateRun = async (
    studentPublicId: string,
    dto: GenerateRunDTO,
    auth: AccessTokenClaims,
  ) => {
    const student = await RecommendationsService.getOwnedStudent(
      studentPublicId,
      auth,
    )

    const { version: weightsVersion, weights } =
      await RecommendationsRepo.getCurrentWeights()

    const countries =
      student.target_destinations.length > 0
        ? student.target_destinations.map(normalizeCountry)
        : undefined

    const [candidates, rates, shortlistedProgramIds] = await Promise.all([
      MatchingRepo.findMatchingPrograms({ countries, poolCap: POOL_CAP }),
      VisaRatesRepo.findLatestActiveForCountries(countries ?? []),
      RecommendationsRepo.findShortlistedProgramIds(student.id),
    ])

    const visaRateByCountry = new Map<string, VisaRate>(
      rates.map((rate) => [rate.country.toLowerCase(), rate]),
    )

    const scored = candidates
      .map((program) =>
        scoreProgram(student, program, weights, visaRateByCountry),
      )
      .sort((a, b) => b.overallScore - a.overallScore)
      .slice(0, dto.limit)

    const studentSnapshot = {
      studyLevel: student.study_level,
      targetDestinations: student.target_destinations,
      targetIntakeMonth: student.target_intake_month,
      targetIntakeYear: student.target_intake_year,
      budgetRange: student.budget_range,
      academicBackground: student.academic_background,
      englishTestScore: student.english_test_score,
    }

    const run = await withUniquePublicId(
      createPublicRecommendationRunId,
      (publicId) =>
        RecommendationsRepo.createRunWithRecommendations({
          publicId,
          studentId: student.id,
          weightsVersion,
          scoringVersion: SCORING_VERSION,
          studentSnapshot,
          generatedBy: auth.sub,
          recommendations: scored.map((s) => ({
            programId: s.program.id,
            programPublicId: s.program.public_id,
            programFit: s.fits.program.score,
            budgetFit: s.fits.budget.score,
            intakeFit: s.fits.intake.score,
            visaFit: s.fits.visa.score,
            overallScore: s.overallScore,
            reasons: s.reasons,
            missingRequirements: s.missingRequirements,
            programSnapshot: {
              tuitionAmount: Number(s.program.tuition_amount),
              tuitionCurrency: s.program.tuition_currency,
              studyLevel: s.program.study_level,
              schoolCountry: s.program.school.country,
              intakes: s.program.intakes.map((intake) => ({
                month: intake.month,
                year: intake.year,
              })),
            },
          })),
        }),
    )

    return {
      ...toRunSummary(run),
      recommendations: scored.map((s) =>
        toGeneratedRecommendationResponse(
          s,
          run.public_id,
          shortlistedProgramIds,
        ),
      ),
    }
  }

  // ── GET /students/:studentId/recommendations ─────────────────────────────
  static GetLatestForStudent = async (
    studentPublicId: string,
    auth: AccessTokenClaims,
  ) => {
    const student = await RecommendationsService.getOwnedStudent(
      studentPublicId,
      auth,
    )
    const run = await RecommendationsRepo.findLatestRunForStudent(student.id)
    if (!run) {
      return { run: null, recommendations: [] }
    }

    const shortlistedProgramIds =
      await RecommendationsRepo.findShortlistedProgramIds(student.id)

    return {
      ...toRunSummary(run),
      recommendations: run.recommendations.map((rec) =>
        toPersistedRecommendationResponse(rec, shortlistedProgramIds),
      ),
    }
  }

  // ── GET /recommendation-runs/:runId ──────────────────────────────────────
  static GetRun = async (runPublicId: string, auth: AccessTokenClaims) => {
    const run = await RecommendationsRepo.findRunByPublicId(runPublicId)
    if (!run) {
      throw createError('Recommendation run not found', 404, {}, 'NOT_FOUND')
    }
    assertStudentOwnership(run.student.assigned_advisor_id, auth)

    const shortlistedProgramIds =
      await RecommendationsRepo.findShortlistedProgramIds(run.student_id)

    return {
      ...toRunSummary(run),
      studentId: run.student.public_id,
      recommendations: run.recommendations.map((rec) =>
        toPersistedRecommendationResponse(rec, shortlistedProgramIds),
      ),
    }
  }

  // ── POST /students/:studentId/shortlists ─────────────────────────────────
  static CreateShortlist = async (
    studentPublicId: string,
    dto: CreateShortlistDTO,
    auth: AccessTokenClaims,
  ) => {
    const student = await RecommendationsService.getOwnedStudent(
      studentPublicId,
      auth,
    )
    const program = await RecommendationsService.getOwnedProgram(dto.programId)
    await RecommendationsRepo.upsertShortlist(student.id, program.id)
    return { studentId: student.public_id, programId: program.public_id }
  }

  // ── DELETE /students/:studentId/shortlists/:programId ───────────────────
  static DeleteShortlist = async (
    studentPublicId: string,
    programPublicId: string,
    auth: AccessTokenClaims,
  ) => {
    const student = await RecommendationsService.getOwnedStudent(
      studentPublicId,
      auth,
    )
    const program =
      await RecommendationsService.getOwnedProgram(programPublicId)
    const existing = await RecommendationsRepo.findShortlist(
      student.id,
      program.id,
    )
    if (!existing) {
      throw createError('Shortlist entry not found', 404, {}, 'NOT_FOUND')
    }
    await RecommendationsRepo.deleteShortlist(student.id, program.id)
  }

  // ── GET /recommendations ─────────────────────────────────────────────────
  // Cross-student view: each student's LATEST run's rows, flattened and
  // paginated at the row level. ADVISOR is scoped to their own students,
  // same rule as StudentsService.ListStudents — the client's advisorId filter
  // is ignored for them, never trusted as a way to browse other advisors' students.
  static ListLatest = async (
    query: ListRecommendationsQueryDTO,
    auth: AccessTokenClaims,
  ) => {
    let advisorUserId: string | undefined
    if (auth.role === 'ADVISOR') {
      advisorUserId = auth.sub
    } else if (query.advisorId !== undefined) {
      const advisor = await TeamRepo.findUserByPublicId(query.advisorId)
      if (!advisor) {
        throw createError('Advisor not found', 404, {}, 'NOT_FOUND')
      }
      advisorUserId = advisor.id
    }
    const studentScope: Prisma.StudentWhereInput =
      advisorUserId !== undefined ? { assigned_advisor_id: advisorUserId } : {}

    const runIds =
      await RecommendationsRepo.findLatestRunIdsForScope(studentScope)

    const emptyPagination = {
      page: query.page,
      limit: query.limit,
      total: 0,
      totalPages: 0,
    }
    if (runIds.length === 0) {
      return {
        recommendations: [],
        pagination: emptyPagination,
        summary: {
          generated: 0,
          strongMatches: 0,
          missingRequirements: 0,
          shortlisted: 0,
        },
      }
    }

    // Summary reflects the full advisor-scoped set, unaffected by
    // search/country/minScore — same convention the frontend's other list
    // pages use for their stat cards (global counts, not filtered-view counts).
    const [
      { recommendations, total },
      generated,
      strongMatches,
      missingRequirements,
      shortlisted,
    ] = await Promise.all([
      RecommendationsRepo.listAndCountRecommendations(runIds, {
        search: query.search,
        country:
          query.country !== undefined
            ? normalizeCountry(query.country)
            : undefined,
        minScore: query.minScore,
        hasMissingRequirements: query.hasMissingRequirements,
        page: query.page,
        limit: query.limit,
      }),
      RecommendationsRepo.countRecommendations(runIds, {}),
      RecommendationsRepo.countRecommendations(runIds, {
        overall_score: { gte: 85 },
      }),
      RecommendationsRepo.countRecommendations(runIds, {
        missing_requirements: { isEmpty: false },
      }),
      RecommendationsRepo.countShortlistsForScope(studentScope),
    ])

    const studentIds = [
      ...new Set(recommendations.map((rec) => rec.run.student_id)),
    ]
    const shortlistPairs =
      await RecommendationsRepo.findShortlistPairsForStudents(studentIds)

    return {
      recommendations: recommendations.map((rec) =>
        toListRecommendationResponse(rec, shortlistPairs),
      ),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
      summary: {
        generated,
        strongMatches,
        missingRequirements,
        shortlisted,
      },
    }
  }
}
