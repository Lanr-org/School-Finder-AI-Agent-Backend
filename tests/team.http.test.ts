import './setup-env'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import app from '../src/app'
import { generateAcessToken } from '../src/common/security/token'
import AuthRepo from '../src/modules/auth/auth.repository'
import TeamRepo from '../src/modules/team/team.repository'
import { TeamService } from '../src/modules/team/team.service'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../src/modules/auth/auth.repository', () => ({
  default: {
    findUser: vi.fn(),
    findAuthSessionById: vi.fn(),
  },
}))

vi.mock('../src/modules/team/team.repository', () => ({
  default: {
    CreateInviteUser: vi.fn(),
    findInvitationById: vi.fn(),
    FindTeamInvitation: vi.fn(),
    UpdateTeamInvitation: vi.fn(),
    CancelInvitation: vi.fn(),
    findAllUsers: vi.fn(),
    findUserByPublicId: vi.fn(),
    updateUser: vi.fn(),
    updateUserStatus: vi.fn(),
  },
}))

vi.mock('../src/integrations/email/email.provider', () => ({
  default: { send: vi.fn().mockResolvedValue(undefined) },
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

// ── Repo/service mocks ────────────────────────────────────────────────────────

const authRepoMock = vi.mocked(AuthRepo)
const teamRepoMock = vi.mocked(TeamRepo)

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

const makeInvitedUser = (overrides: Record<string, unknown> = {}) => ({
  id: 'invited-user-uuid-0001',
  public_id: 'USR-0002',
  full_name: 'Bob Invited',
  email: 'bob@example.com',
  phone: null as string | null,
  password_hash: null as string | null,
  role: 'ADVISOR' as const,
  status: 'INVITED' as const,
  token_version: 0,
  last_login_at: null as Date | null,
  password_changed_at: null as Date | null,
  created_at: new Date(),
  updated_at: new Date(),
  ...overrides,
})

const makeInvitation = (overrides: Record<string, unknown> = {}) => ({
  id: 'invite-uuid-0001',
  user_id: 'invited-user-uuid-0001',
  invited_by_user_id: ADMIN_ID,
  token_hash: 'a'.repeat(64),
  expires_at: new Date(Date.now() + 3_600_000),
  accepted_at: null as Date | null,
  canceled_at: null as Date | null,
  sent_at: new Date(),
  last_sent_at: new Date(),
  send_count: 1,
  user: makeInvitedUser(),
  ...overrides,
})

const makeNewUser = () => ({
  id: 'new-user-uuid',
  public_id: 'USR-0099',
  full_name: 'Carol New',
  email: 'carol@example.com',
  phone: null as string | null,
  password_hash: null as string | null,
  role: 'ADVISOR' as const,
  status: 'INVITED' as const,
  token_version: 0,
  last_login_at: null as Date | null,
  password_changed_at: null as Date | null,
  created_at: new Date(),
  updated_at: new Date(),
})

const makeNewInvite = (userId: string) => ({
  id: 'invite-uuid-new',
  user_id: userId,
  invited_by_user_id: ADMIN_ID,
  token_hash: 'b'.repeat(64),
  expires_at: new Date(Date.now() + 3_600_000),
  accepted_at: null as Date | null,
  canceled_at: null as Date | null,
  sent_at: new Date(),
  last_sent_at: new Date(),
  send_count: 1,
})

const makeAdminToken = () =>
  generateAcessToken(ADMIN_ID, SESSION_ID, 'ADMIN', 0)

// ── HTTP Test Suites ──────────────────────────────────────────────────────────

describe('Team API — POST /api/v1/team/invitations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authRepoMock.findUser.mockResolvedValue(makeAdminUser())
    authRepoMock.findAuthSessionById.mockResolvedValue(makeSession())
  })

  it('returns 201 and invitation data on success', async () => {
    const newUser = makeNewUser()
    const newInvite = makeNewInvite(newUser.id)

    authRepoMock.findUser
      .mockResolvedValueOnce(makeAdminUser()) // authenticate middleware
      .mockResolvedValueOnce(null) // duplicate email check in service
      .mockResolvedValueOnce(makeAdminUser()) // admin name lookup in service

    authRepoMock.findAuthSessionById.mockResolvedValue(makeSession())
    teamRepoMock.CreateInviteUser.mockResolvedValue({
      user: newUser,
      invite: newInvite,
    })

    const token = makeAdminToken()
    const res = await request(app)
      .post('/api/v1/team/invitations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        fullName: 'Carol New',
        email: 'carol@example.com',
        role: 'ADVISOR',
      })

    const b = body<{ email: string; role: string; status: string }>(res)
    expect(res.status).toBe(201)
    expect(b.success).toBe(true)
    expect(b.data.email).toBe('carol@example.com')
    expect(b.data.role).toBe('ADVISOR')
    expect(b.data.status).toBe('INVITED')
  })

  it('returns 409 if email already exists', async () => {
    authRepoMock.findUser
      .mockResolvedValueOnce(makeAdminUser()) // authenticate middleware
      .mockResolvedValueOnce(makeAdminUser()) // duplicate email check → exists

    authRepoMock.findAuthSessionById.mockResolvedValue(makeSession())

    const token = makeAdminToken()
    const res = await request(app)
      .post('/api/v1/team/invitations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        fullName: 'Alice Admin',
        email: 'alice@example.com',
        role: 'ADVISOR',
      })

    expect(res.status).toBe(409)
    expect(body(res).error?.code).toBe('CONFLICT')
  })

  it('returns 400 for missing required fields', async () => {
    const token = makeAdminToken()
    const res = await request(app)
      .post('/api/v1/team/invitations')
      .set('Authorization', `Bearer ${token}`)
      .send({ fullName: 'No Email' })

    expect(res.status).toBe(400)
    expect(body(res).error?.code).toBe('VALIDATION_ERROR')
  })

  it('returns 400 for invalid email format', async () => {
    const token = makeAdminToken()
    const res = await request(app)
      .post('/api/v1/team/invitations')
      .set('Authorization', `Bearer ${token}`)
      .send({ fullName: 'Test User', email: 'not-an-email', role: 'ADVISOR' })

    expect(res.status).toBe(400)
    expect(body(res).error?.code).toBe('VALIDATION_ERROR')
  })

  it('returns 400 for invalid role', async () => {
    const token = makeAdminToken()
    const res = await request(app)
      .post('/api/v1/team/invitations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        fullName: 'Test User',
        email: 'test@example.com',
        role: 'SUPERUSER',
      })

    expect(res.status).toBe(400)
    expect(body(res).error?.code).toBe('VALIDATION_ERROR')
  })

  it('returns 401 if no bearer token', async () => {
    const res = await request(app).post('/api/v1/team/invitations').send({
      fullName: 'Carol New',
      email: 'carol@example.com',
      role: 'ADVISOR',
    })

    expect(res.status).toBe(401)
  })

  it('normalises email to lowercase before storing', async () => {
    const newUser = makeNewUser()
    const newInvite = makeNewInvite(newUser.id)

    authRepoMock.findUser
      .mockResolvedValueOnce(makeAdminUser()) // authenticate middleware
      .mockResolvedValueOnce(null) // duplicate check
      .mockResolvedValueOnce(makeAdminUser()) // admin name lookup

    authRepoMock.findAuthSessionById.mockResolvedValue(makeSession())
    teamRepoMock.CreateInviteUser.mockResolvedValue({
      user: newUser,
      invite: newInvite,
    })

    const token = makeAdminToken()
    await request(app)
      .post('/api/v1/team/invitations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        fullName: 'Carol New',
        email: 'CAROL@EXAMPLE.COM',
        role: 'ADVISOR',
      })

    const createCall = teamRepoMock.CreateInviteUser.mock.calls[0]?.[0]
    expect(createCall?.email).toBe('carol@example.com')
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('Team API — POST /api/v1/team/invitations/:id/resend', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authRepoMock.findUser.mockResolvedValue(makeAdminUser())
    authRepoMock.findAuthSessionById.mockResolvedValue(makeSession())
  })

  it('returns 200 and updated invitation on success', async () => {
    const inv = makeInvitation()
    const updatedInv = {
      ...inv,
      expires_at: new Date(Date.now() + 3_600_000),
      last_sent_at: new Date(),
      send_count: 2,
    }
    teamRepoMock.findInvitationById.mockResolvedValue(inv)
    teamRepoMock.UpdateTeamInvitation.mockResolvedValue(updatedInv)

    const token = makeAdminToken()
    const res = await request(app)
      .post('/api/v1/team/invitations/invite-uuid-0001/resend')
      .set('Authorization', `Bearer ${token}`)

    const b = body<{ sendCount: number }>(res)
    expect(res.status).toBe(200)
    expect(b.success).toBe(true)
    expect(b.data.sendCount).toBe(2)
  })

  it('returns 404 if invitation not found', async () => {
    teamRepoMock.findInvitationById.mockResolvedValue(null)

    const token = makeAdminToken()
    const res = await request(app)
      .post('/api/v1/team/invitations/non-existent-id/resend')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(404)
    expect(body(res).error?.code).toBe('NOT_FOUND')
  })

  it('returns 409 if invitation already accepted', async () => {
    teamRepoMock.findInvitationById.mockResolvedValue(
      makeInvitation({ accepted_at: new Date() }),
    )

    const token = makeAdminToken()
    const res = await request(app)
      .post('/api/v1/team/invitations/invite-uuid-0001/resend')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(409)
    expect(body(res).error?.code).toBe('INVITATION_ALREADY_ACCEPTED')
  })

  it('returns 409 if invitation already canceled', async () => {
    teamRepoMock.findInvitationById.mockResolvedValue(
      makeInvitation({ canceled_at: new Date() }),
    )

    const token = makeAdminToken()
    const res = await request(app)
      .post('/api/v1/team/invitations/invite-uuid-0001/resend')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(409)
    expect(body(res).error?.code).toBe('INVITATION_CANCELED')
  })

  it('returns 401 if no bearer token', async () => {
    const res = await request(app).post(
      '/api/v1/team/invitations/invite-uuid-0001/resend',
    )
    expect(res.status).toBe(401)
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('Team API — DELETE /api/v1/team/invitations/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authRepoMock.findUser.mockResolvedValue(makeAdminUser())
    authRepoMock.findAuthSessionById.mockResolvedValue(makeSession())
  })

  it('returns 200 on successful cancellation', async () => {
    const inv = makeInvitation()
    teamRepoMock.findInvitationById.mockResolvedValue(inv)
    teamRepoMock.CancelInvitation.mockResolvedValue({
      ...inv,
      canceled_at: new Date(),
    })

    const token = makeAdminToken()
    const res = await request(app)
      .delete('/api/v1/team/invitations/invite-uuid-0001')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(body(res).success).toBe(true)
  })

  it('returns 404 if invitation not found', async () => {
    teamRepoMock.findInvitationById.mockResolvedValue(null)

    const token = makeAdminToken()
    const res = await request(app)
      .delete('/api/v1/team/invitations/non-existent-id')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(404)
  })

  it('returns 409 if invitation already accepted', async () => {
    teamRepoMock.findInvitationById.mockResolvedValue(
      makeInvitation({ accepted_at: new Date() }),
    )

    const token = makeAdminToken()
    const res = await request(app)
      .delete('/api/v1/team/invitations/invite-uuid-0001')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(409)
    expect(body(res).error?.code).toBe('INVITATION_ALREADY_ACCEPTED')
  })

  it('returns 409 if invitation already canceled', async () => {
    teamRepoMock.findInvitationById.mockResolvedValue(
      makeInvitation({ canceled_at: new Date() }),
    )

    const token = makeAdminToken()
    const res = await request(app)
      .delete('/api/v1/team/invitations/invite-uuid-0001')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(409)
    expect(body(res).error?.code).toBe('INVITATION_ALREADY_CANCELED')
  })

  it('returns 401 if no bearer token', async () => {
    const res = await request(app).delete(
      '/api/v1/team/invitations/invite-uuid-0001',
    )
    expect(res.status).toBe(401)
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('Team API — GET /api/v1/team', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authRepoMock.findUser.mockResolvedValue(makeAdminUser())
    authRepoMock.findAuthSessionById.mockResolvedValue(makeSession())
  })

  it('returns 200 with list of team members', async () => {
    teamRepoMock.findAllUsers.mockResolvedValue([makeAdminUser()])

    const token = makeAdminToken()
    const res = await request(app)
      .get('/api/v1/team')
      .set('Authorization', `Bearer ${token}`)

    const b = body<Array<{ publicId: string }>>(res)
    expect(res.status).toBe(200)
    expect(b.success).toBe(true)
    expect(Array.isArray(b.data)).toBe(true)
    expect(b.data[0]?.publicId).toBe('USR-0001')
  })

  it('returns 200 with empty array when no members', async () => {
    teamRepoMock.findAllUsers.mockResolvedValue([])

    const token = makeAdminToken()
    const res = await request(app)
      .get('/api/v1/team')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(body<unknown[]>(res).data).toEqual([])
  })

  it('returns 401 if not authenticated', async () => {
    const res = await request(app).get('/api/v1/team')
    expect(res.status).toBe(401)
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('Team API — GET /api/v1/team/:userId', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authRepoMock.findUser.mockResolvedValue(makeAdminUser())
    authRepoMock.findAuthSessionById.mockResolvedValue(makeSession())
  })

  it('returns 200 with the team member', async () => {
    teamRepoMock.findUserByPublicId.mockResolvedValue(makeAdminUser())

    const token = makeAdminToken()
    const res = await request(app)
      .get('/api/v1/team/USR-0001')
      .set('Authorization', `Bearer ${token}`)

    const b = body<{ publicId: string; email: string }>(res)
    expect(res.status).toBe(200)
    expect(b.data.publicId).toBe('USR-0001')
    expect(b.data.email).toBe('alice@example.com')
  })

  it('returns 404 for unknown userId', async () => {
    teamRepoMock.findUserByPublicId.mockResolvedValue(null)

    const token = makeAdminToken()
    const res = await request(app)
      .get('/api/v1/team/USR-XXXX')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(404)
    expect(body(res).error?.code).toBe('NOT_FOUND')
  })

  it('returns 401 if not authenticated', async () => {
    const res = await request(app).get('/api/v1/team/USR-0001')
    expect(res.status).toBe(401)
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('Team API — PATCH /api/v1/team/:userId', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authRepoMock.findUser.mockResolvedValue(makeAdminUser())
    authRepoMock.findAuthSessionById.mockResolvedValue(makeSession())
  })

  it('returns 200 with updated member data', async () => {
    teamRepoMock.findUserByPublicId.mockResolvedValue(makeAdminUser())
    teamRepoMock.updateUser.mockResolvedValue({
      ...makeAdminUser(),
      full_name: 'Alice Updated',
    })

    const token = makeAdminToken()
    const res = await request(app)
      .patch('/api/v1/team/USR-0001')
      .set('Authorization', `Bearer ${token}`)
      .send({ fullName: 'Alice Updated' })

    const b = body<{ fullName: string }>(res)
    expect(res.status).toBe(200)
    expect(b.data.fullName).toBe('Alice Updated')
  })

  it('returns 400 if no updatable field is provided', async () => {
    const token = makeAdminToken()
    const res = await request(app)
      .patch('/api/v1/team/USR-0001')
      .set('Authorization', `Bearer ${token}`)
      .send({})

    expect(res.status).toBe(400)
    expect(body(res).error?.code).toBe('VALIDATION_ERROR')
  })

  it('returns 404 for unknown userId', async () => {
    teamRepoMock.findUserByPublicId.mockResolvedValue(null)

    const token = makeAdminToken()
    const res = await request(app)
      .patch('/api/v1/team/USR-XXXX')
      .set('Authorization', `Bearer ${token}`)
      .send({ fullName: 'Ghost' })

    expect(res.status).toBe(404)
  })

  it('returns 401 if not authenticated', async () => {
    const res = await request(app)
      .patch('/api/v1/team/USR-0001')
      .send({ fullName: 'Someone' })
    expect(res.status).toBe(401)
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('Team API — PATCH /api/v1/team/:userId/status', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authRepoMock.findUser.mockResolvedValue(makeAdminUser())
    authRepoMock.findAuthSessionById.mockResolvedValue(makeSession())
  })

  it('returns 200 when status is changed', async () => {
    teamRepoMock.findUserByPublicId.mockResolvedValue(makeAdminUser())
    teamRepoMock.updateUserStatus.mockResolvedValue({
      ...makeAdminUser(),
      status: 'DISABLED' as const,
    })

    const token = makeAdminToken()
    const res = await request(app)
      .patch('/api/v1/team/USR-0001/status')
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'DISABLED' })

    const b = body<{ status: string }>(res)
    expect(res.status).toBe(200)
    expect(b.data.status).toBe('DISABLED')
  })

  it('returns 409 if status is already the same', async () => {
    teamRepoMock.findUserByPublicId.mockResolvedValue(makeAdminUser()) // status: ACTIVE

    const token = makeAdminToken()
    const res = await request(app)
      .patch('/api/v1/team/USR-0001/status')
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'ACTIVE' })

    expect(res.status).toBe(409)
    expect(body(res).error?.code).toBe('CONFLICT')
  })

  it('returns 400 for invalid status value', async () => {
    const token = makeAdminToken()
    const res = await request(app)
      .patch('/api/v1/team/USR-0001/status')
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'BANNED' })

    expect(res.status).toBe(400)
    expect(body(res).error?.code).toBe('VALIDATION_ERROR')
  })

  it('returns 404 if user not found', async () => {
    teamRepoMock.findUserByPublicId.mockResolvedValue(null)

    const token = makeAdminToken()
    const res = await request(app)
      .patch('/api/v1/team/USR-XXXX/status')
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'DISABLED' })

    expect(res.status).toBe(404)
  })

  it('returns 401 if not authenticated', async () => {
    const res = await request(app)
      .patch('/api/v1/team/USR-0001/status')
      .send({ status: 'DISABLED' })
    expect(res.status).toBe(401)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Service unit tests — no HTTP layer, test business logic directly
// ─────────────────────────────────────────────────────────────────────────────

describe('TeamService.Invitation — unit', () => {
  const adminClaims = {
    sub: ADMIN_ID,
    role: 'ADMIN' as const,
    session_Id: SESSION_ID,
    token_version: 0,
  }

  beforeEach(() => vi.clearAllMocks())

  it('throws CONFLICT when email already exists', async () => {
    authRepoMock.findUser.mockResolvedValue(makeAdminUser())

    await expect(
      TeamService.Invitation(adminClaims, {
        fullName: 'Alice',
        email: 'alice@example.com',
        role: 'ADVISOR',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT', statusCode: 409 })
  })

  it('normalises email before the duplicate check', async () => {
    const newUser = makeNewUser()
    const newInvite = makeNewInvite(newUser.id)

    authRepoMock.findUser
      .mockResolvedValueOnce(null) // duplicate check → clear
      .mockResolvedValueOnce(makeAdminUser()) // admin name lookup

    teamRepoMock.CreateInviteUser.mockResolvedValue({
      user: newUser,
      invite: newInvite,
    })

    await TeamService.Invitation(adminClaims, {
      fullName: 'Dave',
      email: '  DAVE@EXAMPLE.COM  ',
      role: 'ADVISOR',
    })

    expect(authRepoMock.findUser).toHaveBeenCalledWith({
      email: 'dave@example.com',
    })
  })
})

describe('TeamService.ResendInvitation — unit', () => {
  const adminClaims = {
    sub: ADMIN_ID,
    role: 'ADMIN' as const,
    session_Id: SESSION_ID,
    token_version: 0,
  }

  beforeEach(() => vi.clearAllMocks())

  it('throws NOT_FOUND for missing invitation', async () => {
    teamRepoMock.findInvitationById.mockResolvedValue(null)
    await expect(
      TeamService.ResendInvitation(adminClaims, 'missing-id'),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 })
  })

  it('throws INVITATION_ALREADY_ACCEPTED for an accepted invitation', async () => {
    teamRepoMock.findInvitationById.mockResolvedValue(
      makeInvitation({ accepted_at: new Date() }),
    )
    await expect(
      TeamService.ResendInvitation(adminClaims, 'invite-uuid-0001'),
    ).rejects.toMatchObject({
      code: 'INVITATION_ALREADY_ACCEPTED',
      statusCode: 409,
    })
  })

  it('throws INVITATION_CANCELED for a canceled invitation', async () => {
    teamRepoMock.findInvitationById.mockResolvedValue(
      makeInvitation({ canceled_at: new Date() }),
    )
    await expect(
      TeamService.ResendInvitation(adminClaims, 'invite-uuid-0001'),
    ).rejects.toMatchObject({ code: 'INVITATION_CANCELED', statusCode: 409 })
  })

  it('increments send_count by 1', async () => {
    const inv = makeInvitation({ send_count: 3 })
    teamRepoMock.findInvitationById.mockResolvedValue(inv)
    teamRepoMock.UpdateTeamInvitation.mockResolvedValue({
      ...inv,
      send_count: 4,
      last_sent_at: new Date(),
    })
    authRepoMock.findUser.mockResolvedValue(makeAdminUser())

    const result = await TeamService.ResendInvitation(
      adminClaims,
      'invite-uuid-0001',
    )

    expect(result.sendCount).toBe(4)
    expect(teamRepoMock.UpdateTeamInvitation).toHaveBeenCalledWith(
      expect.objectContaining({ count: 4 }),
    )
  })
})

describe('TeamService.CancelInvitation — unit', () => {
  const adminClaims = {
    sub: ADMIN_ID,
    role: 'ADMIN' as const,
    session_Id: SESSION_ID,
    token_version: 0,
  }

  beforeEach(() => vi.clearAllMocks())

  it('calls CancelInvitation repo with the correct id', async () => {
    teamRepoMock.findInvitationById.mockResolvedValue(makeInvitation())
    teamRepoMock.CancelInvitation.mockResolvedValue(
      makeInvitation({ canceled_at: new Date() }),
    )

    await TeamService.CancelInvitation(adminClaims, 'invite-uuid-0001')

    expect(teamRepoMock.CancelInvitation).toHaveBeenCalledWith(
      'invite-uuid-0001',
    )
  })

  it('throws NOT_FOUND if invitation is missing', async () => {
    teamRepoMock.findInvitationById.mockResolvedValue(null)
    await expect(
      TeamService.CancelInvitation(adminClaims, 'bad-id'),
    ).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('TeamService.GetMember — unit', () => {
  beforeEach(() => vi.clearAllMocks())

  it('throws NOT_FOUND when user does not exist', async () => {
    teamRepoMock.findUserByPublicId.mockResolvedValue(null)
    await expect(TeamService.GetMember('USR-XXXX')).rejects.toMatchObject({
      code: 'NOT_FOUND',
      statusCode: 404,
    })
  })

  it('returns safe user fields and strips internal ones', async () => {
    teamRepoMock.findUserByPublicId.mockResolvedValue(makeAdminUser())
    const result = await TeamService.GetMember('USR-0001')

    expect(result).not.toHaveProperty('id')
    expect(result).not.toHaveProperty('password_hash')
    expect(result).not.toHaveProperty('token_version')
    expect(result.publicId).toBe('USR-0001')
  })
})

describe('TeamService.UpdateMemberStatus — unit', () => {
  beforeEach(() => vi.clearAllMocks())

  it('throws CONFLICT when status is already the target value', async () => {
    teamRepoMock.findUserByPublicId.mockResolvedValue(makeAdminUser()) // status: ACTIVE
    await expect(
      TeamService.UpdateMemberStatus('USR-0001', { status: 'ACTIVE' }),
    ).rejects.toMatchObject({ code: 'CONFLICT', statusCode: 409 })
  })
})
