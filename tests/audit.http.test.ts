import './setup-env'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import app from '../src/app'
import { generateAcessToken } from '../src/common/security/token'
import AuthRepo from '../src/modules/auth/auth.repository'
import TeamRepo from '../src/modules/team/team.repository'
import { AuditRepo } from '../src/modules/audit/audit.repository'

// AuditRepo is globally mocked in tests/setup-global-mocks.ts (record + list).

vi.mock('../src/modules/auth/auth.repository', () => ({
  default: {
    findUser: vi.fn(),
    findAuthSessionById: vi.fn(),
  },
}))

vi.mock('../src/modules/team/team.repository', () => ({
  default: {
    findUserByPublicId: vi.fn(),
  },
}))

type ApiBody<T = unknown> = {
  success: boolean
  data: T
  error?: { code: string; message: string }
}

const body = <T = unknown>(res: { body: unknown }) => res.body as ApiBody<T>

const authRepoMock = vi.mocked(AuthRepo)
const teamRepoMock = vi.mocked(TeamRepo)
const auditRepoMock = vi.mocked(AuditRepo)

const ADMIN_ID = 'admin-user-uuid-0001'
const SESSION_ID = 'session-uuid-0001'

const makeUser = (overrides: Record<string, unknown> = {}) => ({
  id: ADMIN_ID,
  public_id: 'USR-0001',
  full_name: 'Alice Admin',
  email: 'alice@example.com',
  phone: null,
  password_hash: '$argon2id$hash',
  role: 'ADMIN',
  status: 'ACTIVE',
  token_version: 0,
  last_login_at: null,
  password_changed_at: null,
  created_at: new Date('2024-01-01'),
  updated_at: new Date('2024-01-01'),
  ...overrides,
})

const signIn = (role: 'ADMIN' | 'ADVISOR' | 'OPERATIONS', id = ADMIN_ID) => {
  authRepoMock.findUser.mockResolvedValue(makeUser({ id, role }) as any)
  authRepoMock.findAuthSessionById.mockResolvedValue({
    id: SESSION_ID,
    user_id: id,
    revoked_at: null,
    expires_at: new Date(Date.now() + 3_600_000),
  } as any)
  return generateAcessToken(id, SESSION_ID, role, 0)
}

const makeLog = (overrides: Record<string, unknown> = {}) => ({
  id: 'log-uuid-1',
  actor_id: ADMIN_ID,
  actor_role: 'ADMIN',
  action: 'team.member_status_changed',
  entity_type: 'user',
  entity_id: 'USR-0002',
  before_data: { status: 'ACTIVE' },
  after_data: { status: 'DISABLED' },
  metadata: null,
  request_id: 'req-1',
  ip_address: '10.0.0.1',
  user_agent: 'vitest-agent',
  created_at: new Date('2026-09-26T10:00:00.000Z'),
  actor: { public_id: 'USR-0001', full_name: 'Alice Admin' },
  ...overrides,
})

describe('Audit API — GET /api/v1/audit-logs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    auditRepoMock.list.mockResolvedValue({ logs: [makeLog()], total: 1 } as any)
  })

  it('returns entries for ADMIN with public actor fields and no internal ids', async () => {
    const res = await request(app)
      .get('/api/v1/audit-logs')
      .set('Authorization', `Bearer ${signIn('ADMIN')}`)

    expect(res.status).toBe(200)
    const data = body<{
      logs: Record<string, unknown>[]
      pagination: { total: number }
    }>(res).data
    expect(data.logs[0]).toEqual({
      id: 'log-uuid-1',
      action: 'team.member_status_changed',
      entity: { type: 'user', id: 'USR-0002' },
      actor: { publicId: 'USR-0001', fullName: 'Alice Admin', role: 'ADMIN' },
      before: { status: 'ACTIVE' },
      after: { status: 'DISABLED' },
      metadata: null,
      requestId: 'req-1',
      ipAddress: '10.0.0.1',
      userAgent: 'vitest-agent',
      createdAt: '2026-09-26T10:00:00.000Z',
    })
    expect(data.pagination.total).toBe(1)
    expect(JSON.stringify(data)).not.toContain(ADMIN_ID)
  })

  it('returns a null actor for system or unauthenticated entries', async () => {
    auditRepoMock.list.mockResolvedValue({
      logs: [
        makeLog({
          actor_id: null,
          actor_role: null,
          actor: null,
          action: 'auth.login_failed',
        }),
      ],
      total: 1,
    } as any)

    const res = await request(app)
      .get('/api/v1/audit-logs')
      .set('Authorization', `Bearer ${signIn('ADMIN')}`)

    expect(res.status).toBe(200)
    expect(
      body<{ logs: { actor: unknown }[] }>(res).data.logs[0]?.actor,
    ).toBeNull()
  })

  it.each(['ADVISOR', 'OPERATIONS'] as const)(
    'is forbidden for %s',
    async (role) => {
      const res = await request(app)
        .get('/api/v1/audit-logs')
        .set('Authorization', `Bearer ${signIn(role, 'other-user-uuid')}`)

      expect(res.status).toBe(403)
      expect(auditRepoMock.list).not.toHaveBeenCalled()
    },
  )

  it('returns 401 without a bearer token', async () => {
    const res = await request(app).get('/api/v1/audit-logs')
    expect(res.status).toBe(401)
  })

  it('passes filters through and resolves a public actorId to the internal id', async () => {
    const token = signIn('ADMIN')
    teamRepoMock.findUserByPublicId.mockResolvedValue(
      makeUser({ id: 'actor-uuid-9', public_id: 'USR-946B7F71768D' }) as any,
    )

    const res = await request(app)
      .get('/api/v1/audit-logs')
      .query({
        action: 'student.status_changed',
        entityType: 'student',
        entityId: 'STU-1927',
        actorId: 'USR-946B7F71768D',
        from: '2026-09-01T00:00:00.000Z',
        to: '2026-09-30T00:00:00.000Z',
        page: 2,
        limit: 10,
      })
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(auditRepoMock.list).toHaveBeenCalledWith({
      action: 'student.status_changed',
      entityType: 'student',
      entityId: 'STU-1927',
      actorUserId: 'actor-uuid-9',
      from: new Date('2026-09-01T00:00:00.000Z'),
      to: new Date('2026-09-30T00:00:00.000Z'),
      page: 2,
      limit: 10,
    })
  })

  it('returns 404 for an unknown actorId', async () => {
    const token = signIn('ADMIN')
    teamRepoMock.findUserByPublicId.mockResolvedValue(null)

    const res = await request(app)
      .get('/api/v1/audit-logs?actorId=USR-FFFFFFFFFFFF')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(404)
    expect(auditRepoMock.list).not.toHaveBeenCalled()
  })

  it('returns 400 for an unknown action', async () => {
    const res = await request(app)
      .get('/api/v1/audit-logs?action=student.deleted')
      .set('Authorization', `Bearer ${signIn('ADMIN')}`)

    expect(res.status).toBe(400)
    expect(body(res).error?.code).toBe('VALIDATION_ERROR')
  })

  it('returns 400 when from is after to', async () => {
    const res = await request(app)
      .get('/api/v1/audit-logs?from=2026-09-30&to=2026-09-01')
      .set('Authorization', `Bearer ${signIn('ADMIN')}`)

    expect(res.status).toBe(400)
  })
})
