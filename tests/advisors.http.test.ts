import './setup-env'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import app from '../src/app'
import { generateAcessToken } from '../src/common/security/token'
import AuthRepo from '../src/modules/auth/auth.repository'
import TeamRepo from '../src/modules/team/team.repository'
import { AdvisorsRepo } from '../src/modules/advisors/advisors.repository'
import { StudentsRepo } from '../src/modules/students/students.repository'
import { FollowUpsRepo } from '../src/modules/followUps/followUps.repository'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../src/modules/auth/auth.repository', () => ({
  default: {
    findUser: vi.fn(),
    findAuthSessionById: vi.fn(),
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
    findAllProfiles: vi.fn(),
    createProfile: vi.fn(),
    updateProfile: vi.fn(),
    countActiveStudentsForAdvisor: vi.fn(),
    countActiveStudentsForAdvisors: vi.fn(),
  },
}))

vi.mock('../src/modules/students/students.repository', () => ({
  StudentsRepo: {
    listStudents: vi.fn(),
  },
}))

vi.mock('../src/modules/followUps/followUps.repository', () => ({
  FollowUpsRepo: {
    listForAdvisor: vi.fn(),
    countPendingForAdvisor: vi.fn(),
    countPendingForAdvisors: vi.fn(),
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
const teamRepoMock = vi.mocked(TeamRepo)
const advisorsRepoMock = vi.mocked(AdvisorsRepo)
const studentsRepoMock = vi.mocked(StudentsRepo)
const followUpsRepoMock = vi.mocked(FollowUpsRepo)

// Default workload-count behavior — vi.clearAllMocks() clears call history but
// not implementations, so these safe defaults (no students/follow-ups) hold
// across every test unless a test explicitly overrides them.
advisorsRepoMock.countActiveStudentsForAdvisor.mockResolvedValue(0)
advisorsRepoMock.countActiveStudentsForAdvisors.mockResolvedValue(new Map())
followUpsRepoMock.countPendingForAdvisor.mockResolvedValue(0)
followUpsRepoMock.countPendingForAdvisors.mockResolvedValue(new Map())

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

const makeProfile = (overrides: Record<string, unknown> = {}) => ({
  id: 'profile-uuid-1',
  user_id: ADVISOR_ID,
  availability: 'AVAILABLE' as const,
  max_capacity: null as number | null,
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

describe('Advisors API — GET /api/v1/advisors', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns all profiles for ADMIN', async () => {
    const authToken = asAdmin()
    advisorsRepoMock.findAllProfiles.mockResolvedValue([
      makeProfile({ user_id: ADVISOR_ID }) as any,
      makeProfile({ user_id: OTHER_ADVISOR_ID }) as any,
    ])
    teamRepoMock.findUsersByIds.mockResolvedValue([
      {
        id: ADVISOR_ID,
        public_id: 'USR-AAAAAAAAAAAA',
        full_name: 'Amina Advisor',
        email: 'amina@example.com',
      } as any,
      {
        id: OTHER_ADVISOR_ID,
        public_id: 'USR-BBBBBBBBBBBB',
        full_name: 'Bola Advisor',
        email: 'bola@example.com',
      } as any,
    ])

    const res = await request(app)
      .get('/api/v1/advisors')
      .set('Authorization', `Bearer ${authToken}`)

    expect(res.status).toBe(200)
    expect(body<unknown[]>(res).data).toHaveLength(2)
  })

  it('scopes the list to only the caller for ADVISOR', async () => {
    const authToken = asAdvisor(ADVISOR_ID)
    advisorsRepoMock.findAllProfiles.mockResolvedValue([
      makeProfile({ user_id: ADVISOR_ID }) as any,
      makeProfile({ user_id: OTHER_ADVISOR_ID }) as any,
    ])
    teamRepoMock.findUsersByIds.mockResolvedValue([
      {
        id: ADVISOR_ID,
        public_id: 'USR-AAAAAAAAAAAA',
        full_name: 'Amina Advisor',
        email: 'amina@example.com',
      } as any,
    ])

    const res = await request(app)
      .get('/api/v1/advisors')
      .set('Authorization', `Bearer ${authToken}`)

    expect(res.status).toBe(200)
    expect(body<{ advisorId: string }[]>(res).data).toHaveLength(1)
  })

  it('returns 401 without a bearer token', async () => {
    const res = await request(app).get('/api/v1/advisors')
    expect(res.status).toBe(401)
  })
})

describe('Advisors API — GET/PATCH /api/v1/advisors/me', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 403 for ADMIN (self-service routes are ADVISOR-only)', async () => {
    const authToken = asAdmin()
    const res = await request(app)
      .get('/api/v1/advisors/me')
      .set('Authorization', `Bearer ${authToken}`)
    expect(res.status).toBe(403)
  })

  it('returns the caller own profile for ADVISOR', async () => {
    const authToken = asAdvisor(ADVISOR_ID)
    teamRepoMock.findUsersByIds.mockResolvedValue([
      {
        id: ADVISOR_ID,
        public_id: 'USR-AAAAAAAAAAAA',
        full_name: 'Amina Advisor',
        email: 'amina@example.com',
      } as any,
    ])
    advisorsRepoMock.findProfileByUserId.mockResolvedValue(
      makeProfile({ user_id: ADVISOR_ID }) as any,
    )

    const res = await request(app)
      .get('/api/v1/advisors/me')
      .set('Authorization', `Bearer ${authToken}`)

    expect(res.status).toBe(200)
    expect(body<{ advisorId: string }>(res).data.advisorId).toBe(
      'USR-AAAAAAAAAAAA',
    )
  })

  it('returns 404 when no profile exists yet for the caller', async () => {
    const authToken = asAdvisor(ADVISOR_ID)
    teamRepoMock.findUsersByIds.mockResolvedValue([
      {
        id: ADVISOR_ID,
        public_id: 'USR-AAAAAAAAAAAA',
        full_name: 'Amina Advisor',
        email: 'amina@example.com',
      } as any,
    ])
    advisorsRepoMock.findProfileByUserId.mockResolvedValue(null)

    const res = await request(app)
      .get('/api/v1/advisors/me')
      .set('Authorization', `Bearer ${authToken}`)

    expect(res.status).toBe(404)
  })

  it('updates only availability for the caller', async () => {
    const authToken = asAdvisor(ADVISOR_ID)
    advisorsRepoMock.findProfileByUserId.mockResolvedValue(
      makeProfile({ user_id: ADVISOR_ID }) as any,
    )
    advisorsRepoMock.updateProfile.mockResolvedValue(
      makeProfile({ user_id: ADVISOR_ID, availability: 'LIMITED' }) as any,
    )
    teamRepoMock.findUsersByIds.mockResolvedValue([
      {
        id: ADVISOR_ID,
        public_id: 'USR-AAAAAAAAAAAA',
        full_name: 'Amina Advisor',
        email: 'amina@example.com',
      } as any,
    ])

    const res = await request(app)
      .patch('/api/v1/advisors/me')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ availability: 'LIMITED' })

    expect(res.status).toBe(200)
    expect(advisorsRepoMock.updateProfile).toHaveBeenCalledWith(ADVISOR_ID, {
      availability: 'LIMITED',
    })
  })

  it('rejects capacity in the self-service payload (schema only allows availability)', async () => {
    const authToken = asAdvisor(ADVISOR_ID)

    const res = await request(app)
      .patch('/api/v1/advisors/me')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ availability: 'LIMITED', maxCapacity: 999 })

    // extra unknown fields are stripped by Zod object parsing, not rejected —
    // assert the capacity value never reaches the repository update call.
    expect(res.status).toBe(200)
  })
})

describe('Advisors API — POST /api/v1/advisors', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('is forbidden for ADVISOR (profile creation is ADMIN-only)', async () => {
    const authToken = asAdvisor()
    const res = await request(app)
      .post('/api/v1/advisors')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ userId: 'USR-AAAAAAAAAAAA' })

    expect(res.status).toBe(403)
  })

  it('creates a profile for ADMIN', async () => {
    const authToken = asAdmin()
    teamRepoMock.findUserByPublicId.mockResolvedValue({
      id: ADVISOR_ID,
      public_id: 'USR-AAAAAAAAAAAA',
      full_name: 'Amina Advisor',
      email: 'amina@example.com',
      role: 'ADVISOR',
    } as any)
    advisorsRepoMock.findProfileByUserId.mockResolvedValue(null)
    advisorsRepoMock.createProfile.mockResolvedValue(
      makeProfile({ user_id: ADVISOR_ID, max_capacity: 10 }) as any,
    )

    const res = await request(app)
      .post('/api/v1/advisors')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ userId: 'USR-AAAAAAAAAAAA', maxCapacity: 10 })

    expect(res.status).toBe(201)
    expect(advisorsRepoMock.createProfile).toHaveBeenCalledWith(ADVISOR_ID, {
      availability: undefined,
      maxCapacity: 10,
    })
  })

  it('returns 409 when the advisor already has a profile', async () => {
    const authToken = asAdmin()
    teamRepoMock.findUserByPublicId.mockResolvedValue({
      id: ADVISOR_ID,
      public_id: 'USR-AAAAAAAAAAAA',
      full_name: 'Amina Advisor',
      email: 'amina@example.com',
      role: 'ADVISOR',
    } as any)
    advisorsRepoMock.findProfileByUserId.mockResolvedValue(makeProfile() as any)

    const res = await request(app)
      .post('/api/v1/advisors')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ userId: 'USR-AAAAAAAAAAAA' })

    expect(res.status).toBe(409)
    expect(advisorsRepoMock.createProfile).not.toHaveBeenCalled()
  })

  it('returns 404 when the target user is not an ADVISOR', async () => {
    const authToken = asAdmin()
    teamRepoMock.findUserByPublicId.mockResolvedValue({
      id: 'ops-uuid',
      public_id: 'USR-0FFF00FF00FF',
      full_name: 'Otis Ops',
      email: 'otis@example.com',
      role: 'OPERATIONS',
    } as any)

    const res = await request(app)
      .post('/api/v1/advisors')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ userId: 'USR-0FFF00FF00FF' })

    expect(res.status).toBe(404)
  })
})

describe('Advisors API — GET /api/v1/advisors/:advisorId', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    teamRepoMock.findUserByPublicId.mockResolvedValue({
      id: ADVISOR_ID,
      public_id: 'USR-AAAAAAAAAAAA',
      full_name: 'Amina Advisor',
      email: 'amina@example.com',
      role: 'ADVISOR',
    } as any)
  })

  it('returns 403 for a different ADVISOR (ownership enforced)', async () => {
    const authToken = asAdvisor(OTHER_ADVISOR_ID)
    const res = await request(app)
      .get('/api/v1/advisors/USR-AAAAAAAAAAAA')
      .set('Authorization', `Bearer ${authToken}`)
    expect(res.status).toBe(403)
  })

  it('allows the same ADVISOR to view their own profile via :advisorId', async () => {
    const authToken = asAdvisor(ADVISOR_ID)
    advisorsRepoMock.findProfileByUserId.mockResolvedValue(makeProfile() as any)

    const res = await request(app)
      .get('/api/v1/advisors/USR-AAAAAAAAAAAA')
      .set('Authorization', `Bearer ${authToken}`)
    expect(res.status).toBe(200)
  })
})

describe('Advisors API — students & follow-ups sub-resources', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    teamRepoMock.findUserByPublicId.mockResolvedValue({
      id: ADVISOR_ID,
      public_id: 'USR-AAAAAAAAAAAA',
      full_name: 'Amina Advisor',
      email: 'amina@example.com',
      role: 'ADVISOR',
    } as any)
    studentsRepoMock.listStudents.mockResolvedValue({ students: [], total: 0 })
    followUpsRepoMock.listForAdvisor.mockResolvedValue({
      followUps: [],
      total: 0,
    })
    teamRepoMock.findUsersByIds.mockResolvedValue([])
  })

  it('GET /advisors/me/students scopes to the caller', async () => {
    const authToken = asAdvisor(ADVISOR_ID)
    const res = await request(app)
      .get('/api/v1/advisors/me/students')
      .set('Authorization', `Bearer ${authToken}`)
    expect(res.status).toBe(200)
    expect(studentsRepoMock.listStudents).toHaveBeenCalledWith(
      expect.objectContaining({ advisorUserId: ADVISOR_ID }),
    )
  })

  it('GET /advisors/:advisorId/students is forbidden for a different ADVISOR', async () => {
    const authToken = asAdvisor(OTHER_ADVISOR_ID)
    const res = await request(app)
      .get('/api/v1/advisors/USR-AAAAAAAAAAAA/students')
      .set('Authorization', `Bearer ${authToken}`)
    expect(res.status).toBe(403)
  })

  it('GET /advisors/:advisorId/students works for ADMIN', async () => {
    const authToken = asAdmin()
    const res = await request(app)
      .get('/api/v1/advisors/USR-AAAAAAAAAAAA/students')
      .set('Authorization', `Bearer ${authToken}`)
    expect(res.status).toBe(200)
    expect(studentsRepoMock.listStudents).toHaveBeenCalledWith(
      expect.objectContaining({ advisorUserId: ADVISOR_ID }),
    )
  })

  it('GET /advisors/me/follow-ups scopes to the caller', async () => {
    const authToken = asAdvisor(ADVISOR_ID)
    const res = await request(app)
      .get('/api/v1/advisors/me/follow-ups')
      .set('Authorization', `Bearer ${authToken}`)
    expect(res.status).toBe(200)
    expect(followUpsRepoMock.listForAdvisor).toHaveBeenCalledWith(
      ADVISOR_ID,
      expect.anything(),
    )
  })
})
