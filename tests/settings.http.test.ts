import './setup-env'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import app from '../src/app'
import { generateAcessToken } from '../src/common/security/token'
import AuthRepo from '../src/modules/auth/auth.repository'
import { SettingsRepo } from '../src/modules/settings/settings.repository'
import { Prisma } from '../src/generated/prisma/index'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../src/modules/auth/auth.repository', () => ({
  default: {
    findUser: vi.fn(),
    findAuthSessionById: vi.fn(),
  },
}))

vi.mock('../src/modules/settings/settings.repository', () => ({
  SettingsRepo: {
    findAllGroupsWithValues: vi.fn(),
    findGroupByKey: vi.fn(),
    findGroupByKeyWithValues: vi.fn(),
    createValue: vi.fn(),
    findValueInGroup: vi.fn(),
    updateValue: vi.fn(),
    deleteValue: vi.fn(),
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
const settingsRepoMock = vi.mocked(SettingsRepo)

// ── Constants ─────────────────────────────────────────────────────────────────

const ADMIN_ID = 'admin-user-uuid-0001'
const ADVISOR_ID = 'advisor-user-uuid-0001'
const OPERATIONS_ID = 'ops-user-uuid-0001'
const SESSION_ID = 'session-uuid-0001'
const GROUP_ID = 'group-uuid-countries'

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

const makeGroup = (overrides: Record<string, unknown> = {}) => ({
  id: GROUP_ID,
  key: 'countries',
  label: 'Destination Countries',
  created_at: new Date('2024-01-01'),
  updated_at: new Date('2024-01-01'),
  ...overrides,
})

const makeValue = (overrides: Record<string, unknown> = {}) => ({
  id: 'value-uuid-1',
  group_id: GROUP_ID,
  key: 'canada',
  label: 'Canada',
  is_active: true,
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

const asAdvisor = () => {
  authRepoMock.findUser.mockResolvedValue(
    makeUser({ id: ADVISOR_ID, role: 'ADVISOR' }) as any,
  )
  authRepoMock.findAuthSessionById.mockResolvedValue(
    makeSession({ user_id: ADVISOR_ID }) as any,
  )
  return token('ADVISOR', ADVISOR_ID)
}

const asOperations = () => {
  authRepoMock.findUser.mockResolvedValue(
    makeUser({ id: OPERATIONS_ID, role: 'OPERATIONS' }) as any,
  )
  authRepoMock.findAuthSessionById.mockResolvedValue(
    makeSession({ user_id: OPERATIONS_ID }) as any,
  )
  return token('OPERATIONS', OPERATIONS_ID)
}

// ── HTTP Test Suites ──────────────────────────────────────────────────────────

describe('Settings API — GET /api/v1/settings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it.each([
    ['ADMIN', asAdmin],
    ['ADVISOR', asAdvisor],
    ['OPERATIONS', asOperations],
  ])('is readable by %s', async (_role, asRole) => {
    const authToken = asRole()
    settingsRepoMock.findAllGroupsWithValues.mockResolvedValue([
      makeGroup({ values: [makeValue()] }) as any,
    ])

    const res = await request(app)
      .get('/api/v1/settings')
      .set('Authorization', `Bearer ${authToken}`)

    expect(res.status).toBe(200)
    expect(body<unknown[]>(res).data).toHaveLength(1)
  })

  it('returns 401 without a bearer token', async () => {
    const res = await request(app).get('/api/v1/settings')
    expect(res.status).toBe(401)
  })
})

describe('Settings API — GET /api/v1/settings/:groupKey', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the group with its values', async () => {
    const authToken = asAdmin()
    settingsRepoMock.findGroupByKeyWithValues.mockResolvedValue(
      makeGroup({ values: [makeValue()] }) as any,
    )

    const res = await request(app)
      .get('/api/v1/settings/countries')
      .set('Authorization', `Bearer ${authToken}`)

    expect(res.status).toBe(200)
    expect(body<{ key: string }>(res).data.key).toBe('countries')
  })

  it('returns 400 for an unknown group key (validated before touching the DB)', async () => {
    const authToken = asAdmin()

    const res = await request(app)
      .get('/api/v1/settings/not-a-real-group')
      .set('Authorization', `Bearer ${authToken}`)

    expect(res.status).toBe(400)
    expect(body(res).error?.code).toBe('VALIDATION_ERROR')
    expect(settingsRepoMock.findGroupByKeyWithValues).not.toHaveBeenCalled()
  })
})

describe('Settings API — POST /api/v1/settings/:groupKey/values', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    settingsRepoMock.findGroupByKey.mockResolvedValue(makeGroup() as any)
  })

  it('is forbidden for ADVISOR (value management is ADMIN-only)', async () => {
    const authToken = asAdvisor()

    const res = await request(app)
      .post('/api/v1/settings/countries/values')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ label: 'France' })

    expect(res.status).toBe(403)
    expect(settingsRepoMock.createValue).not.toHaveBeenCalled()
  })

  it('creates a value with a slugified key for ADMIN', async () => {
    const authToken = asAdmin()
    settingsRepoMock.createValue.mockResolvedValue(
      makeValue({ key: 'france', label: 'France' }) as any,
    )

    const res = await request(app)
      .post('/api/v1/settings/countries/values')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ label: 'France' })

    expect(res.status).toBe(201)
    expect(settingsRepoMock.createValue).toHaveBeenCalledWith(GROUP_ID, {
      key: 'france',
      label: 'France',
    })
  })

  it('returns 409 on a duplicate label within the same group', async () => {
    const authToken = asAdmin()
    settingsRepoMock.createValue.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    )

    const res = await request(app)
      .post('/api/v1/settings/countries/values')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ label: 'Canada' })

    expect(res.status).toBe(409)
    expect(body(res).error?.code).toBe('CONFLICT')
  })

  it('returns 400 for an empty label', async () => {
    const authToken = asAdmin()

    const res = await request(app)
      .post('/api/v1/settings/countries/values')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ label: '' })

    expect(res.status).toBe(400)
    expect(body(res).error?.code).toBe('VALIDATION_ERROR')
  })
})

describe('Settings API — PATCH /api/v1/settings/:groupKey/values/:valueId', () => {
  const VALUE_ID = '11111111-1111-4111-8111-111111111111'

  beforeEach(() => {
    vi.clearAllMocks()
    settingsRepoMock.findGroupByKey.mockResolvedValue(makeGroup() as any)
    settingsRepoMock.findValueInGroup.mockResolvedValue(
      makeValue({ id: VALUE_ID }) as any,
    )
  })

  it('toggles isActive for ADMIN', async () => {
    const authToken = asAdmin()
    settingsRepoMock.updateValue.mockResolvedValue(
      makeValue({ id: VALUE_ID, is_active: false }) as any,
    )

    const res = await request(app)
      .patch(`/api/v1/settings/countries/values/${VALUE_ID}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ isActive: false })

    expect(res.status).toBe(200)
    expect(body<{ isActive: boolean }>(res).data.isActive).toBe(false)
  })

  it('returns 404 when the value does not belong to the group', async () => {
    const authToken = asAdmin()
    settingsRepoMock.findValueInGroup.mockResolvedValue(null)

    const res = await request(app)
      .patch(`/api/v1/settings/countries/values/${VALUE_ID}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ label: 'Updated' })

    expect(res.status).toBe(404)
    expect(settingsRepoMock.updateValue).not.toHaveBeenCalled()
  })

  it('returns 400 when neither label nor isActive is provided', async () => {
    const authToken = asAdmin()

    const res = await request(app)
      .patch(`/api/v1/settings/countries/values/${VALUE_ID}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({})

    expect(res.status).toBe(400)
    expect(body(res).error?.code).toBe('VALIDATION_ERROR')
  })
})

describe('Settings API — DELETE /api/v1/settings/:groupKey/values/:valueId', () => {
  const VALUE_ID = '22222222-2222-4222-8222-222222222222'

  beforeEach(() => {
    vi.clearAllMocks()
    settingsRepoMock.findGroupByKey.mockResolvedValue(makeGroup() as any)
  })

  it('returns 409 when the value is still active', async () => {
    const authToken = asAdmin()
    settingsRepoMock.findValueInGroup.mockResolvedValue(
      makeValue({ id: VALUE_ID, is_active: true }) as any,
    )

    const res = await request(app)
      .delete(`/api/v1/settings/countries/values/${VALUE_ID}`)
      .set('Authorization', `Bearer ${authToken}`)

    expect(res.status).toBe(409)
    expect(body(res).error?.code).toBe('CONFLICT')
    expect(settingsRepoMock.deleteValue).not.toHaveBeenCalled()
  })

  it('deletes when the value is already disabled', async () => {
    const authToken = asAdmin()
    settingsRepoMock.findValueInGroup.mockResolvedValue(
      makeValue({ id: VALUE_ID, is_active: false }) as any,
    )

    const res = await request(app)
      .delete(`/api/v1/settings/countries/values/${VALUE_ID}`)
      .set('Authorization', `Bearer ${authToken}`)

    expect(res.status).toBe(200)
    expect(settingsRepoMock.deleteValue).toHaveBeenCalledWith(VALUE_ID)
  })
})
