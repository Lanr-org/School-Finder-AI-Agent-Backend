import './setup-env'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import app from '../src/app'
import prisma from '../src/database/prisma'

vi.mock('../src/database/prisma', () => ({
  default: {
    $queryRaw: vi.fn(),
  },
}))

const prismaMock = vi.mocked(prisma)

type Body = {
  success: boolean
  data?: Record<string, unknown>
  error?: { code: string; message: string }
}

describe('Health — GET /health/live', () => {
  it('returns 200 without touching the database or requiring auth', async () => {
    const res = await request(app).get('/health/live')

    expect(res.status).toBe(200)
    expect((res.body as Body).data).toEqual({ status: 'ok' })
    expect(prismaMock.$queryRaw).not.toHaveBeenCalled()
  })
})

describe('Health — GET /health/ready', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 200 when the database answers', async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ '?column?': 1 }] as never)

    const res = await request(app).get('/health/ready')

    expect(res.status).toBe(200)
    expect((res.body as Body).data).toEqual({
      status: 'ready',
      checks: { database: 'up' },
    })
  })

  it('returns 503 without leaking connection details when the database is down', async () => {
    prismaMock.$queryRaw.mockRejectedValue(
      new Error('connect ECONNREFUSED 127.0.0.1:5432') as never,
    )

    const res = await request(app).get('/health/ready')

    expect(res.status).toBe(503)
    expect((res.body as Body).error?.code).toBe('SERVICE_UNAVAILABLE')
    expect(JSON.stringify(res.body)).not.toContain('ECONNREFUSED')
    expect(JSON.stringify(res.body)).not.toContain('5432')
  })

  // Real timers: faking setTimeout also stalls supertest's own HTTP plumbing.
  // Takes ~2s (the readiness timeout); the explicit 5s limit keeps headroom.
  it('returns 503 when the database does not answer within the timeout', async () => {
    prismaMock.$queryRaw.mockReturnValue(new Promise(() => {}) as never)

    const startedAt = Date.now()
    const res = await request(app).get('/health/ready')

    expect(res.status).toBe(503)
    expect((res.body as Body).error?.code).toBe('SERVICE_UNAVAILABLE')
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(1900)
  }, 5000)
})
