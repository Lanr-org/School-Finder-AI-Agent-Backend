import type { Prisma } from '../../generated/prisma/index.js'
import prisma from '../../database/prisma.js'
import type { Db } from '../../database/transaction.js'
import type { RecommendationWeightsInput } from './recommendations.scoring.js'

// Preserved from the (now-removed) SettingsPage.tsx recommendation-weights
// mockup — used only when no version has been seeded/saved yet, so scoring
// never hard-fails on missing configuration.
const DEFAULT_WEIGHTS: RecommendationWeightsInput = {
  programWeight: 35,
  budgetWeight: 25,
  intakeWeight: 20,
  visaWeight: 20,
}

export class RecommendationsRepo {
  static getLatestWeightsRow = async (db: Db = prisma) => {
    return db.recommendationWeights.findFirst({
      orderBy: { version: 'desc' },
    })
  }

  // Weights version + input ready for scoreProgram(); falls back to
  // DEFAULT_WEIGHTS if prisma/seed.ts hasn't run yet in this environment.
  static getCurrentWeights = async (): Promise<{
    version: number
    weights: RecommendationWeightsInput
  }> => {
    const row = await RecommendationsRepo.getLatestWeightsRow()
    if (!row) {
      return { version: 0, weights: DEFAULT_WEIGHTS }
    }
    return {
      version: row.version,
      weights: {
        programWeight: row.program_weight,
        budgetWeight: row.budget_weight,
        intakeWeight: row.intake_weight,
        visaWeight: row.visa_weight,
      },
    }
  }

  // Weights are versioned, never mutated in place — every call inserts a new
  // row so past recommendation_runs stay reproducible against the weights
  // active when they ran.
  static insertNextWeightsVersion = async (
    weights: RecommendationWeightsInput,
    db: Db = prisma,
  ) => {
    const current = await RecommendationsRepo.getLatestWeightsRow(db)
    const nextVersion = (current?.version ?? 0) + 1
    return db.recommendationWeights.create({
      data: {
        version: nextVersion,
        program_weight: weights.programWeight,
        budget_weight: weights.budgetWeight,
        intake_weight: weights.intakeWeight,
        visa_weight: weights.visaWeight,
      },
    })
  }

  // Create run + all recommendation rows atomically — AGENTS.md's "Generate
  // recommendations" transaction boundary.
  static createRunWithRecommendations = async (data: {
    publicId: string
    studentId: string
    weightsVersion: number
    scoringVersion: string
    studentSnapshot: Prisma.InputJsonValue
    generatedBy: string
    recommendations: {
      programId: string
      programPublicId: string
      programFit: number
      budgetFit: number
      intakeFit: number
      visaFit: number
      overallScore: number
      reasons: string[]
      missingRequirements: string[]
      programSnapshot: Prisma.InputJsonValue
    }[]
  }) => {
    return prisma.$transaction(async (tx) => {
      const run = await tx.recommendationRun.create({
        data: {
          public_id: data.publicId,
          student_id: data.studentId,
          weights_version: data.weightsVersion,
          scoring_version: data.scoringVersion,
          student_snapshot: data.studentSnapshot,
          generated_by: data.generatedBy,
        },
      })

      if (data.recommendations.length > 0) {
        await tx.recommendation.createMany({
          data: data.recommendations.map((rec) => ({
            // Deterministic from (run, program) — already guaranteed unique
            // by the run_id/program_id unique constraint, no random-ID retry needed.
            public_id: `${data.publicId}:${rec.programPublicId}`,
            run_id: run.id,
            program_id: rec.programId,
            program_fit: rec.programFit,
            budget_fit: rec.budgetFit,
            intake_fit: rec.intakeFit,
            visa_fit: rec.visaFit,
            overall_score: rec.overallScore,
            reasons: rec.reasons,
            missing_requirements: rec.missingRequirements,
            program_snapshot: rec.programSnapshot,
          })),
        })
      }

      return run
    })
  }

  static findRunByPublicId = async (publicId: string) => {
    return prisma.recommendationRun.findUnique({
      where: { public_id: publicId },
      include: {
        student: { select: { assigned_advisor_id: true, public_id: true } },
        recommendations: {
          orderBy: { overall_score: 'desc' },
          include: { program: { include: { school: true } } },
        },
      },
    })
  }

  static findLatestRunForStudent = async (studentId: string) => {
    return prisma.recommendationRun.findFirst({
      where: { student_id: studentId },
      orderBy: { created_at: 'desc' },
      include: {
        recommendations: {
          orderBy: { overall_score: 'desc' },
          include: { program: { include: { school: true } } },
        },
      },
    })
  }

  static upsertShortlist = async (studentId: string, programId: string) => {
    return prisma.studentShortlist.upsert({
      where: {
        student_id_program_id: { student_id: studentId, program_id: programId },
      },
      create: { student_id: studentId, program_id: programId },
      update: {},
    })
  }

  static findShortlist = async (studentId: string, programId: string) => {
    return prisma.studentShortlist.findUnique({
      where: {
        student_id_program_id: { student_id: studentId, program_id: programId },
      },
    })
  }

  static deleteShortlist = async (studentId: string, programId: string) => {
    return prisma.studentShortlist.delete({
      where: {
        student_id_program_id: { student_id: studentId, program_id: programId },
      },
    })
  }

  static findShortlistedProgramIds = async (
    studentId: string,
  ): Promise<Set<string>> => {
    const rows = await prisma.studentShortlist.findMany({
      where: { student_id: studentId },
      select: { program_id: true },
    })
    return new Set(rows.map((r) => r.program_id))
  }

  // ── Cross-student list (GET /recommendations) ────────────────────────────

  // "Latest run per student" in one query via Postgres DISTINCT ON, backed by
  // the existing (student_id, created_at desc) index — no N+1 over students.
  static findLatestRunIdsForScope = async (
    studentWhere: Prisma.StudentWhereInput,
  ): Promise<string[]> => {
    const runs = await prisma.recommendationRun.findMany({
      where: { student: studentWhere },
      distinct: ['student_id'],
      orderBy: [{ student_id: 'asc' }, { created_at: 'desc' }],
      select: { id: true },
    })
    return runs.map((run) => run.id)
  }

  static listAndCountRecommendations = async (
    runIds: string[],
    filters: {
      search: string | undefined
      country: string | undefined
      minScore: number | undefined
      hasMissingRequirements: boolean | undefined
      page: number
      limit: number
    },
  ) => {
    const where: Prisma.RecommendationWhereInput = {
      run_id: { in: runIds },
      ...(filters.search !== undefined && {
        OR: [
          {
            run: {
              student: {
                contact: {
                  first_name: { contains: filters.search, mode: 'insensitive' },
                },
              },
            },
          },
          {
            run: {
              student: {
                contact: {
                  last_name: { contains: filters.search, mode: 'insensitive' },
                },
              },
            },
          },
          {
            run: {
              student: {
                public_id: { contains: filters.search, mode: 'insensitive' },
              },
            },
          },
          {
            program: {
              name: { contains: filters.search, mode: 'insensitive' },
            },
          },
          {
            program: {
              school: {
                name: { contains: filters.search, mode: 'insensitive' },
              },
            },
          },
        ],
      }),
      ...(filters.country !== undefined && {
        program: {
          school: { country: { equals: filters.country, mode: 'insensitive' } },
        },
      }),
      ...(filters.minScore !== undefined && {
        overall_score: { gte: filters.minScore },
      }),
      ...(filters.hasMissingRequirements === true && {
        missing_requirements: { isEmpty: false },
      }),
    }

    const [recommendations, total] = await prisma.$transaction([
      prisma.recommendation.findMany({
        where,
        orderBy: { overall_score: 'desc' },
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
        include: {
          run: { include: { student: { include: { contact: true } } } },
          program: { include: { school: true } },
        },
      }),
      prisma.recommendation.count({ where }),
    ])

    return { recommendations, total }
  }

  static countRecommendations = async (
    runIds: string[],
    extraWhere: Prisma.RecommendationWhereInput,
  ): Promise<number> => {
    return prisma.recommendation.count({
      where: { run_id: { in: runIds }, ...extraWhere },
    })
  }

  static countShortlistsForScope = async (
    studentWhere: Prisma.StudentWhereInput,
  ): Promise<number> => {
    return prisma.studentShortlist.count({ where: { student: studentWhere } })
  }

  static findShortlistPairsForStudents = async (
    studentIds: string[],
  ): Promise<Set<string>> => {
    if (studentIds.length === 0) return new Set()
    const rows = await prisma.studentShortlist.findMany({
      where: { student_id: { in: studentIds } },
      select: { student_id: true, program_id: true },
    })
    return new Set(rows.map((r) => `${r.student_id}:${r.program_id}`))
  }
}
