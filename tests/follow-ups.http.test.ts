import './setup-env'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import app from '../src/app'
import { generateAcessToken } from '../src/common/security/token'
import AuthRepo from '../src/modules/auth/auth.repository'
import { StudentsRepo } from '../src/modules/students/students.repository'
import { FollowUpsRepo } from '../src/modules/followUps/followUps.repository'

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

vi.mock('../src/modules/followUps/followUps.repository', () => ({
  FollowUpsRepo: {
    findByPublicId: vi.fn(),
    listForStudent: vi.fn(),
    listForAdvisor: vi.fn(),
    createFollowUpAndAdvanceStatus: vi.fn(),
    updateFollowUp: vi.fn(),
    completeFollowUp: vi.fn(),
    cancelFollowUp: vi.fn(),
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
const followUpsRepoMock = vi.mocked(FollowUpsRepo)

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

const makeFollowUp = (overrides: Record<string, unknown> = {}) => ({
  id: 'followup-uuid-1',
  public_id: 'FUP-1001',
  student_id: 'student-uuid-1',
  advisor_id: ADVISOR_ID,
  due_at: new Date(Date.now() + 86_400_000),
  priority: 'NORMAL' as const,
  status: 'PENDING' as const,
  description: 'Follow up on IELTS booking.',
  completed_at: null as Date | null,
  canceled_at: null as Date | null,
  created_at: new Date('2024-01-01'),
  updated_at: new Date('2024-01-01'),
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

describe('Follow-Ups API — POST /api/v1/students/:studentId/follow-ups', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    studentsRepoMock.findStudentByPublicId.mockResolvedValue(
      makeStudent({ status: 'ASSIGNED' }) as any,
    )
  })

  it('creates a follow-up for the owning ADVISOR', async () => {
    const authToken = asAdvisor(ADVISOR_ID)
    followUpsRepoMock.createFollowUpAndAdvanceStatus.mockResolvedValue(
      makeFollowUp() as any,
    )

    const res = await request(app)
      .post('/api/v1/students/STU-8440/follow-ups')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        dueAt: new Date(Date.now() + 86_400_000).toISOString(),
        description: 'Follow up on IELTS booking.',
      })

    expect(res.status).toBe(201)
    expect(
      followUpsRepoMock.createFollowUpAndAdvanceStatus,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        studentId: 'student-uuid-1',
        advisorId: ADVISOR_ID,
        priority: 'NORMAL',
      }),
    )
  })

  it('returns 403 for an ADVISOR the student is not assigned to', async () => {
    const authToken = asAdvisor(OTHER_ADVISOR_ID)
    const res = await request(app)
      .post('/api/v1/students/STU-8440/follow-ups')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ dueAt: new Date().toISOString(), description: 'x' })

    expect(res.status).toBe(403)
  })

  it('returns 400 when description is missing', async () => {
    const authToken = asAdvisor(ADVISOR_ID)
    const res = await request(app)
      .post('/api/v1/students/STU-8440/follow-ups')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ dueAt: new Date().toISOString() })

    expect(res.status).toBe(400)
    expect(body(res).error?.code).toBe('VALIDATION_ERROR')
  })
})

describe('Follow-Ups API — GET /api/v1/students/:studentId/follow-ups', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    studentsRepoMock.findStudentByPublicId.mockResolvedValue(
      makeStudent() as any,
    )
  })

  it('derives OVERDUE for a past-due PENDING follow-up', async () => {
    const authToken = asAdmin()
    followUpsRepoMock.listForStudent.mockResolvedValue({
      followUps: [
        makeFollowUp({
          due_at: new Date(Date.now() - 86_400_000),
          status: 'PENDING',
        }) as any,
      ],
      total: 1,
    })

    const res = await request(app)
      .get('/api/v1/students/STU-8440/follow-ups')
      .set('Authorization', `Bearer ${authToken}`)

    expect(res.status).toBe(200)
    expect(
      body<{ followUps: { status: string }[] }>(res).data.followUps[0]?.status,
    ).toBe('OVERDUE')
  })

  it('does not mark a future-due PENDING follow-up as overdue', async () => {
    const authToken = asAdmin()
    followUpsRepoMock.listForStudent.mockResolvedValue({
      followUps: [
        makeFollowUp({
          due_at: new Date(Date.now() + 86_400_000),
          status: 'PENDING',
        }) as any,
      ],
      total: 1,
    })

    const res = await request(app)
      .get('/api/v1/students/STU-8440/follow-ups')
      .set('Authorization', `Bearer ${authToken}`)

    expect(
      body<{ followUps: { status: string }[] }>(res).data.followUps[0]?.status,
    ).toBe('PENDING')
  })
})

describe('Follow-Ups API — complete/cancel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    studentsRepoMock.findStudentByPublicId.mockResolvedValue(
      makeStudent() as any,
    )
  })

  it('completes a pending follow-up', async () => {
    const authToken = asAdmin()
    followUpsRepoMock.findByPublicId.mockResolvedValue(
      makeFollowUp({ status: 'PENDING' }) as any,
    )
    followUpsRepoMock.completeFollowUp.mockResolvedValue(
      makeFollowUp({ status: 'COMPLETED', completed_at: new Date() }) as any,
    )

    const res = await request(app)
      .post('/api/v1/students/STU-8440/follow-ups/FUP-1001/complete')
      .set('Authorization', `Bearer ${authToken}`)

    expect(res.status).toBe(200)
  })

  it('returns 409 when completing an already-completed follow-up', async () => {
    const authToken = asAdmin()
    followUpsRepoMock.findByPublicId.mockResolvedValue(
      makeFollowUp({ status: 'COMPLETED' }) as any,
    )

    const res = await request(app)
      .post('/api/v1/students/STU-8440/follow-ups/FUP-1001/complete')
      .set('Authorization', `Bearer ${authToken}`)

    expect(res.status).toBe(409)
    expect(followUpsRepoMock.completeFollowUp).not.toHaveBeenCalled()
  })

  it('returns 409 when canceling an already-canceled follow-up', async () => {
    const authToken = asAdmin()
    followUpsRepoMock.findByPublicId.mockResolvedValue(
      makeFollowUp({ status: 'CANCELED' }) as any,
    )

    const res = await request(app)
      .post('/api/v1/students/STU-8440/follow-ups/FUP-1001/cancel')
      .set('Authorization', `Bearer ${authToken}`)

    expect(res.status).toBe(409)
    expect(followUpsRepoMock.cancelFollowUp).not.toHaveBeenCalled()
  })

  it('returns 404 for a follow-up that does not exist', async () => {
    const authToken = asAdmin()
    followUpsRepoMock.findByPublicId.mockResolvedValue(null)

    const res = await request(app)
      .post('/api/v1/students/STU-8440/follow-ups/FUP-9999/cancel')
      .set('Authorization', `Bearer ${authToken}`)

    expect(res.status).toBe(404)
  })
})
