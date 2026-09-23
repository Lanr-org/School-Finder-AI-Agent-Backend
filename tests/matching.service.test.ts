import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MatchingService } from '../src/modules/matching/matching.service'
import { MatchingRepo } from '../src/modules/matching/matching.repository'
import { StudentsRepo } from '../src/modules/students/students.repository'
import { VisaRatesRepo } from '../src/modules/visaRates/visaRates.repository'
import { RecommendationsRepo } from '../src/modules/recommendations/recommendations.repository'

vi.mock('../src/modules/matching/matching.repository', () => ({
  MatchingRepo: {
    findMatchingPrograms: vi.fn(),
  },
}))

vi.mock('../src/modules/students/students.repository', () => ({
  StudentsRepo: {
    findStudentByPublicId: vi.fn(),
  },
}))

vi.mock('../src/modules/visaRates/visaRates.repository', () => ({
  VisaRatesRepo: {
    findLatestActiveForCountries: vi.fn(),
  },
}))

vi.mock('../src/modules/recommendations/recommendations.repository', () => ({
  RecommendationsRepo: {
    getCurrentWeights: vi.fn(),
  },
}))

const matchingRepoMock = vi.mocked(MatchingRepo)
const studentsRepoMock = vi.mocked(StudentsRepo)
const visaRatesRepoMock = vi.mocked(VisaRatesRepo)
const recommendationsRepoMock = vi.mocked(RecommendationsRepo)

const DEFAULT_WEIGHTS = {
  programWeight: 35,
  budgetWeight: 25,
  intakeWeight: 20,
  visaWeight: 20,
}

const makeStudent = (overrides: Record<string, unknown> = {}) => ({
  id: 'student-uuid-1',
  public_id: 'STU-8440',
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
  tuition_amount: 15973,
  tuition_currency: 'GBP',
  scholarship_availability: null,
  academic_requirements: null,
  english_requirements: null,
  intakes: [
    {
      month: 'SEPTEMBER',
      year: 2026,
      application_deadline: new Date('2026-06-01'),
    },
  ],
  school: {
    public_id: 'SCH-4667',
    name: 'University of East London',
    country: 'United Kingdom',
    city: 'London',
    visa_friendliness_score: null,
  },
  ...overrides,
})

describe('MatchingService.FindMatchesForStudent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    visaRatesRepoMock.findLatestActiveForCountries.mockResolvedValue([])
    recommendationsRepoMock.getCurrentWeights.mockResolvedValue({
      version: 1,
      weights: DEFAULT_WEIGHTS,
    })
  })

  it('throws NOT_FOUND when the student does not exist', async () => {
    studentsRepoMock.findStudentByPublicId.mockResolvedValue(null as any)

    await expect(
      MatchingService.FindMatchesForStudent('STU-9999'),
    ).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    })
    expect(matchingRepoMock.findMatchingPrograms).not.toHaveBeenCalled()
  })

  it.each([
    ['UK', 'United Kingdom'],
    ['USA', 'United States'],
    ['US', 'United States'],
  ])(
    'normalizes destination abbreviation %s to %s before querying',
    async (abbreviation, expected) => {
      studentsRepoMock.findStudentByPublicId.mockResolvedValue(
        makeStudent({ target_destinations: [abbreviation] }) as any,
      )
      matchingRepoMock.findMatchingPrograms.mockResolvedValue([])

      await MatchingService.FindMatchesForStudent('STU-8440')

      expect(matchingRepoMock.findMatchingPrograms).toHaveBeenCalledWith(
        expect.objectContaining({ countries: [expected] }),
      )
    },
  )

  it('leaves countries undefined when the student has no target destinations', async () => {
    studentsRepoMock.findStudentByPublicId.mockResolvedValue(
      makeStudent() as any,
    )
    matchingRepoMock.findMatchingPrograms.mockResolvedValue([])

    await MatchingService.FindMatchesForStudent('STU-8440')

    expect(matchingRepoMock.findMatchingPrograms).toHaveBeenCalledWith(
      expect.objectContaining({ countries: undefined }),
    )
  })

  it('maps repository program rows into the ProgramMatch shape, including intakes', async () => {
    studentsRepoMock.findStudentByPublicId.mockResolvedValue(
      makeStudent() as any,
    )
    matchingRepoMock.findMatchingPrograms.mockResolvedValue([
      makeProgram() as any,
    ])

    const result = await MatchingService.FindMatchesForStudent('STU-8440')

    expect(result).toEqual([
      {
        publicId: 'PRG-2001',
        name: 'BSc Psychology',
        studyLevel: 'UNDERGRADUATE',
        qualification: 'BSc',
        category: 'Psychology',
        tuitionAmount: 15973,
        tuitionCurrency: 'GBP',
        intakes: [
          {
            month: 'SEPTEMBER',
            year: 2026,
            applicationDeadline: new Date('2026-06-01'),
          },
        ],
        school: {
          publicId: 'SCH-4667',
          name: 'University of East London',
          country: 'United Kingdom',
          city: 'London',
        },
      },
    ])
  })

  it('ranks higher-scoring programs first and respects the limit', async () => {
    studentsRepoMock.findStudentByPublicId.mockResolvedValue(
      makeStudent({ study_level: 'undergraduate degree' }) as any,
    )
    const weakMatch = makeProgram({
      public_id: 'PRG-3001',
      study_level: 'DOCTORATE',
    })
    const strongMatch = makeProgram({
      public_id: 'PRG-2001',
      study_level: 'UNDERGRADUATE',
    })
    matchingRepoMock.findMatchingPrograms.mockResolvedValue([
      weakMatch,
      strongMatch,
    ] as any)

    const result = await MatchingService.FindMatchesForStudent('STU-8440', 1)

    expect(result).toHaveLength(1)
    expect(result[0]?.publicId).toBe('PRG-2001')
  })
})
