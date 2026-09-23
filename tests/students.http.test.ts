import './setup-env'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import app from '../src/app'
import { generateAcessToken } from '../src/common/security/token'
import AuthRepo from '../src/modules/auth/auth.repository'
import { StudentsRepo } from '../src/modules/students/students.repository'
import TeamRepo from '../src/modules/team/team.repository'
import { AdvisorsRepo } from '../src/modules/advisors/advisors.repository'

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
    listStudents: vi.fn(),
    assignAdvisorToStudent: vi.fn(),
    unassignAdvisorFromStudent: vi.fn(),
    updateStudentStatus: vi.fn(),
  },
}))

vi.mock('../src/modules/team/team.repository', () => ({
  default: {
    findUserByPublicId: vi.fn(),
    findUsersByIds: vi.fn(),
  },
}))

vi.mock('../src/modules/advisors/advisors.repository', () => ({
  AdvisorsRepo: {
    findProfileByUserId: vi.fn(),
    countActiveStudentsForAdvisor: vi.fn(),
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
const teamRepoMock = vi.mocked(TeamRepo)
const advisorsRepoMock = vi.mocked(AdvisorsRepo)

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
  study_level: 'BACHELORS' as string | null,
  target_destinations: ['United Kingdom'],
  target_intake_month: 'SEPTEMBER' as string | null,
  target_intake_year: 2026 as number | null,
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

// ── HTTP Test Suites ──────────────────────────────────────────────────────────

describe('Students API — GET /api/v1/students/:studentId', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    teamRepoMock.findUsersByIds.mockResolvedValue([])
  })

  it('returns the student for an ADMIN', async () => {
    const authToken = asAdmin()
    studentsRepoMock.findStudentByPublicId.mockResolvedValue(
      makeStudent() as any,
    )

    const res = await request(app)
      .get('/api/v1/students/STU-8440')
      .set('Authorization', `Bearer ${authToken}`)

    expect(res.status).toBe(200)
    expect(body<{ publicId: string }>(res).data.publicId).toBe('STU-8440')
  })

  it('returns the student for the ADVISOR it is assigned to', async () => {
    const authToken = asAdvisor(ADVISOR_ID)
    studentsRepoMock.findStudentByPublicId.mockResolvedValue(
      makeStudent({ assigned_advisor_id: ADVISOR_ID }) as any,
    )

    const res = await request(app)
      .get('/api/v1/students/STU-8440')
      .set('Authorization', `Bearer ${authToken}`)

    expect(res.status).toBe(200)
  })

  it('returns 403 for an ADVISOR the student is not assigned to', async () => {
    const authToken = asAdvisor(OTHER_ADVISOR_ID)
    studentsRepoMock.findStudentByPublicId.mockResolvedValue(
      makeStudent({ assigned_advisor_id: ADVISOR_ID }) as any,
    )

    const res = await request(app)
      .get('/api/v1/students/STU-8440')
      .set('Authorization', `Bearer ${authToken}`)

    expect(res.status).toBe(403)
    expect(body(res).error?.code).toBe('FORBIDDEN')
  })

  it('returns 404 when the student does not exist', async () => {
    const authToken = asAdmin()
    studentsRepoMock.findStudentByPublicId.mockResolvedValue(null as any)

    const res = await request(app)
      .get('/api/v1/students/STU-9999')
      .set('Authorization', `Bearer ${authToken}`)

    expect(res.status).toBe(404)
    expect(body(res).error?.code).toBe('NOT_FOUND')
  })

  it('returns 401 without a bearer token', async () => {
    const res = await request(app).get('/api/v1/students/STU-8440')
    expect(res.status).toBe(401)
  })

  it('returns 403 for an OPERATIONS user (route requires ADMIN or ADVISOR)', async () => {
    authRepoMock.findUser.mockResolvedValue(
      makeUser({ id: 'ops-uuid', role: 'OPERATIONS' }) as any,
    )
    authRepoMock.findAuthSessionById.mockResolvedValue(
      makeSession({ user_id: 'ops-uuid' }) as any,
    )
    const authToken = token('OPERATIONS', 'ops-uuid')

    const res = await request(app)
      .get('/api/v1/students/STU-8440')
      .set('Authorization', `Bearer ${authToken}`)

    expect(res.status).toBe(403)
  })
})

describe('Students API — GET /api/v1/students', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    teamRepoMock.findUsersByIds.mockResolvedValue([])
    studentsRepoMock.listStudents.mockResolvedValue({
      students: [makeStudent() as any],
      total: 1,
    })
  })

  it('forces the advisorUserId filter to the caller for an ADVISOR, ignoring any advisorId query param', async () => {
    const authToken = asAdvisor(ADVISOR_ID)

    const res = await request(app)
      .get(`/api/v1/students?advisorId=USR-FFFFFFFFFFFF`)
      .set('Authorization', `Bearer ${authToken}`)

    expect(res.status).toBe(200)
    expect(studentsRepoMock.listStudents).toHaveBeenCalledWith(
      expect.objectContaining({ advisorUserId: ADVISOR_ID }),
    )
    expect(teamRepoMock.findUserByPublicId).not.toHaveBeenCalled()
  })

  it('resolves a public advisorId query param to an internal id for ADMIN', async () => {
    const authToken = asAdmin()
    teamRepoMock.findUserByPublicId.mockResolvedValue(
      makeUser({ id: ADVISOR_ID, role: 'ADVISOR' }) as any,
    )

    const res = await request(app)
      .get('/api/v1/students?advisorId=USR-946B7F71768D')
      .set('Authorization', `Bearer ${authToken}`)

    expect(res.status).toBe(200)
    expect(studentsRepoMock.listStudents).toHaveBeenCalledWith(
      expect.objectContaining({ advisorUserId: ADVISOR_ID }),
    )
  })
})

describe('Students API — PATCH /api/v1/students/:studentId/advisor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    teamRepoMock.findUsersByIds.mockResolvedValue([])
    studentsRepoMock.findStudentByPublicId.mockResolvedValue(
      makeStudent({ assigned_advisor_id: null }) as any,
    )
    // No advisor profile yet == unlimited capacity — matches existing pre-feature behavior.
    advisorsRepoMock.findProfileByUserId.mockResolvedValue(null)
  })

  it('is forbidden for an ADVISOR (assign/reassign is ADMIN-only)', async () => {
    const authToken = asAdvisor()

    const res = await request(app)
      .patch('/api/v1/students/STU-8440/advisor')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ advisorId: 'USR-946B7F71768D' })

    expect(res.status).toBe(403)
    expect(studentsRepoMock.assignAdvisorToStudent).not.toHaveBeenCalled()
  })

  it('assigns a valid advisor for ADMIN', async () => {
    const authToken = asAdmin()
    teamRepoMock.findUserByPublicId.mockResolvedValue(
      makeUser({ id: ADVISOR_ID, role: 'ADVISOR' }) as any,
    )
    studentsRepoMock.assignAdvisorToStudent.mockResolvedValue(
      makeStudent({
        assigned_advisor_id: ADVISOR_ID,
        status: 'ASSIGNED',
      }) as any,
    )

    const res = await request(app)
      .patch('/api/v1/students/STU-8440/advisor')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ advisorId: 'USR-946B7F71768D' })

    expect(res.status).toBe(200)
    expect(studentsRepoMock.assignAdvisorToStudent).toHaveBeenCalledWith(
      'student-uuid-1',
      ADVISOR_ID,
    )
  })

  it('returns 404 when the target user is not an ADVISOR', async () => {
    const authToken = asAdmin()
    teamRepoMock.findUserByPublicId.mockResolvedValue(
      makeUser({ id: 'ops-uuid', role: 'OPERATIONS' }) as any,
    )

    const res = await request(app)
      .patch('/api/v1/students/STU-8440/advisor')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ advisorId: 'USR-0FFF00FF00FF' })

    expect(res.status).toBe(404)
    expect(body(res).error?.code).toBe('NOT_FOUND')
    expect(studentsRepoMock.assignAdvisorToStudent).not.toHaveBeenCalled()
  })

  it('unassigns the advisor when advisorId is null', async () => {
    const authToken = asAdmin()
    studentsRepoMock.unassignAdvisorFromStudent.mockResolvedValue(
      makeStudent({
        assigned_advisor_id: null,
        status: 'AWAITING_ASSIGNMENT',
      }) as any,
    )

    const res = await request(app)
      .patch('/api/v1/students/STU-8440/advisor')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ advisorId: null })

    expect(res.status).toBe(200)
    expect(studentsRepoMock.unassignAdvisorFromStudent).toHaveBeenCalledWith(
      'student-uuid-1',
    )
    expect(
      body<{ assignedAdvisor: unknown }>(res).data.assignedAdvisor,
    ).toBeNull()
  })

  it('returns 400 for a malformed advisorId', async () => {
    const authToken = asAdmin()

    const res = await request(app)
      .patch('/api/v1/students/STU-8440/advisor')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ advisorId: 'not-an-advisor-id' })

    expect(res.status).toBe(400)
    expect(body(res).error?.code).toBe('VALIDATION_ERROR')
  })

  it('returns 409 when the advisor is already at their profile capacity', async () => {
    const authToken = asAdmin()
    teamRepoMock.findUserByPublicId.mockResolvedValue(
      makeUser({ id: ADVISOR_ID, role: 'ADVISOR' }) as any,
    )
    advisorsRepoMock.findProfileByUserId.mockResolvedValue({
      id: 'profile-uuid-1',
      user_id: ADVISOR_ID,
      availability: 'AVAILABLE',
      max_capacity: 5,
      created_at: new Date(),
      updated_at: new Date(),
    } as any)
    advisorsRepoMock.countActiveStudentsForAdvisor.mockResolvedValue(5)

    const res = await request(app)
      .patch('/api/v1/students/STU-8440/advisor')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ advisorId: 'USR-946B7F71768D' })

    expect(res.status).toBe(409)
    expect(body(res).error?.code).toBe('CONFLICT')
    expect(studentsRepoMock.assignAdvisorToStudent).not.toHaveBeenCalled()
  })

  it('allows assignment when the advisor is under their profile capacity', async () => {
    const authToken = asAdmin()
    teamRepoMock.findUserByPublicId.mockResolvedValue(
      makeUser({ id: ADVISOR_ID, role: 'ADVISOR' }) as any,
    )
    advisorsRepoMock.findProfileByUserId.mockResolvedValue({
      id: 'profile-uuid-1',
      user_id: ADVISOR_ID,
      availability: 'AVAILABLE',
      max_capacity: 5,
      created_at: new Date(),
      updated_at: new Date(),
    } as any)
    advisorsRepoMock.countActiveStudentsForAdvisor.mockResolvedValue(4)
    studentsRepoMock.assignAdvisorToStudent.mockResolvedValue(
      makeStudent({
        assigned_advisor_id: ADVISOR_ID,
        status: 'ASSIGNED',
      }) as any,
    )

    const res = await request(app)
      .patch('/api/v1/students/STU-8440/advisor')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ advisorId: 'USR-946B7F71768D' })

    expect(res.status).toBe(200)
    expect(studentsRepoMock.assignAdvisorToStudent).toHaveBeenCalledWith(
      'student-uuid-1',
      ADVISOR_ID,
    )
  })
})

describe('Students API — PATCH /api/v1/students/:studentId/status', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    teamRepoMock.findUsersByIds.mockResolvedValue([])
  })

  it('updates status for the owning ADVISOR', async () => {
    const authToken = asAdvisor(ADVISOR_ID)
    studentsRepoMock.findStudentByPublicId.mockResolvedValue(
      makeStudent({
        assigned_advisor_id: ADVISOR_ID,
        status: 'ASSIGNED',
      }) as any,
    )
    studentsRepoMock.updateStudentStatus.mockResolvedValue(
      makeStudent({
        assigned_advisor_id: ADVISOR_ID,
        status: 'FOLLOW_UP',
      }) as any,
    )

    const res = await request(app)
      .patch('/api/v1/students/STU-8440/status')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ status: 'FOLLOW_UP' })

    expect(res.status).toBe(200)
    expect(studentsRepoMock.updateStudentStatus).toHaveBeenCalledWith(
      'student-uuid-1',
      'FOLLOW_UP',
    )
    expect(body<{ status: string }>(res).data.status).toBe('FOLLOW_UP')
  })

  it('returns 403 for an ADVISOR the student is not assigned to', async () => {
    const authToken = asAdvisor(OTHER_ADVISOR_ID)
    studentsRepoMock.findStudentByPublicId.mockResolvedValue(
      makeStudent({ assigned_advisor_id: ADVISOR_ID }) as any,
    )

    const res = await request(app)
      .patch('/api/v1/students/STU-8440/status')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ status: 'FOLLOW_UP' })

    expect(res.status).toBe(403)
    expect(studentsRepoMock.updateStudentStatus).not.toHaveBeenCalled()
  })

  it('returns 400 for an invalid status value', async () => {
    const authToken = asAdmin()
    const res = await request(app)
      .patch('/api/v1/students/STU-8440/status')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ status: 'NOT_A_REAL_STATUS' })

    expect(res.status).toBe(400)
    expect(body(res).error?.code).toBe('VALIDATION_ERROR')
  })

  it('returns 404 when the student does not exist', async () => {
    const authToken = asAdmin()
    studentsRepoMock.findStudentByPublicId.mockResolvedValue(null as any)

    const res = await request(app)
      .patch('/api/v1/students/STU-9999/status')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ status: 'COMPLETED' })

    expect(res.status).toBe(404)
  })
})
