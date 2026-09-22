import './setup-env'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import app from '../src/app'
import { generateAcessToken } from '../src/common/security/token'
import AuthRepo from '../src/modules/auth/auth.repository'
import { BulletinsRepo } from '../src/modules/bulletins/bulletins.repository'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../src/modules/auth/auth.repository', () => ({
  default: {
    findUser: vi.fn(),
    findAuthSessionById: vi.fn(),
  },
}))

vi.mock('../src/modules/bulletins/bulletins.repository', () => ({
  BulletinsRepo: {
    create: vi.fn(),
    findByPublicId: vi.fn(),
    list: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
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
const bulletinsRepoMock = vi.mocked(BulletinsRepo)

// ── Constants ─────────────────────────────────────────────────────────────────

const ADMIN_ID = 'admin-user-uuid-0001'
const ADVISOR_ID = 'advisor-user-uuid-0001'
const OPERATIONS_ID = 'ops-user-uuid-0001'
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

const makeBulletin = (overrides: Record<string, unknown> = {}) => ({
  id: 'bulletin-uuid-1',
  public_id: 'BUL-1001',
  title: 'UK Graduate Route processing times shortened',
  body: 'Processing times for the Graduate Route have improved this quarter.',
  source_partner: 'Edvoy',
  countries: ['United Kingdom'],
  published_at: new Date('2026-09-01'),
  expires_at: null as Date | null,
  is_active: true,
  created_by: ADMIN_ID,
  created_at: new Date('2026-09-01'),
  updated_at: new Date('2026-09-01'),
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

describe('Bulletins API — GET /api/v1/bulletins', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('is readable by ADVISOR', async () => {
    const authToken = asAdvisor()
    bulletinsRepoMock.list.mockResolvedValue({
      bulletins: [makeBulletin() as any],
      total: 1,
    })

    const res = await request(app)
      .get('/api/v1/bulletins')
      .set('Authorization', `Bearer ${authToken}`)

    expect(res.status).toBe(200)
    expect(body<{ bulletins: unknown[] }>(res).data.bulletins).toHaveLength(1)
  })

  it('returns 401 without a bearer token', async () => {
    const res = await request(app).get('/api/v1/bulletins')
    expect(res.status).toBe(401)
  })
})

describe('Bulletins API — POST /api/v1/bulletins', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('is forbidden for ADVISOR', async () => {
    const authToken = asAdvisor()

    const res = await request(app)
      .post('/api/v1/bulletins')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ title: 'Test', body: 'Body', publishedAt: '2026-09-01' })

    expect(res.status).toBe(403)
    expect(bulletinsRepoMock.create).not.toHaveBeenCalled()
  })

  it('creates a bulletin for OPERATIONS, normalizing country aliases', async () => {
    const authToken = asOperations()
    bulletinsRepoMock.create.mockResolvedValue(makeBulletin() as any)

    const res = await request(app)
      .post('/api/v1/bulletins')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        title: 'UK Graduate Route processing times shortened',
        body: 'Processing times for the Graduate Route have improved this quarter.',
        sourcePartner: 'Edvoy',
        countries: ['UK'],
        publishedAt: '2026-09-01',
      })

    expect(res.status).toBe(201)
    expect(bulletinsRepoMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        countries: ['United Kingdom'],
        createdBy: OPERATIONS_ID,
      }),
    )
  })

  it('creates a bulletin for ADMIN', async () => {
    const authToken = asAdmin()
    bulletinsRepoMock.create.mockResolvedValue(makeBulletin() as any)

    const res = await request(app)
      .post('/api/v1/bulletins')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ title: 'Test', body: 'Body', publishedAt: '2026-09-01' })

    expect(res.status).toBe(201)
    expect(bulletinsRepoMock.create).toHaveBeenCalledWith(
      expect.objectContaining({ createdBy: ADMIN_ID }),
    )
  })

  it('returns 400 for an empty title', async () => {
    const authToken = asAdmin()

    const res = await request(app)
      .post('/api/v1/bulletins')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ title: '', body: 'Body', publishedAt: '2026-09-01' })

    expect(res.status).toBe(400)
    expect(body(res).error?.code).toBe('VALIDATION_ERROR')
  })
})

describe('Bulletins API — PATCH & DELETE /api/v1/bulletins/:bulletinId', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    bulletinsRepoMock.findByPublicId.mockResolvedValue(makeBulletin() as any)
  })

  it('updates isActive for ADMIN', async () => {
    const authToken = asAdmin()
    bulletinsRepoMock.update.mockResolvedValue(
      makeBulletin({ is_active: false }) as any,
    )

    const res = await request(app)
      .patch('/api/v1/bulletins/BUL-1001')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ isActive: false })

    expect(res.status).toBe(200)
    expect(body<{ isActive: boolean }>(res).data.isActive).toBe(false)
  })

  it('returns 404 for an unknown bulletin', async () => {
    const authToken = asAdmin()
    bulletinsRepoMock.findByPublicId.mockResolvedValue(null)

    const res = await request(app)
      .patch('/api/v1/bulletins/BUL-9999')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ isActive: false })

    expect(res.status).toBe(404)
  })

  it('is forbidden for ADVISOR on delete', async () => {
    const authToken = asAdvisor()

    const res = await request(app)
      .delete('/api/v1/bulletins/BUL-1001')
      .set('Authorization', `Bearer ${authToken}`)

    expect(res.status).toBe(403)
    expect(bulletinsRepoMock.delete).not.toHaveBeenCalled()
  })

  it('deletes directly for ADMIN — no disable-first gate (unlike settings values)', async () => {
    const authToken = asAdmin()

    const res = await request(app)
      .delete('/api/v1/bulletins/BUL-1001')
      .set('Authorization', `Bearer ${authToken}`)

    expect(res.status).toBe(200)
    expect(bulletinsRepoMock.delete).toHaveBeenCalledWith('bulletin-uuid-1')
  })
})
