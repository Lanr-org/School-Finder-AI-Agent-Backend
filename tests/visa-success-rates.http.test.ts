import './setup-env'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import app from '../src/app'
import { generateAcessToken } from '../src/common/security/token'
import AuthRepo from '../src/modules/auth/auth.repository'
import { VisaRatesRepo } from '../src/modules/visaRates/visaRates.repository'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../src/modules/auth/auth.repository', () => ({
  default: {
    findUser: vi.fn(),
    findAuthSessionById: vi.fn(),
  },
}))

vi.mock('../src/modules/visaRates/visaRates.repository', () => ({
  VisaRatesRepo: {
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
const visaRatesRepoMock = vi.mocked(VisaRatesRepo)

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

const makeRate = (overrides: Record<string, unknown> = {}) => ({
  id: 'rate-uuid-1',
  public_id: 'VSR-1001',
  country: 'United Kingdom',
  source_partner: 'Edvoy',
  period_label: 'Q3 2026',
  success_rate: 82,
  sample_size: 340,
  published_at: new Date('2026-09-01'),
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

// ── HTTP Test Suites ──────────────────────────────────────────────────────────

describe('Visa Success Rates API — GET /api/v1/visa-success-rates', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('is readable by ADVISOR', async () => {
    const authToken = asAdvisor()
    visaRatesRepoMock.list.mockResolvedValue({
      rates: [makeRate() as any],
      total: 1,
    })

    const res = await request(app)
      .get('/api/v1/visa-success-rates')
      .set('Authorization', `Bearer ${authToken}`)

    expect(res.status).toBe(200)
    expect(body<{ rates: unknown[] }>(res).data.rates).toHaveLength(1)
  })

  it('returns 401 without a bearer token', async () => {
    const res = await request(app).get('/api/v1/visa-success-rates')
    expect(res.status).toBe(401)
  })
})

describe('Visa Success Rates API — POST /api/v1/visa-success-rates', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('is forbidden for ADVISOR', async () => {
    const authToken = asAdvisor()

    const res = await request(app)
      .post('/api/v1/visa-success-rates')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        country: 'UK',
        periodLabel: 'Q3 2026',
        successRate: 82,
        publishedAt: '2026-09-01',
      })

    expect(res.status).toBe(403)
    expect(visaRatesRepoMock.create).not.toHaveBeenCalled()
  })

  it('creates a rate for ADMIN, normalizing the country alias', async () => {
    const authToken = asAdmin()
    visaRatesRepoMock.create.mockResolvedValue(makeRate() as any)

    const res = await request(app)
      .post('/api/v1/visa-success-rates')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        country: 'UK',
        sourcePartner: 'Edvoy',
        periodLabel: 'Q3 2026',
        successRate: 82,
        sampleSize: 340,
        publishedAt: '2026-09-01',
      })

    expect(res.status).toBe(201)
    expect(visaRatesRepoMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        country: 'United Kingdom',
        createdBy: ADMIN_ID,
      }),
    )
  })

  it('returns 400 for a success rate over 100', async () => {
    const authToken = asAdmin()

    const res = await request(app)
      .post('/api/v1/visa-success-rates')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        country: 'Canada',
        periodLabel: 'Q3 2026',
        successRate: 150,
        publishedAt: '2026-09-01',
      })

    expect(res.status).toBe(400)
    expect(body(res).error?.code).toBe('VALIDATION_ERROR')
  })
})

describe('Visa Success Rates API — PATCH & DELETE /api/v1/visa-success-rates/:rateId', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    visaRatesRepoMock.findByPublicId.mockResolvedValue(makeRate() as any)
  })

  it('updates the success rate for ADMIN', async () => {
    const authToken = asAdmin()
    visaRatesRepoMock.update.mockResolvedValue(
      makeRate({ success_rate: 85 }) as any,
    )

    const res = await request(app)
      .patch('/api/v1/visa-success-rates/VSR-1001')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ successRate: 85 })

    expect(res.status).toBe(200)
    expect(body<{ successRate: number }>(res).data.successRate).toBe(85)
  })

  it('returns 404 for an unknown rate', async () => {
    const authToken = asAdmin()
    visaRatesRepoMock.findByPublicId.mockResolvedValue(null)

    const res = await request(app)
      .patch('/api/v1/visa-success-rates/VSR-9999')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ successRate: 85 })

    expect(res.status).toBe(404)
  })

  it('deletes directly for ADMIN', async () => {
    const authToken = asAdmin()

    const res = await request(app)
      .delete('/api/v1/visa-success-rates/VSR-1001')
      .set('Authorization', `Bearer ${authToken}`)

    expect(res.status).toBe(200)
    expect(visaRatesRepoMock.delete).toHaveBeenCalledWith('rate-uuid-1')
  })
})
