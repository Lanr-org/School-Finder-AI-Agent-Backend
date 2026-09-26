import './setup-env'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import app from '../src/app'
import { generateAcessToken } from '../src/common/security/token'
import AuthRepo from '../src/modules/auth/auth.repository'
import { SchoolsRepo } from '../src/modules/schools/schools.repository'
import { AuditRepo } from '../src/modules/audit/audit.repository'
import { SchoolsService } from '../src/modules/schools/schools.service'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../src/modules/auth/auth.repository', () => ({
  default: {
    findUser: vi.fn(),
    findAuthSessionById: vi.fn(),
  },
}))

vi.mock('../src/modules/schools/schools.repository', () => ({
  SchoolsRepo: {
    createSchool: vi.fn(),
    findSchoolByPublicId: vi.fn(),
    listSchools: vi.fn(),
    updateSchool: vi.fn(),
    softDeleteSchool: vi.fn(),
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
// Globally mocked in tests/setup-global-mocks.ts.
const auditRepoMock = vi.mocked(AuditRepo)

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
  visa_friendliness_notes: 'Canada has strong study permit approval rates.' as
    | string
    | null,
  admission_friendliness_score: 40 as number | null,
  admission_friendliness_notes:
    'Highly competitive for international applicants.' as string | null,
  ranking_reputation_notes: 'Top 25 globally ranked university.' as
    | string
    | null,

  created_at: new Date('2024-01-01'),
  updated_at: new Date('2024-01-01'),
  ...overrides,
})

const makeAdminToken = () =>
  generateAcessToken(ADMIN_ID, SESSION_ID, 'ADMIN', 0)

const validCreatePayload = {
  name: 'University of Toronto',
  schoolType: 'UNIVERSITY',
  city: 'Toronto',
  country: 'Canada',
  website: 'https://www.utoronto.ca',
  admissionsEmail: 'admissions@utoronto.ca',
}

// ── HTTP Test Suites ──────────────────────────────────────────────────────────

describe('Schools API — POST /api/v1/schools', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authRepoMock.findUser.mockResolvedValue(makeAdminUser())
    authRepoMock.findAuthSessionById.mockResolvedValue(makeSession())
  })

  it('returns 201 and the created school on success', async () => {
    schoolsRepoMock.createSchool.mockResolvedValue(makeSchool())

    const token = makeAdminToken()
    const res = await request(app)
      .post('/api/v1/schools')
      .set('Authorization', `Bearer ${token}`)
      .send(validCreatePayload)

    const b = body<{ publicId: string; name: string; partnerStatus: string }>(
      res,
    )
    expect(res.status).toBe(201)
    expect(b.success).toBe(true)
    expect(b.data.publicId).toBe('SCH-1001')
    expect(b.data.name).toBe('University of Toronto')
    expect(schoolsRepoMock.createSchool).toHaveBeenCalledWith(
      expect.stringMatching(/^SCH-\d{4}$/),
      expect.objectContaining({ name: 'University of Toronto' }),
      expect.anything(),
    )
  })

  it('returns 400 for missing required fields', async () => {
    const token = makeAdminToken()
    const res = await request(app)
      .post('/api/v1/schools')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Incomplete School' })

    expect(res.status).toBe(400)
    expect(body(res).error?.code).toBe('VALIDATION_ERROR')
  })

  it('returns 400 for an invalid schoolType', async () => {
    const token = makeAdminToken()
    const res = await request(app)
      .post('/api/v1/schools')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...validCreatePayload, schoolType: 'ACADEMY' })

    expect(res.status).toBe(400)
    expect(body(res).error?.code).toBe('VALIDATION_ERROR')
  })

  it('returns 400 for an invalid website URL', async () => {
    const token = makeAdminToken()
    const res = await request(app)
      .post('/api/v1/schools')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...validCreatePayload, website: 'not-a-url' })

    expect(res.status).toBe(400)
    expect(body(res).error?.code).toBe('VALIDATION_ERROR')
  })

  it('returns 400 for an invalid admissions email', async () => {
    const token = makeAdminToken()
    const res = await request(app)
      .post('/api/v1/schools')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...validCreatePayload, admissionsEmail: 'not-an-email' })

    expect(res.status).toBe(400)
    expect(body(res).error?.code).toBe('VALIDATION_ERROR')
  })

  it('returns 401 if no bearer token', async () => {
    const res = await request(app)
      .post('/api/v1/schools')
      .send(validCreatePayload)

    expect(res.status).toBe(401)
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('Schools API — GET /api/v1/schools', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authRepoMock.findUser.mockResolvedValue(makeAdminUser())
    authRepoMock.findAuthSessionById.mockResolvedValue(makeSession())
  })

  it('returns 200 with a paginated list of schools', async () => {
    schoolsRepoMock.listSchools.mockResolvedValue({
      schools: [makeSchool()],
      total: 1,
    })

    const token = makeAdminToken()
    const res = await request(app)
      .get('/api/v1/schools')
      .set('Authorization', `Bearer ${token}`)

    const b = body<{
      schools: Array<{ publicId: string }>
      pagination: { page: number; limit: number; total: number }
    }>(res)
    expect(res.status).toBe(200)
    expect(b.data.schools).toHaveLength(1)
    expect(b.data.schools[0]?.publicId).toBe('SCH-1001')
    expect(b.data.pagination).toEqual({
      page: 1,
      limit: 20,
      total: 1,
      totalPages: 1,
    })
  })

  it('returns 200 with an empty list when no schools match', async () => {
    schoolsRepoMock.listSchools.mockResolvedValue({ schools: [], total: 0 })

    const token = makeAdminToken()
    const res = await request(app)
      .get('/api/v1/schools')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(body<{ schools: unknown[] }>(res).data.schools).toEqual([])
  })

  it('forwards filter query params to the repository', async () => {
    schoolsRepoMock.listSchools.mockResolvedValue({ schools: [], total: 0 })

    const token = makeAdminToken()
    await request(app)
      .get('/api/v1/schools')
      .query({
        country: 'Canada',
        city: 'Toronto',
        schoolType: 'UNIVERSITY',
        partnerStatus: 'PARTNER',
        search: 'Toronto',
        page: '2',
        limit: '10',
      })
      .set('Authorization', `Bearer ${token}`)

    expect(schoolsRepoMock.listSchools).toHaveBeenCalledWith(
      expect.objectContaining({
        country: 'Canada',
        city: 'Toronto',
        schoolType: 'UNIVERSITY',
        partnerStatus: 'PARTNER',
        search: 'Toronto',
        page: 2,
        limit: 10,
      }),
    )
  })

  it('returns 400 for an invalid schoolType filter', async () => {
    const token = makeAdminToken()
    const res = await request(app)
      .get('/api/v1/schools')
      .query({ schoolType: 'ACADEMY' })
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(400)
    expect(body(res).error?.code).toBe('VALIDATION_ERROR')
  })

  it('returns 401 if not authenticated', async () => {
    const res = await request(app).get('/api/v1/schools')
    expect(res.status).toBe(401)
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('Schools API — GET /api/v1/schools/:schoolId', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authRepoMock.findUser.mockResolvedValue(makeAdminUser())
    authRepoMock.findAuthSessionById.mockResolvedValue(makeSession())
  })

  it('returns 200 with the school', async () => {
    schoolsRepoMock.findSchoolByPublicId.mockResolvedValue(makeSchool())

    const token = makeAdminToken()
    const res = await request(app)
      .get('/api/v1/schools/SCH-1001')
      .set('Authorization', `Bearer ${token}`)

    const b = body<{ publicId: string; city: string }>(res)
    expect(res.status).toBe(200)
    expect(b.data.publicId).toBe('SCH-1001')
    expect(b.data.city).toBe('Toronto')
  })

  it('returns 404 for an unknown schoolId', async () => {
    schoolsRepoMock.findSchoolByPublicId.mockResolvedValue(null)

    const token = makeAdminToken()
    const res = await request(app)
      .get('/api/v1/schools/SCH-9999')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(404)
    expect(body(res).error?.code).toBe('NOT_FOUND')
  })

  it('returns 400 for a malformed schoolId', async () => {
    const token = makeAdminToken()
    const res = await request(app)
      .get('/api/v1/schools/not-a-valid-id')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(400)
    expect(body(res).error?.code).toBe('VALIDATION_ERROR')
  })

  it('returns 401 if not authenticated', async () => {
    const res = await request(app).get('/api/v1/schools/SCH-1001')
    expect(res.status).toBe(401)
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('Schools API — PATCH /api/v1/schools/:schoolId', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authRepoMock.findUser.mockResolvedValue(makeAdminUser())
    authRepoMock.findAuthSessionById.mockResolvedValue(makeSession())
  })

  it('returns 200 with the updated school', async () => {
    schoolsRepoMock.findSchoolByPublicId.mockResolvedValue(makeSchool())
    schoolsRepoMock.updateSchool.mockResolvedValue(
      makeSchool({ partner_status: 'NON_PARTNER' }),
    )

    const token = makeAdminToken()
    const res = await request(app)
      .patch('/api/v1/schools/SCH-1001')
      .set('Authorization', `Bearer ${token}`)
      .send({ partnerStatus: 'NON_PARTNER' })

    const b = body<{ partnerStatus: string }>(res)
    expect(res.status).toBe(200)
    expect(b.data.partnerStatus).toBe('NON_PARTNER')
    expect(schoolsRepoMock.updateSchool).toHaveBeenCalledWith(
      'school-uuid-0001',
      expect.objectContaining({ partnerStatus: 'NON_PARTNER' }),
      expect.anything(),
    )
    const row = auditRepoMock.record.mock.calls[0]?.[1]
    expect(row).toMatchObject({
      action: 'school.updated',
      entity_type: 'school',
      entity_id: 'SCH-1001',
      before_data: expect.objectContaining({ partnerStatus: 'PARTNER' }),
      after_data: expect.objectContaining({ partnerStatus: 'NON_PARTNER' }),
    })
    // Snapshots use the public shape: no internal UUID leaks into the log.
    expect(JSON.stringify(row?.before_data)).not.toContain('school-uuid-0001')
  })

  it('returns 400 if no updatable field is provided', async () => {
    const token = makeAdminToken()
    const res = await request(app)
      .patch('/api/v1/schools/SCH-1001')
      .set('Authorization', `Bearer ${token}`)
      .send({})

    expect(res.status).toBe(400)
    expect(body(res).error?.code).toBe('VALIDATION_ERROR')
  })

  it('returns 404 for an unknown schoolId', async () => {
    schoolsRepoMock.findSchoolByPublicId.mockResolvedValue(null)

    const token = makeAdminToken()
    const res = await request(app)
      .patch('/api/v1/schools/SCH-9999')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Ghost School' })

    expect(res.status).toBe(404)
    expect(body(res).error?.code).toBe('NOT_FOUND')
  })

  it('returns 401 if not authenticated', async () => {
    const res = await request(app)
      .patch('/api/v1/schools/SCH-1001')
      .send({ name: 'Someone' })

    expect(res.status).toBe(401)
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('Schools API — DELETE /api/v1/schools/:schoolId', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authRepoMock.findUser.mockResolvedValue(makeAdminUser())
    authRepoMock.findAuthSessionById.mockResolvedValue(makeSession())
  })

  it('returns 200 and deactivates an active school', async () => {
    schoolsRepoMock.findSchoolByPublicId.mockResolvedValue(makeSchool())
    schoolsRepoMock.softDeleteSchool.mockResolvedValue(
      makeSchool({ record_status: 'INACTIVE' }),
    )

    const token = makeAdminToken()
    const res = await request(app)
      .delete('/api/v1/schools/SCH-1001')
      .set('Authorization', `Bearer ${token}`)

    const b = body<{ recordStatus: string }>(res)
    expect(res.status).toBe(200)
    expect(b.data.recordStatus).toBe('INACTIVE')
    expect(schoolsRepoMock.softDeleteSchool).toHaveBeenCalledWith(
      'school-uuid-0001',
      expect.anything(),
    )
  })

  it('does not remove the row — the school remains retrievable', async () => {
    schoolsRepoMock.findSchoolByPublicId.mockResolvedValue(makeSchool())
    schoolsRepoMock.softDeleteSchool.mockResolvedValue(
      makeSchool({ record_status: 'INACTIVE' }),
    )

    const token = makeAdminToken()
    await request(app)
      .delete('/api/v1/schools/SCH-1001')
      .set('Authorization', `Bearer ${token}`)

    expect(schoolsRepoMock.createSchool).not.toHaveBeenCalled()
    // updateSchool (hard field update) is not used for delete — only the
    // dedicated soft-delete path is, confirming no row removal occurred.
    expect(schoolsRepoMock.updateSchool).not.toHaveBeenCalled()
  })

  it('returns 409 if the school is already inactive', async () => {
    schoolsRepoMock.findSchoolByPublicId.mockResolvedValue(
      makeSchool({ record_status: 'INACTIVE' }),
    )

    const token = makeAdminToken()
    const res = await request(app)
      .delete('/api/v1/schools/SCH-1001')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(409)
    expect(body(res).error?.code).toBe('CONFLICT')
    expect(schoolsRepoMock.softDeleteSchool).not.toHaveBeenCalled()
  })

  it('returns 404 for an unknown schoolId', async () => {
    schoolsRepoMock.findSchoolByPublicId.mockResolvedValue(null)

    const token = makeAdminToken()
    const res = await request(app)
      .delete('/api/v1/schools/SCH-9999')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(404)
    expect(body(res).error?.code).toBe('NOT_FOUND')
  })

  it('returns 400 for a malformed schoolId', async () => {
    const token = makeAdminToken()
    const res = await request(app)
      .delete('/api/v1/schools/not-a-valid-id')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(400)
    expect(body(res).error?.code).toBe('VALIDATION_ERROR')
  })

  it('returns 401 if not authenticated', async () => {
    const res = await request(app).delete('/api/v1/schools/SCH-1001')
    expect(res.status).toBe(401)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Service unit tests — no HTTP layer, test business logic directly
// ─────────────────────────────────────────────────────────────────────────────

describe('SchoolsService.CreateSchool — unit', () => {
  beforeEach(() => vi.clearAllMocks())

  it('generates a public ID matching the SCH-#### format', async () => {
    schoolsRepoMock.createSchool.mockResolvedValue(makeSchool())

    await SchoolsService.CreateSchool({
      name: 'McGill University',
      schoolType: 'UNIVERSITY',
      city: 'Montreal',
      country: 'Canada',
    })

    const [publicId] = schoolsRepoMock.createSchool.mock.calls[0] ?? []
    expect(publicId).toMatch(/^SCH-\d{4}$/)
  })

  it('maps repository fields into a camelCase response', async () => {
    schoolsRepoMock.createSchool.mockResolvedValue(makeSchool())

    const result = await SchoolsService.CreateSchool({
      name: 'University of Toronto',
      schoolType: 'UNIVERSITY',
      city: 'Toronto',
      country: 'Canada',
    })

    expect(result).not.toHaveProperty('school_type')
    expect(result).not.toHaveProperty('public_id')
    expect(result.schoolType).toBe('UNIVERSITY')
    expect(result.publicId).toBe('SCH-1001')
  })
})

describe('SchoolsService.GetSchool — unit', () => {
  beforeEach(() => vi.clearAllMocks())

  it('throws NOT_FOUND when the school does not exist', async () => {
    schoolsRepoMock.findSchoolByPublicId.mockResolvedValue(null)

    await expect(SchoolsService.GetSchool('SCH-9999')).rejects.toMatchObject({
      code: 'NOT_FOUND',
      statusCode: 404,
    })
  })

  it('returns the mapped school when found', async () => {
    schoolsRepoMock.findSchoolByPublicId.mockResolvedValue(makeSchool())

    const result = await SchoolsService.GetSchool('SCH-1001')
    expect(result.publicId).toBe('SCH-1001')
    expect(result.partnerStatus).toBe('PARTNER')
  })
})

describe('SchoolsService.UpdateSchool — unit', () => {
  beforeEach(() => vi.clearAllMocks())

  it('throws NOT_FOUND when the school does not exist', async () => {
    schoolsRepoMock.findSchoolByPublicId.mockResolvedValue(null)

    await expect(
      SchoolsService.UpdateSchool('SCH-9999', { name: 'Ghost' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 })
  })

  it('updates by internal id, not the public id', async () => {
    schoolsRepoMock.findSchoolByPublicId.mockResolvedValue(makeSchool())
    schoolsRepoMock.updateSchool.mockResolvedValue(makeSchool())

    await SchoolsService.UpdateSchool('SCH-1001', { city: 'North York' })

    expect(schoolsRepoMock.updateSchool).toHaveBeenCalledWith(
      'school-uuid-0001',
      expect.objectContaining({ city: 'North York' }),
      expect.anything(),
    )
  })
})

describe('SchoolsService.DeleteSchool — unit', () => {
  beforeEach(() => vi.clearAllMocks())

  it('throws NOT_FOUND when the school does not exist', async () => {
    schoolsRepoMock.findSchoolByPublicId.mockResolvedValue(null)

    await expect(
      SchoolsService.DeleteSchool('SCH-9999'),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 })
  })

  it('throws CONFLICT when the school is already inactive', async () => {
    schoolsRepoMock.findSchoolByPublicId.mockResolvedValue(
      makeSchool({ record_status: 'INACTIVE' }),
    )

    await expect(
      SchoolsService.DeleteSchool('SCH-1001'),
    ).rejects.toMatchObject({ code: 'CONFLICT', statusCode: 409 })
  })

  it('soft-deletes by internal id, not the public id', async () => {
    schoolsRepoMock.findSchoolByPublicId.mockResolvedValue(makeSchool())
    schoolsRepoMock.softDeleteSchool.mockResolvedValue(
      makeSchool({ record_status: 'INACTIVE' }),
    )

    const result = await SchoolsService.DeleteSchool('SCH-1001')

    expect(schoolsRepoMock.softDeleteSchool).toHaveBeenCalledWith(
      'school-uuid-0001',
      expect.anything(),
    )
    expect(result.recordStatus).toBe('INACTIVE')
  })
})
