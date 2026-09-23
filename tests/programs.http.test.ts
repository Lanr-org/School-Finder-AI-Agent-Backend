import './setup-env'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import app from '../src/app'
import { generateAcessToken } from '../src/common/security/token'
import AuthRepo from '../src/modules/auth/auth.repository'
import { SchoolsRepo } from '../src/modules/schools/schools.repository'
import { ProgramsRepo } from '../src/modules/programs/programs.repository'
import { ProgramsService } from '../src/modules/programs/programs.service'
import { Prisma } from '../src/generated/prisma/index.js'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../src/modules/auth/auth.repository', () => ({
  default: {
    findUser: vi.fn(),
    findAuthSessionById: vi.fn(),
  },
}))

vi.mock('../src/modules/schools/schools.repository', () => ({
  SchoolsRepo: {
    findSchoolByPublicId: vi.fn(),
  },
}))

vi.mock('../src/modules/programs/programs.repository', () => ({
  ProgramsRepo: {
    createProgram: vi.fn(),
    findProgramByPublicId: vi.fn(),
    listPrograms: vi.fn(),
    updateProgram: vi.fn(),
  },
}))

// ── Typed response helpers ────────────────────────────────────────────────────

type ApiBody<T = unknown> = {
  success: boolean
  message: string
  data: T
  meta?: { requestId: unknown }
  error?: { code: string; message: string }
}

function body<T = unknown>(res: { body: unknown }): ApiBody<T> {
  return res.body as ApiBody<T>
}

// ── Repo mocks ───────────────────────────────────────────────────────────────

const authRepoMock = vi.mocked(AuthRepo)
const schoolsRepoMock = vi.mocked(SchoolsRepo)
const programsRepoMock = vi.mocked(ProgramsRepo)

// ── Constants ─────────────────────────────────────────────────────────────────

const ADMIN_ID = 'admin-user-uuid-0001'
const SESSION_ID = 'session-uuid-0001'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const makeAdminUser = (overrides: Record<string, unknown> = {}) => ({
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

const makeSchool = (overrides: Record<string, unknown> = {}) => ({
  id: 'school-uuid-0001',
  public_id: 'SCH-1001',
  name: 'University of Toronto',
  school_type: 'UNIVERSITY' as const,
  record_status: 'ACTIVE' as const,
  description: null as string | null,

  website: 'https://www.utoronto.ca',
  admissions_email: 'admissions@utoronto.ca',
  phone_numbers: ['+1-416-978-2011'],

  street_address: "27 King's College Circle" as string | null,
  city: 'Toronto',
  country: 'Canada',
  postal_code: 'M5S 1A1' as string | null,

  partner_status: 'PARTNER' as const,
  visa_friendliness_score: 85 as number | null,
  visa_friendliness_notes: null as string | null,
  admission_friendliness_score: 40 as number | null,
  admission_friendliness_notes: null as string | null,
  ranking_reputation_notes: null as string | null,

  created_at: new Date('2024-01-01'),
  updated_at: new Date('2024-01-01'),
  ...overrides,
})

const makeProgram = (overrides: Record<string, unknown> = {}) => ({
  id: 'program-uuid-0001',
  public_id: 'PRG-2001',
  name: 'MSc Computer Science',
  study_level: 'POSTGRADUATE' as const,
  qualification: 'MSc',
  category: 'Computer Science',
  duration: '1 year',
  school_id: 'school-uuid-0001',
  school: { public_id: 'SCH-1001', name: 'University of Toronto' },

  tuition_amount: new Prisma.Decimal(32000),
  tuition_currency: 'CAD',
  scholarship_availability: '10%' as string | null,

  intakes: [
    { id: 'intake-uuid-0001', program_id: 'program-uuid-0001', month: 'SEPTEMBER', year: 2026, application_deadline: new Date('2026-01-15') },
    { id: 'intake-uuid-0002', program_id: 'program-uuid-0001', month: 'JANUARY', year: 2027, application_deadline: new Date('2026-10-01') },
  ] as {
    id: string
    program_id: string
    month:
      | 'JANUARY'
      | 'FEBRUARY'
      | 'MARCH'
      | 'APRIL'
      | 'MAY'
      | 'JUNE'
      | 'JULY'
      | 'AUGUST'
      | 'SEPTEMBER'
      | 'OCTOBER'
      | 'NOVEMBER'
      | 'DECEMBER'
    year: number
    application_deadline: Date | null
  }[],

  academic_requirements: "Bachelor's degree with 3.0 GPA" as string | null,
  english_requirements: 'IELTS 6.5 overall' as string | null,
  operation_notes: 'Popular program, fills quickly.' as string | null,

  created_at: new Date('2024-01-01'),
  updated_at: new Date('2024-01-01'),
  ...overrides,
})

const makeAdminToken = () =>
  generateAcessToken(ADMIN_ID, SESSION_ID, 'ADMIN', 0)

const validCreatePayload = {
  name: 'MSc Computer Science',
  studyLevel: 'POSTGRADUATE',
  qualification: 'MSc',
  category: 'Computer Science',
  duration: '1 year',
  schoolId: 'SCH-1001',
  tuitionAmount: 32000,
  tuitionCurrency: 'CAD',
}

// ── HTTP Test Suites ──────────────────────────────────────────────────────────

describe('Programs API — POST /api/v1/programs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authRepoMock.findUser.mockResolvedValue(makeAdminUser())
    authRepoMock.findAuthSessionById.mockResolvedValue(makeSession())
  })

  it('returns 201 and the created program on success', async () => {
    schoolsRepoMock.findSchoolByPublicId.mockResolvedValue(makeSchool())
    programsRepoMock.createProgram.mockResolvedValue(makeProgram())

    const token = makeAdminToken()
    const res = await request(app)
      .post('/api/v1/programs')
      .set('Authorization', `Bearer ${token}`)
      .send(validCreatePayload)

    const b = body<{ publicId: string; school: { publicId: string } }>(res)
    expect(res.status).toBe(201)
    expect(b.success).toBe(true)
    expect(b.data.publicId).toBe('PRG-2001')
    expect(b.data.school.publicId).toBe('SCH-1001')
    expect(programsRepoMock.createProgram).toHaveBeenCalledWith(
      expect.stringMatching(/^PRG-\d{4}$/),
      'school-uuid-0001',
      expect.objectContaining({ name: 'MSc Computer Science' }),
    )
  })

  it('returns 404 when the school does not exist', async () => {
    schoolsRepoMock.findSchoolByPublicId.mockResolvedValue(null)

    const token = makeAdminToken()
    const res = await request(app)
      .post('/api/v1/programs')
      .set('Authorization', `Bearer ${token}`)
      .send(validCreatePayload)

    expect(res.status).toBe(404)
    expect(body(res).error?.code).toBe('NOT_FOUND')
    expect(programsRepoMock.createProgram).not.toHaveBeenCalled()
  })

  it('returns 400 for missing required fields', async () => {
    const token = makeAdminToken()
    const res = await request(app)
      .post('/api/v1/programs')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Incomplete Program' })

    expect(res.status).toBe(400)
    expect(body(res).error?.code).toBe('VALIDATION_ERROR')
  })

  it('returns 400 for an invalid studyLevel', async () => {
    const token = makeAdminToken()
    const res = await request(app)
      .post('/api/v1/programs')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...validCreatePayload, studyLevel: 'MASTERS' })

    expect(res.status).toBe(400)
    expect(body(res).error?.code).toBe('VALIDATION_ERROR')
  })

  it('returns 400 for a malformed schoolId', async () => {
    const token = makeAdminToken()
    const res = await request(app)
      .post('/api/v1/programs')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...validCreatePayload, schoolId: 'not-a-school-id' })

    expect(res.status).toBe(400)
    expect(body(res).error?.code).toBe('VALIDATION_ERROR')
  })

  it('returns 400 for a tuitionCurrency that is not 3 letters', async () => {
    const token = makeAdminToken()
    const res = await request(app)
      .post('/api/v1/programs')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...validCreatePayload, tuitionCurrency: 'CAND' })

    expect(res.status).toBe(400)
    expect(body(res).error?.code).toBe('VALIDATION_ERROR')
  })

  it('normalises tuitionCurrency to uppercase', async () => {
    schoolsRepoMock.findSchoolByPublicId.mockResolvedValue(makeSchool())
    programsRepoMock.createProgram.mockResolvedValue(makeProgram())

    const token = makeAdminToken()
    await request(app)
      .post('/api/v1/programs')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...validCreatePayload, tuitionCurrency: 'cad' })

    expect(programsRepoMock.createProgram).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ tuitionCurrency: 'CAD' }),
    )
  })

  it('returns 401 if no bearer token', async () => {
    const res = await request(app)
      .post('/api/v1/programs')
      .send(validCreatePayload)

    expect(res.status).toBe(401)
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('Programs API — GET /api/v1/programs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authRepoMock.findUser.mockResolvedValue(makeAdminUser())
    authRepoMock.findAuthSessionById.mockResolvedValue(makeSession())
  })

  it('returns 200 with a paginated list of programs', async () => {
    programsRepoMock.listPrograms.mockResolvedValue({
      programs: [makeProgram()],
      total: 1,
    })

    const token = makeAdminToken()
    const res = await request(app)
      .get('/api/v1/programs')
      .set('Authorization', `Bearer ${token}`)

    const b = body<{
      programs: Array<{ publicId: string }>
      pagination: { page: number; limit: number; total: number }
    }>(res)
    expect(res.status).toBe(200)
    expect(b.data.programs).toHaveLength(1)
    expect(b.data.programs[0]?.publicId).toBe('PRG-2001')
    expect(b.data.pagination).toEqual({
      page: 1,
      limit: 20,
      total: 1,
      totalPages: 1,
    })
  })

  it('returns 200 with an empty list when no programs match', async () => {
    programsRepoMock.listPrograms.mockResolvedValue({ programs: [], total: 0 })

    const token = makeAdminToken()
    const res = await request(app)
      .get('/api/v1/programs')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(body<{ programs: unknown[] }>(res).data.programs).toEqual([])
  })

  it('resolves the schoolId filter to an internal id before querying', async () => {
    schoolsRepoMock.findSchoolByPublicId.mockResolvedValue(makeSchool())
    programsRepoMock.listPrograms.mockResolvedValue({ programs: [], total: 0 })

    const token = makeAdminToken()
    await request(app)
      .get('/api/v1/programs')
      .query({ schoolId: 'SCH-1001', studyLevel: 'POSTGRADUATE', page: '2', limit: '10' })
      .set('Authorization', `Bearer ${token}`)

    expect(schoolsRepoMock.findSchoolByPublicId).toHaveBeenCalledWith('SCH-1001')
    expect(programsRepoMock.listPrograms).toHaveBeenCalledWith(
      expect.objectContaining({
        schoolId: 'school-uuid-0001',
        studyLevel: 'POSTGRADUATE',
        page: 2,
        limit: 10,
      }),
    )
  })

  it('returns 404 when the schoolId filter does not match a school', async () => {
    schoolsRepoMock.findSchoolByPublicId.mockResolvedValue(null)

    const token = makeAdminToken()
    const res = await request(app)
      .get('/api/v1/programs')
      .query({ schoolId: 'SCH-9999' })
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(404)
    expect(body(res).error?.code).toBe('NOT_FOUND')
    expect(programsRepoMock.listPrograms).not.toHaveBeenCalled()
  })

  it('returns 400 for an invalid studyLevel filter', async () => {
    const token = makeAdminToken()
    const res = await request(app)
      .get('/api/v1/programs')
      .query({ studyLevel: 'MASTERS' })
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(400)
    expect(body(res).error?.code).toBe('VALIDATION_ERROR')
  })

  it('returns 401 if not authenticated', async () => {
    const res = await request(app).get('/api/v1/programs')
    expect(res.status).toBe(401)
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('Programs API — GET /api/v1/programs/:programId', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authRepoMock.findUser.mockResolvedValue(makeAdminUser())
    authRepoMock.findAuthSessionById.mockResolvedValue(makeSession())
  })

  it('returns 200 with the program', async () => {
    programsRepoMock.findProgramByPublicId.mockResolvedValue(makeProgram())

    const token = makeAdminToken()
    const res = await request(app)
      .get('/api/v1/programs/PRG-2001')
      .set('Authorization', `Bearer ${token}`)

    const b = body<{ publicId: string; qualification: string }>(res)
    expect(res.status).toBe(200)
    expect(b.data.publicId).toBe('PRG-2001')
    expect(b.data.qualification).toBe('MSc')
  })

  it('returns 404 for an unknown programId', async () => {
    programsRepoMock.findProgramByPublicId.mockResolvedValue(null)

    const token = makeAdminToken()
    const res = await request(app)
      .get('/api/v1/programs/PRG-9999')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(404)
    expect(body(res).error?.code).toBe('NOT_FOUND')
  })

  it('returns 400 for a malformed programId', async () => {
    const token = makeAdminToken()
    const res = await request(app)
      .get('/api/v1/programs/not-a-valid-id')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(400)
    expect(body(res).error?.code).toBe('VALIDATION_ERROR')
  })

  it('returns 401 if not authenticated', async () => {
    const res = await request(app).get('/api/v1/programs/PRG-2001')
    expect(res.status).toBe(401)
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('Programs API — PATCH /api/v1/programs/:programId', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authRepoMock.findUser.mockResolvedValue(makeAdminUser())
    authRepoMock.findAuthSessionById.mockResolvedValue(makeSession())
  })

  it('returns 200 with the updated program', async () => {
    programsRepoMock.findProgramByPublicId.mockResolvedValue(makeProgram())
    programsRepoMock.updateProgram.mockResolvedValue(
      makeProgram({ duration: '2 years' }),
    )

    const token = makeAdminToken()
    const res = await request(app)
      .patch('/api/v1/programs/PRG-2001')
      .set('Authorization', `Bearer ${token}`)
      .send({ duration: '2 years' })

    const b = body<{ duration: string }>(res)
    expect(res.status).toBe(200)
    expect(b.data.duration).toBe('2 years')
    expect(programsRepoMock.updateProgram).toHaveBeenCalledWith(
      'program-uuid-0001',
      undefined,
      expect.objectContaining({ duration: '2 years' }),
    )
  })

  it('resolves a reassigned schoolId to an internal id', async () => {
    programsRepoMock.findProgramByPublicId.mockResolvedValue(makeProgram())
    schoolsRepoMock.findSchoolByPublicId.mockResolvedValue(
      makeSchool({ id: 'school-uuid-0002', public_id: 'SCH-2002' }),
    )
    programsRepoMock.updateProgram.mockResolvedValue(makeProgram())

    const token = makeAdminToken()
    await request(app)
      .patch('/api/v1/programs/PRG-2001')
      .set('Authorization', `Bearer ${token}`)
      .send({ schoolId: 'SCH-2002' })

    expect(programsRepoMock.updateProgram).toHaveBeenCalledWith(
      'program-uuid-0001',
      'school-uuid-0002',
      expect.objectContaining({ schoolId: 'SCH-2002' }),
    )
  })

  it('returns 404 when the reassigned school does not exist', async () => {
    programsRepoMock.findProgramByPublicId.mockResolvedValue(makeProgram())
    schoolsRepoMock.findSchoolByPublicId.mockResolvedValue(null)

    const token = makeAdminToken()
    const res = await request(app)
      .patch('/api/v1/programs/PRG-2001')
      .set('Authorization', `Bearer ${token}`)
      .send({ schoolId: 'SCH-9999' })

    expect(res.status).toBe(404)
    expect(body(res).error?.code).toBe('NOT_FOUND')
    expect(programsRepoMock.updateProgram).not.toHaveBeenCalled()
  })

  it('returns 400 if no updatable field is provided', async () => {
    const token = makeAdminToken()
    const res = await request(app)
      .patch('/api/v1/programs/PRG-2001')
      .set('Authorization', `Bearer ${token}`)
      .send({})

    expect(res.status).toBe(400)
    expect(body(res).error?.code).toBe('VALIDATION_ERROR')
  })

  it('returns 404 for an unknown programId', async () => {
    programsRepoMock.findProgramByPublicId.mockResolvedValue(null)

    const token = makeAdminToken()
    const res = await request(app)
      .patch('/api/v1/programs/PRG-9999')
      .set('Authorization', `Bearer ${token}`)
      .send({ duration: '3 years' })

    expect(res.status).toBe(404)
    expect(body(res).error?.code).toBe('NOT_FOUND')
  })

  it('returns 401 if not authenticated', async () => {
    const res = await request(app)
      .patch('/api/v1/programs/PRG-2001')
      .send({ duration: '3 years' })

    expect(res.status).toBe(401)
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('Schools API — GET /api/v1/schools/:schoolId/programs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authRepoMock.findUser.mockResolvedValue(makeAdminUser())
    authRepoMock.findAuthSessionById.mockResolvedValue(makeSession())
  })

  it("returns 200 with the school's programs", async () => {
    schoolsRepoMock.findSchoolByPublicId.mockResolvedValue(makeSchool())
    programsRepoMock.listPrograms.mockResolvedValue({
      programs: [makeProgram()],
      total: 1,
    })

    const token = makeAdminToken()
    const res = await request(app)
      .get('/api/v1/schools/SCH-1001/programs')
      .set('Authorization', `Bearer ${token}`)

    const b = body<{ programs: Array<{ publicId: string }> }>(res)
    expect(res.status).toBe(200)
    expect(b.data.programs[0]?.publicId).toBe('PRG-2001')
    expect(programsRepoMock.listPrograms).toHaveBeenCalledWith(
      expect.objectContaining({ schoolId: 'school-uuid-0001' }),
    )
  })

  it('returns 404 when the school does not exist', async () => {
    schoolsRepoMock.findSchoolByPublicId.mockResolvedValue(null)

    const token = makeAdminToken()
    const res = await request(app)
      .get('/api/v1/schools/SCH-9999/programs')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(404)
    expect(body(res).error?.code).toBe('NOT_FOUND')
  })

  it('returns 401 if not authenticated', async () => {
    const res = await request(app).get('/api/v1/schools/SCH-1001/programs')
    expect(res.status).toBe(401)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Service unit tests — no HTTP layer, test business logic directly
// ─────────────────────────────────────────────────────────────────────────────

describe('ProgramsService.CreateProgram — unit', () => {
  beforeEach(() => vi.clearAllMocks())

  it('throws NOT_FOUND when the school does not exist', async () => {
    schoolsRepoMock.findSchoolByPublicId.mockResolvedValue(null)

    await expect(
      ProgramsService.CreateProgram({
        name: 'MBA',
        studyLevel: 'POSTGRADUATE',
        qualification: 'MBA',
        category: 'Business',
        duration: '2 years',
        schoolId: 'SCH-9999',
        tuitionAmount: 40000,
        tuitionCurrency: 'USD',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 })
  })

  it('generates a public ID matching the PRG-#### format', async () => {
    schoolsRepoMock.findSchoolByPublicId.mockResolvedValue(makeSchool())
    programsRepoMock.createProgram.mockResolvedValue(makeProgram())

    await ProgramsService.CreateProgram({
      name: 'MSc Data Science',
      studyLevel: 'POSTGRADUATE',
      qualification: 'MSc',
      category: 'Computer Science',
      duration: '1 year',
      schoolId: 'SCH-1001',
      tuitionAmount: 30000,
      tuitionCurrency: 'CAD',
    })

    const [publicId] = programsRepoMock.createProgram.mock.calls[0] ?? []
    expect(publicId).toMatch(/^PRG-\d{4}$/)
  })
})

describe('ProgramsService.GetProgram — unit', () => {
  beforeEach(() => vi.clearAllMocks())

  it('throws NOT_FOUND when the program does not exist', async () => {
    programsRepoMock.findProgramByPublicId.mockResolvedValue(null)

    await expect(
      ProgramsService.GetProgram('PRG-9999'),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 })
  })

  it('maps the nested school relation into a public school reference', async () => {
    programsRepoMock.findProgramByPublicId.mockResolvedValue(makeProgram())

    const result = await ProgramsService.GetProgram('PRG-2001')

    expect(result).not.toHaveProperty('school_id')
    expect(result.school).toEqual({ publicId: 'SCH-1001', name: 'University of Toronto' })
  })
})

describe('ProgramsService.ListProgramsForSchool — unit', () => {
  beforeEach(() => vi.clearAllMocks())

  it('throws NOT_FOUND when the school does not exist', async () => {
    schoolsRepoMock.findSchoolByPublicId.mockResolvedValue(null)

    await expect(
      ProgramsService.ListProgramsForSchool('SCH-9999', { page: 1, limit: 20 }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 })
  })

  it('filters by the resolved internal school id', async () => {
    schoolsRepoMock.findSchoolByPublicId.mockResolvedValue(makeSchool())
    programsRepoMock.listPrograms.mockResolvedValue({ programs: [], total: 0 })

    await ProgramsService.ListProgramsForSchool('SCH-1001', { page: 1, limit: 20 })

    expect(programsRepoMock.listPrograms).toHaveBeenCalledWith(
      expect.objectContaining({ schoolId: 'school-uuid-0001' }),
    )
  })
})
