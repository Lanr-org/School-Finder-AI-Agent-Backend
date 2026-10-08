import './setup-env'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import app from '../src/app'
import { generateAcessToken } from '../src/common/security/token'
import AuthRepo from '../src/modules/auth/auth.repository'
import { StudentsRepo } from '../src/modules/students/students.repository'
import { ProgramsRepo } from '../src/modules/programs/programs.repository'
import { MatchingRepo } from '../src/modules/matching/matching.repository'
import { VisaRatesRepo } from '../src/modules/visaRates/visaRates.repository'
import { RecommendationsRepo } from '../src/modules/recommendations/recommendations.repository'
import TeamRepo from '../src/modules/team/team.repository'
import { AuditRepo } from '../src/modules/audit/audit.repository'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../src/modules/auth/auth.repository', () => ({
  default: {
    findUser: vi.fn(),
    findAuthSessionById: vi.fn(),
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
    findLatestRunIdsForScope: vi.fn(),
    listAndCountRecommendations: vi.fn(),
    countRecommendations: vi.fn(),
    countShortlistsForScope: vi.fn(),
    findShortlistPairsForStudents: vi.fn(),
  },
}))

vi.mock('../src/modules/team/team.repository', () => ({
  default: {
    findUserByPublicId: vi.fn(),
  },
}))

// ── Typed response helpers ────────────────────────────────────────────────────

type ApiBody<T = unknown> = {
  success: boolean
  message: string
  data: T
  error?: { code: string; message: string }
}

function body<T = unknown>(res: { body: unknown }): ApiBody<T> {
  return res.body as ApiBody<T>
}

const authRepoMock = vi.mocked(AuthRepo)
const studentsRepoMock = vi.mocked(StudentsRepo)
const programsRepoMock = vi.mocked(ProgramsRepo)
const matchingRepoMock = vi.mocked(MatchingRepo)
const visaRatesRepoMock = vi.mocked(VisaRatesRepo)
const recommendationsRepoMock = vi.mocked(RecommendationsRepo)
const teamRepoMock = vi.mocked(TeamRepo)
// Globally mocked in tests/setup-global-mocks.ts.
const auditRepoMock = vi.mocked(AuditRepo)

// ── Constants ─────────────────────────────────────────────────────────────────

const ADMIN_ID = 'admin-user-uuid-0001'
const ADVISOR_ID = 'advisor-user-uuid-0001'
const OTHER_ADVISOR_ID = 'advisor-user-uuid-0002'
const SESSION_ID = 'session-uuid-0001'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const makeUser = (overrides: Record<string, unknown> = {}) => ({
  id: ADMIN_ID,
  public_id: 'USR-0001',
  full_name: 'Alice Admin',
  email: 'alice@example.com',
  phone: null as string | null,
  password_hash: '$argon2id$hash' as string | null,
  role: 'ADMIN' as const,
  status: 'ACTIVE' as const,
  token_version: 0,
  last_login_at: null as Date | null,
  password_changed_at: null as Date | null,
  created_at: new Date('2024-01-01'),
  updated_at: new Date('2024-01-01'),
  ...overrides,
})

const makeSession = (overrides: Record<string, unknown> = {}) => ({
  id: SESSION_ID,
  user_id: ADMIN_ID,
  refresh_token_hash: 'hash',
  token_family: 'family-uuid',
  user_agent: null as string | null,
  ip_address: null as string | null,
  expires_at: new Date(Date.now() + 3_600_000),
  revoked_at: null as Date | null,
  last_used_at: null as Date | null,
  created_at: new Date(),
  ...overrides,
})

const makeStudent = (overrides: Record<string, unknown> = {}) => ({
  id: 'student-uuid-1',
  public_id: 'STU-8440',
  status: 'ASSIGNED' as const,
  assigned_advisor_id: ADVISOR_ID as string | null,
  study_level: null as string | null,
  target_destinations: [] as string[],
  target_intake_month: null as string | null,
  target_intake_year: null as number | null,
  budget_range: null as string | null,
  academic_background: null as string | null,
  english_test_score: null as string | null,
  created_at: new Date('2024-01-01'),
  updated_at: new Date('2024-01-01'),
  contact: {
    id: 'contact-uuid-1',
    provider_type: 'TELEGRAM' as const,
    provider_user_id: '2011329752',
    first_name: 'Chinedu',
    last_name: 'Nwosu',
    username: null as string | null,
    email: null as string | null,
    phone: null as string | null,
    created_at: new Date('2024-01-01'),
    updated_at: new Date('2024-01-01'),
  },
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

const token = (role: 'ADMIN' | 'ADVISOR' | 'OPERATIONS', id = ADMIN_ID) =>
  generateAcessToken(id, SESSION_ID, role, 0)

const asAdmin = () => {
  authRepoMock.findUser.mockResolvedValue(
    makeUser({ id: ADMIN_ID, role: 'ADMIN' }) as any,
  )
  authRepoMock.findAuthSessionById.mockResolvedValue(
    makeSession({ user_id: ADMIN_ID }) as any,
  )
  return token('ADMIN', ADMIN_ID)
}

const asAdvisor = (id = ADVISOR_ID) => {
  authRepoMock.findUser.mockResolvedValue(
    makeUser({ id, role: 'ADVISOR' }) as any,
  )
  authRepoMock.findAuthSessionById.mockResolvedValue(
    makeSession({ user_id: id }) as any,
  )
  return token('ADVISOR', id)
}

const DEFAULT_WEIGHTS = {
  programWeight: 35,
  budgetWeight: 25,
  intakeWeight: 20,
  visaWeight: 20,
}

// ── HTTP Test Suites ──────────────────────────────────────────────────────────

describe('Recommendation Weights API — GET/PUT /api/v1/settings/recommendation-weights', () => {
  beforeEach(() => vi.clearAllMocks())

  it('is readable by ADVISOR', async () => {
    const authToken = asAdvisor()
    recommendationsRepoMock.getLatestWeightsRow.mockResolvedValue({
      version: 1,
      program_weight: 35,
      budget_weight: 25,
      intake_weight: 20,
      visa_weight: 20,
      created_at: new Date('2026-09-23'),
    } as any)

    const res = await request(app)
      .get('/api/v1/settings/recommendation-weights')
      .set('Authorization', `Bearer ${authToken}`)

    expect(res.status).toBe(200)
    expect(body<{ version: number }>(res).data.version).toBe(1)
  })

  it('is forbidden for ADVISOR on PUT', async () => {
    const authToken = asAdvisor()

    const res = await request(app)
      .put('/api/v1/settings/recommendation-weights')
      .set('Authorization', `Bearer ${authToken}`)
      .send(DEFAULT_WEIGHTS)

    expect(res.status).toBe(403)
    expect(
      recommendationsRepoMock.insertNextWeightsVersion,
    ).not.toHaveBeenCalled()
  })

  it('returns 400 when weights do not sum to 100', async () => {
    const authToken = asAdmin()

    const res = await request(app)
      .put('/api/v1/settings/recommendation-weights')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        programWeight: 50,
        budgetWeight: 25,
        intakeWeight: 20,
        visaWeight: 20,
      })

    expect(res.status).toBe(400)
    expect(body(res).error?.code).toBe('VALIDATION_ERROR')
  })

  it('updates for ADMIN when weights sum to 100', async () => {
    const authToken = asAdmin()
    recommendationsRepoMock.getLatestWeightsRow.mockResolvedValue({
      version: 1,
      program_weight: 35,
      budget_weight: 25,
      intake_weight: 20,
      visa_weight: 20,
      created_at: new Date('2026-09-20'),
    } as any)
    recommendationsRepoMock.insertNextWeightsVersion.mockResolvedValue({
      version: 2,
      program_weight: 40,
      budget_weight: 20,
      intake_weight: 20,
      visa_weight: 20,
      created_at: new Date('2026-09-23'),
    } as any)

    const res = await request(app)
      .put('/api/v1/settings/recommendation-weights')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        programWeight: 40,
        budgetWeight: 20,
        intakeWeight: 20,
        visaWeight: 20,
      })

    expect(res.status).toBe(200)
    expect(body<{ version: number }>(res).data.version).toBe(2)
    // "before" is the version this one replaced, read in the same transaction.
    expect(auditRepoMock.record).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'recommendation_weights.updated',
        entity_type: 'recommendation_weights',
        entity_id: '2',
        before_data: {
          version: 1,
          programWeight: 35,
          budgetWeight: 25,
          intakeWeight: 20,
          visaWeight: 20,
        },
        after_data: {
          version: 2,
          programWeight: 40,
          budgetWeight: 20,
          intakeWeight: 20,
          visaWeight: 20,
        },
      }),
    )
  })
})

describe('Recommendation Runs API — POST /api/v1/students/:studentId/recommendation-runs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    studentsRepoMock.findStudentByPublicId.mockResolvedValue(
      makeStudent() as any,
    )
    recommendationsRepoMock.getCurrentWeights.mockResolvedValue({
      version: 1,
      weights: DEFAULT_WEIGHTS,
    })
    visaRatesRepoMock.findLatestActiveForCountries.mockResolvedValue([])
    recommendationsRepoMock.findShortlistedProgramIds.mockResolvedValue(
      new Set(),
    )
  })

  it('returns 403 for an ADVISOR the student is not assigned to', async () => {
    const authToken = asAdvisor(OTHER_ADVISOR_ID)

    const res = await request(app)
      .post('/api/v1/students/STU-8440/recommendation-runs')
      .set('Authorization', `Bearer ${authToken}`)
      .send({})

    expect(res.status).toBe(403)
    expect(matchingRepoMock.findMatchingPrograms).not.toHaveBeenCalled()
  })

  it('generates a run for the owning ADVISOR', async () => {
    const authToken = asAdvisor(ADVISOR_ID)
    matchingRepoMock.findMatchingPrograms.mockResolvedValue([
      makeProgram(),
    ] as any)
    recommendationsRepoMock.createRunWithRecommendations.mockResolvedValue({
      public_id: 'RUN-1001',
      weights_version: 1,
      scoring_version: 'v1',
      created_at: new Date('2026-09-23'),
    } as any)

    const res = await request(app)
      .post('/api/v1/students/STU-8440/recommendation-runs')
      .set('Authorization', `Bearer ${authToken}`)
      .send({})

    expect(res.status).toBe(201)
    expect(body<{ publicId: string }>(res).data.publicId).toBe('RUN-1001')
  })

  it('returns 401 without a bearer token', async () => {
    const res = await request(app).post(
      '/api/v1/students/STU-8440/recommendation-runs',
    )
    expect(res.status).toBe(401)
  })
})

describe('Recommendation Runs API — GET /api/v1/students/:studentId/recommendations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    studentsRepoMock.findStudentByPublicId.mockResolvedValue(
      makeStudent() as any,
    )
  })

  it('returns an empty list when the student has no runs yet', async () => {
    const authToken = asAdvisor()
    recommendationsRepoMock.findLatestRunForStudent.mockResolvedValue(null)

    const res = await request(app)
      .get('/api/v1/students/STU-8440/recommendations')
      .set('Authorization', `Bearer ${authToken}`)

    expect(res.status).toBe(200)
    expect(
      body<{ recommendations: unknown[] }>(res).data.recommendations,
    ).toEqual([])
  })
})

describe('Shortlists API — POST & DELETE /api/v1/students/:studentId/shortlists', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    studentsRepoMock.findStudentByPublicId.mockResolvedValue(
      makeStudent() as any,
    )
  })

  it('shortlists a program for the owning ADVISOR', async () => {
    const authToken = asAdvisor()
    programsRepoMock.findProgramByPublicId.mockResolvedValue(
      makeProgram() as any,
    )

    const res = await request(app)
      .post('/api/v1/students/STU-8440/shortlists')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ programId: 'PRG-2001' })

    expect(res.status).toBe(201)
    expect(recommendationsRepoMock.upsertShortlist).toHaveBeenCalledWith(
      'student-uuid-1',
      'program-uuid-1',
    )
  })

  it('returns 404 removing a program that was never shortlisted', async () => {
    const authToken = asAdvisor()
    programsRepoMock.findProgramByPublicId.mockResolvedValue(
      makeProgram() as any,
    )
    recommendationsRepoMock.findShortlist.mockResolvedValue(null)

    const res = await request(app)
      .delete('/api/v1/students/STU-8440/shortlists/PRG-2001')
      .set('Authorization', `Bearer ${authToken}`)

    expect(res.status).toBe(404)
  })
})

describe('Recommendation Runs API — GET /api/v1/recommendation-runs/:runId', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 403 for an ADVISOR the run student is not assigned to', async () => {
    const authToken = asAdvisor(OTHER_ADVISOR_ID)
    recommendationsRepoMock.findRunByPublicId.mockResolvedValue({
      public_id: 'RUN-1001',
      student_id: 'student-uuid-1',
      weights_version: 1,
      scoring_version: 'v1',
      created_at: new Date('2026-09-23'),
      student: { assigned_advisor_id: ADVISOR_ID, public_id: 'STU-8440' },
      recommendations: [],
    } as any)

    const res = await request(app)
      .get('/api/v1/recommendation-runs/RUN-1001')
      .set('Authorization', `Bearer ${authToken}`)

    expect(res.status).toBe(403)
  })

  it('returns 404 for an unknown run', async () => {
    const authToken = asAdvisor()
    recommendationsRepoMock.findRunByPublicId.mockResolvedValue(null)

    const res = await request(app)
      .get('/api/v1/recommendation-runs/RUN-9999')
      .set('Authorization', `Bearer ${authToken}`)

    expect(res.status).toBe(404)
  })
})

const makeListRow = (overrides: Record<string, unknown> = {}) => ({
  public_id: 'RUN-1001:PRG-2001',
  program_id: 'program-uuid-1',
  program_fit: 70,
  budget_fit: 60,
  intake_fit: 50,
  visa_fit: 82,
  overall_score: 65.9,
  reasons: ['Study level matches this undergraduate program'],
  missing_requirements: [],
  run: {
    student_id: 'student-uuid-1',
    created_at: new Date('2026-09-23'),
    student: {
      public_id: 'STU-8440',
      contact: { first_name: 'Chinedu', last_name: 'Nwosu' },
    },
  },
  program: {
    public_id: 'PRG-2001',
    name: 'BSc Psychology',
    qualification: 'BSc',
    category: 'Psychology',
    tuition_amount: 15973,
    tuition_currency: 'GBP',
    school: {
      public_id: 'SCH-4667',
      name: 'University of East London',
      country: 'United Kingdom',
      city: 'London',
    },
  },
  ...overrides,
})

describe('Recommendations List API — GET /api/v1/recommendations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    recommendationsRepoMock.countRecommendations.mockResolvedValue(0)
    recommendationsRepoMock.countShortlistsForScope.mockResolvedValue(0)
    recommendationsRepoMock.findShortlistPairsForStudents.mockResolvedValue(
      new Set(),
    )
  })

  it('returns 401 without a bearer token', async () => {
    const res = await request(app).get('/api/v1/recommendations')
    expect(res.status).toBe(401)
  })

  it('scopes an ADVISOR to their own students and ignores a client-supplied advisorId', async () => {
    const authToken = asAdvisor(ADVISOR_ID)
    recommendationsRepoMock.findLatestRunIdsForScope.mockResolvedValue([])

    const res = await request(app)
      .get('/api/v1/recommendations?advisorId=USR-000000000002')
      .set('Authorization', `Bearer ${authToken}`)

    expect(res.status).toBe(200)
    expect(
      recommendationsRepoMock.findLatestRunIdsForScope,
    ).toHaveBeenCalledWith({
      assigned_advisor_id: ADVISOR_ID,
    })
    expect(teamRepoMock.findUserByPublicId).not.toHaveBeenCalled()
  })

  it('returns zeroed results when the scope has no runs yet', async () => {
    const authToken = asAdmin()
    recommendationsRepoMock.findLatestRunIdsForScope.mockResolvedValue([])

    const res = await request(app)
      .get('/api/v1/recommendations')
      .set('Authorization', `Bearer ${authToken}`)

    expect(res.status).toBe(200)
    expect(
      body<{ recommendations: unknown[]; summary: { generated: number } }>(res)
        .data,
    ).toEqual(
      expect.objectContaining({
        recommendations: [],
        summary: {
          generated: 0,
          strongMatches: 0,
          missingRequirements: 0,
          shortlisted: 0,
        },
      }),
    )
    expect(
      recommendationsRepoMock.listAndCountRecommendations,
    ).not.toHaveBeenCalled()
  })

  it('returns 404 when ADMIN filters by an unknown advisorId', async () => {
    const authToken = asAdmin()
    teamRepoMock.findUserByPublicId.mockResolvedValue(null)

    const res = await request(app)
      .get('/api/v1/recommendations?advisorId=USR-000000000099')
      .set('Authorization', `Bearer ${authToken}`)

    expect(res.status).toBe(404)
  })

  it('returns mapped rows with pagination and summary for ADMIN', async () => {
    const authToken = asAdmin()
    recommendationsRepoMock.findLatestRunIdsForScope.mockResolvedValue([
      'run-uuid-1',
    ])
    recommendationsRepoMock.listAndCountRecommendations.mockResolvedValue({
      recommendations: [makeListRow() as any],
      total: 1,
    })
    recommendationsRepoMock.countRecommendations.mockResolvedValueOnce(5) // generated
    recommendationsRepoMock.countRecommendations.mockResolvedValueOnce(2) // strongMatches
    recommendationsRepoMock.countRecommendations.mockResolvedValueOnce(1) // missingRequirements
    recommendationsRepoMock.countShortlistsForScope.mockResolvedValue(3)

    const res = await request(app)
      .get('/api/v1/recommendations')
      .set('Authorization', `Bearer ${authToken}`)

    expect(res.status).toBe(200)
    const data = body<{
      recommendations: {
        studentId: string
        studentName: string
        overallScore: number
      }[]
      summary: {
        generated: number
        strongMatches: number
        missingRequirements: number
        shortlisted: number
      }
    }>(res).data

    expect(data.recommendations).toHaveLength(1)
    expect(data.recommendations[0]).toMatchObject({
      studentId: 'STU-8440',
      studentName: 'Chinedu Nwosu',
      overallScore: 65.9,
    })
    expect(data.summary).toEqual({
      generated: 5,
      strongMatches: 2,
      missingRequirements: 1,
      shortlisted: 3,
    })
  })
})
