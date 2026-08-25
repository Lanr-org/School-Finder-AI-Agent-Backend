import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MatchingService } from '../src/modules/matching/matching.service'
import { MatchingRepo } from '../src/modules/matching/matching.repository'
import { StudentsRepo } from '../src/modules/students/students.repository'

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

const matchingRepoMock = vi.mocked(MatchingRepo)
const studentsRepoMock = vi.mocked(StudentsRepo)

const makeStudent = (overrides: Record<string, unknown> = {}) => ({
  id: 'student-uuid-1',
  public_id: 'STU-8440',
  study_level: null as string | null,
  target_destinations: [] as string[],
  target_intake_month: null as string | null,
  target_intake_year: null as number | null,
  ...overrides,
})

const makeProgram = (overrides: Record<string, unknown> = {}) => ({
  public_id: 'PRG-2001',
  name: 'BSc Psychology',
  study_level: 'UNDERGRADUATE',
  qualification: 'BSc',
  category: 'Psychology',
  tuition_amount: 15973,
  tuition_currency: 'GBP',
  intakes: [{ month: 'SEPTEMBER', year: 2026, application_deadline: new Date('2026-06-01') }],
  school: { public_id: 'SCH-4667', name: 'University of East London', country: 'United Kingdom', city: 'London' },
  ...overrides,
})

describe('MatchingService.FindMatchesForStudent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('throws NOT_FOUND when the student does not exist', async () => {
    studentsRepoMock.findStudentByPublicId.mockResolvedValue(null as any)

    await expect(MatchingService.FindMatchesForStudent('STU-9999')).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    })
    expect(matchingRepoMock.findMatchingPrograms).not.toHaveBeenCalled()
  })

  it.each([
    ['UK', 'United Kingdom'],
    ['USA', 'United States'],
    ['US', 'United States'],
  ])('normalizes destination abbreviation %s to %s before querying', async (abbreviation, expected) => {
    studentsRepoMock.findStudentByPublicId.mockResolvedValue(
      makeStudent({ target_destinations: [abbreviation] }) as any,
    )
    matchingRepoMock.findMatchingPrograms.mockResolvedValue([])

    await MatchingService.FindMatchesForStudent('STU-8440')

    expect(matchingRepoMock.findMatchingPrograms).toHaveBeenCalledWith(
      expect.objectContaining({ countries: [expected] }),
    )
  })

  it('passes full country names through unchanged', async () => {
    studentsRepoMock.findStudentByPublicId.mockResolvedValue(
      makeStudent({ target_destinations: ['Canada'] }) as any,
    )
    matchingRepoMock.findMatchingPrograms.mockResolvedValue([])

    await MatchingService.FindMatchesForStudent('STU-8440')

    expect(matchingRepoMock.findMatchingPrograms).toHaveBeenCalledWith(
      expect.objectContaining({ countries: ['Canada'] }),
    )
  })

  it('leaves countries undefined when the student has no target destinations', async () => {
    studentsRepoMock.findStudentByPublicId.mockResolvedValue(makeStudent() as any)
    matchingRepoMock.findMatchingPrograms.mockResolvedValue([])

    await MatchingService.FindMatchesForStudent('STU-8440')

    expect(matchingRepoMock.findMatchingPrograms).toHaveBeenCalledWith(
      expect.objectContaining({ countries: undefined }),
    )
  })

  it.each([
    ['undergraduate degree', 'UNDERGRADUATE'],
    ['MSc in progress', 'POSTGRADUATE'],
    ['currently doing a PhD', 'DOCTORATE'],
    ['foundation year', 'FOUNDATION'],
    ['not sure yet', undefined],
  ])('normalizes free-text study level "%s" to %s', async (raw, expected) => {
    studentsRepoMock.findStudentByPublicId.mockResolvedValue(makeStudent({ study_level: raw }) as any)
    matchingRepoMock.findMatchingPrograms.mockResolvedValue([])

    await MatchingService.FindMatchesForStudent('STU-8440')

    expect(matchingRepoMock.findMatchingPrograms).toHaveBeenCalledWith(
      expect.objectContaining({ studyLevel: expected }),
    )
  })

  it('passes the student intake month/year through to the repo filter', async () => {
    studentsRepoMock.findStudentByPublicId.mockResolvedValue(
      makeStudent({ target_intake_month: 'SEPTEMBER', target_intake_year: 2026 }) as any,
    )
    matchingRepoMock.findMatchingPrograms.mockResolvedValue([])

    await MatchingService.FindMatchesForStudent('STU-8440')

    expect(matchingRepoMock.findMatchingPrograms).toHaveBeenCalledWith(
      expect.objectContaining({ intakeMonth: 'SEPTEMBER', intakeYear: 2026 }),
    )
  })

  it('maps repository program rows into the ProgramMatch shape, including intakes', async () => {
    studentsRepoMock.findStudentByPublicId.mockResolvedValue(makeStudent() as any)
    matchingRepoMock.findMatchingPrograms.mockResolvedValue([makeProgram() as any])

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
        intakes: [{ month: 'SEPTEMBER', year: 2026, applicationDeadline: new Date('2026-06-01') }],
        school: {
          publicId: 'SCH-4667',
          name: 'University of East London',
          country: 'United Kingdom',
          city: 'London',
        },
      },
    ])
  })
})
