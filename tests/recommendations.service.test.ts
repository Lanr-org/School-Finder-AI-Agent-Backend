import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RecommendationsService } from '../src/modules/recommendations/recommendations.service'
import { RecommendationsRepo } from '../src/modules/recommendations/recommendations.repository'
import { StudentsRepo } from '../src/modules/students/students.repository'
import { ProgramsRepo } from '../src/modules/programs/programs.repository'
import { MatchingRepo } from '../src/modules/matching/matching.repository'
import { VisaRatesRepo } from '../src/modules/visaRates/visaRates.repository'
import type { AccessTokenClaims } from '../src/modules/auth/auth.types'

vi.mock('../src/modules/recommendations/recommendations.repository', () => ({
  RecommendationsRepo: {
    getLatestWeightsRow: vi.fn(),
    getCurrentWeights: vi.fn(),
    insertNextWeightsVersion: vi.fn(),
    createRunWithRecommendations: vi.fn(),
    findRunByPublicId: vi.fn(),
    findLatestRunForStudent: vi.fn(),
    upsertShortlist: vi.fn(),
    findShortlist: vi.fn(),
    deleteShortlist: vi.fn(),
    findShortlistedProgramIds: vi.fn(),
  },
}))

vi.mock('../src/modules/students/students.repository', () => ({
  StudentsRepo: {
    findStudentByPublicId: vi.fn(),
  },
}))

vi.mock('../src/modules/programs/programs.repository', () => ({
  ProgramsRepo: {
    findProgramByPublicId: vi.fn(),
  },
}))

vi.mock('../src/modules/matching/matching.repository', () => ({
  MatchingRepo: {
    findMatchingPrograms: vi.fn(),
  },
}))

vi.mock('../src/modules/visaRates/visaRates.repository', () => ({
  VisaRatesRepo: {
    findLatestActiveForCountries: vi.fn(),
  },
}))

const recommendationsRepoMock = vi.mocked(RecommendationsRepo)
const studentsRepoMock = vi.mocked(StudentsRepo)
const programsRepoMock = vi.mocked(ProgramsRepo)
const matchingRepoMock = vi.mocked(MatchingRepo)
const visaRatesRepoMock = vi.mocked(VisaRatesRepo)

const ADVISOR_ID = 'advisor-user-uuid-0001'
const OTHER_ADVISOR_ID = 'advisor-user-uuid-0002'

const asAdvisor: AccessTokenClaims = {
  sub: ADVISOR_ID,
  session_Id: 'session-uuid-1',
  role: 'ADVISOR',
  token_version: 0,
}

const asOtherAdvisor: AccessTokenClaims = {
  ...asAdvisor,
  sub: OTHER_ADVISOR_ID,
}

const makeStudent = (overrides: Record<string, unknown> = {}) => ({
  id: 'student-uuid-1',
  public_id: 'STU-8440',
  assigned_advisor_id: ADVISOR_ID as string | null,
  study_level: null as string | null,
  target_destinations: [] as string[],
  target_intake_month: null as string | null,
  target_intake_year: null as number | null,
  budget_range: null as string | null,
  academic_background: null as string | null,
  english_test_score: null as string | null,
  ...overrides,
})

const makeProgram = (overrides: Record<string, unknown> = {}) => ({
  id: 'program-uuid-1',
  public_id: 'PRG-2001',
  name: 'BSc Psychology',
  study_level: 'UNDERGRADUATE',
  qualification: 'BSc',
  category: 'Psychology',
  tuition_amount: 15000,
  tuition_currency: 'GBP',
  scholarship_availability: null,
  academic_requirements: null,
  english_requirements: null,
  intakes: [],
  school: {
    public_id: 'SCH-4667',
    name: 'University of East London',
    country: 'United Kingdom',
    city: 'London',
    visa_friendliness_score: null,
  },
  ...overrides,
})

describe('RecommendationsService.GenerateRun', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    recommendationsRepoMock.getCurrentWeights.mockResolvedValue({
      version: 1,
      weights: {
        programWeight: 35,
        budgetWeight: 25,
        intakeWeight: 20,
        visaWeight: 20,
      },
    })
    visaRatesRepoMock.findLatestActiveForCountries.mockResolvedValue([])
    recommendationsRepoMock.findShortlistedProgramIds.mockResolvedValue(
      new Set(),
    )
  })

  it('throws NOT_FOUND for an unknown student', async () => {
    studentsRepoMock.findStudentByPublicId.mockResolvedValue(null as any)

    await expect(
      RecommendationsService.GenerateRun('STU-9999', { limit: 10 }, asAdvisor),
    ).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' })
  })

  it('throws FORBIDDEN for an advisor the student is not assigned to', async () => {
    studentsRepoMock.findStudentByPublicId.mockResolvedValue(
      makeStudent() as any,
    )

    await expect(
      RecommendationsService.GenerateRun(
        'STU-8440',
        { limit: 10 },
        asOtherAdvisor,
      ),
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' })
    expect(matchingRepoMock.findMatchingPrograms).not.toHaveBeenCalled()
  })

  it('persists a run + recommendation rows and returns them sorted by score', async () => {
    studentsRepoMock.findStudentByPublicId.mockResolvedValue(
      makeStudent({ study_level: 'undergraduate degree' }) as any,
    )
    const weak = makeProgram({
      public_id: 'PRG-3001',
      study_level: 'DOCTORATE',
    })
    const strong = makeProgram({
      public_id: 'PRG-2001',
      study_level: 'UNDERGRADUATE',
    })
    matchingRepoMock.findMatchingPrograms.mockResolvedValue([
      weak,
      strong,
    ] as any)
    recommendationsRepoMock.createRunWithRecommendations.mockResolvedValue({
      public_id: 'RUN-1001',
      weights_version: 1,
      scoring_version: 'v1',
      created_at: new Date('2026-09-23'),
    } as any)

    const result = await RecommendationsService.GenerateRun(
      'STU-8440',
      { limit: 10 },
      asAdvisor,
    )

    expect(
      recommendationsRepoMock.createRunWithRecommendations,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        studentId: 'student-uuid-1',
        weightsVersion: 1,
        generatedBy: ADVISOR_ID,
        recommendations: expect.arrayContaining([
          expect.objectContaining({ programId: 'program-uuid-1' }),
        ]),
      }),
    )
    expect(result.recommendations[0]?.program.publicId).toBe('PRG-2001')
    expect(result.publicId).toBe('RUN-1001')
  })
})

describe('RecommendationsService.UpdateWeights', () => {
  beforeEach(() => vi.clearAllMocks())

  it('inserts the next version and returns the mapped DTO', async () => {
    recommendationsRepoMock.insertNextWeightsVersion.mockResolvedValue({
      version: 2,
      program_weight: 40,
      budget_weight: 20,
      intake_weight: 20,
      visa_weight: 20,
      created_at: new Date('2026-09-23'),
    } as any)

    const result = await RecommendationsService.UpdateWeights({
      programWeight: 40,
      budgetWeight: 20,
      intakeWeight: 20,
      visaWeight: 20,
    })

    expect(result.version).toBe(2)
    expect(result.programWeight).toBe(40)
  })
})

describe('RecommendationsService shortlists', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    studentsRepoMock.findStudentByPublicId.mockResolvedValue(
      makeStudent() as any,
    )
  })

  it('CreateShortlist throws NOT_FOUND for an unknown program', async () => {
    programsRepoMock.findProgramByPublicId.mockResolvedValue(null as any)

    await expect(
      RecommendationsService.CreateShortlist(
        'STU-8440',
        { programId: 'PRG-9999' },
        asAdvisor,
      ),
    ).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' })
  })

  it('CreateShortlist upserts for the owning advisor', async () => {
    programsRepoMock.findProgramByPublicId.mockResolvedValue(
      makeProgram() as any,
    )

    await RecommendationsService.CreateShortlist(
      'STU-8440',
      { programId: 'PRG-2001' },
      asAdvisor,
    )

    expect(recommendationsRepoMock.upsertShortlist).toHaveBeenCalledWith(
      'student-uuid-1',
      'program-uuid-1',
    )
  })

  it('DeleteShortlist throws NOT_FOUND when the pair does not exist', async () => {
    programsRepoMock.findProgramByPublicId.mockResolvedValue(
      makeProgram() as any,
    )
    recommendationsRepoMock.findShortlist.mockResolvedValue(null as any)

    await expect(
      RecommendationsService.DeleteShortlist('STU-8440', 'PRG-2001', asAdvisor),
    ).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' })
    expect(recommendationsRepoMock.deleteShortlist).not.toHaveBeenCalled()
  })
})
