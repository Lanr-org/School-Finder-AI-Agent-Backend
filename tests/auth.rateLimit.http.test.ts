// Brute-force limits on the public staff auth routes. Kept apart from auth.http.test.ts because
// the limiter counts live for the whole file. Each test uses its own client IPs and emails (the
// app trusts one proxy here, so X-Forwarded-For sets the IP) so the counts don't overlap.
import { vi } from 'vitest'

vi.hoisted(() => {
  process.env.TRUST_PROXY = '1'
})

import './setup-env'
import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import app from '../src/app'
import { createError } from '../src/common/errors/AppError'
import AuthService from '../src/modules/auth/auth.service'

vi.mock('../src/modules/auth/auth.service', () => ({
  default: {
    Login: vi.fn(),
    ForgotPassword: vi.fn(),
    VerifyResetPasswordToken: vi.fn(),
  },
}))

const TOKEN = 'a'.repeat(128)

const login = (ip: string, email: string) =>
  request(app)
    .post('/api/v1/auth/login')
    .set('X-Forwarded-For', ip)
    .send({ email, password: 'some-password' })

const forgot = (ip: string, email: string) =>
  request(app)
    .post('/api/v1/auth/forgot-password')
    .set('X-Forwarded-For', ip)
    .send({ email })

const expectRateLimited = (response: request.Response) => {
  expect(response.status).toBe(429)
  expect((response.body as { error: { code: string } }).error.code).toBe(
    'RATE_LIMITED',
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(AuthService.Login).mockRejectedValue(
    createError('Invalid email or password', 401, {}, 'UNAUTHENTICATED'),
  )
  vi.mocked(AuthService.ForgotPassword).mockResolvedValue(undefined)
  vi.mocked(AuthService.VerifyResetPasswordToken).mockResolvedValue(
    {} as Awaited<ReturnType<typeof AuthService.VerifyResetPasswordToken>>,
  )
})

describe('POST /api/v1/auth/login limits', () => {
  it('blocks an email after 10 failed attempts, even from different IPs', async () => {
    for (let i = 0; i < 10; i++) {
      expect(
        (await login(`198.51.100.${i}`, 'Target@Example.com')).status,
      ).toBe(401)
    }

    expectRateLimited(await login('198.51.100.50', 'target@example.com'))
    expect(AuthService.Login).toHaveBeenCalledTimes(10)
  })

  it('blocks an IP after 20 failed attempts across different emails', async () => {
    for (let i = 0; i < 20; i++) {
      expect((await login('203.0.113.7', `user${i}@example.com`)).status).toBe(
        401,
      )
    }

    expectRateLimited(await login('203.0.113.7', 'someone-else@example.com'))
    // Another IP is unaffected.
    expect(
      (await login('203.0.113.8', 'someone-else@example.com')).status,
    ).toBe(401)
  })

  it('never counts successful sign-ins', async () => {
    vi.mocked(AuthService.Login).mockResolvedValue({
      refreshToken: 'raw-refresh-token',
      data: {
        accessToken: 'access-token',
        user: {
          publicId: 'usr_1',
          fullName: 'Admin',
          email: 'ok@example.com',
          role: 'ADMIN',
          status: 'ACTIVE',
        },
      },
    })

    for (let i = 0; i < 25; i++) {
      expect((await login('192.0.2.1', 'ok@example.com')).status).toBe(200)
    }
  })
})

describe('POST /api/v1/auth/forgot-password limits', () => {
  it('allows 3 requests per email an hour', async () => {
    for (let i = 0; i < 3; i++) {
      expect(
        (await forgot(`198.18.0.${i}`, 'reset-me@example.com')).status,
      ).toBe(200)
    }

    expectRateLimited(await forgot('198.18.0.99', 'reset-me@example.com'))
    expect(AuthService.ForgotPassword).toHaveBeenCalledTimes(3)
  })

  it('allows 5 requests per IP an hour', async () => {
    for (let i = 0; i < 5; i++) {
      expect(
        (await forgot('198.18.1.1', `person${i}@example.com`)).status,
      ).toBe(200)
    }

    expectRateLimited(await forgot('198.18.1.1', 'person-new@example.com'))
  })
})

describe('reset and invitation token limits', () => {
  it('allows 20 token checks per IP in 15 minutes', async () => {
    for (let i = 0; i < 20; i++) {
      expect(
        (
          await request(app)
            .get(`/api/v1/auth/reset-password/${TOKEN}`)
            .set('X-Forwarded-For', '198.18.2.2')
        ).status,
      ).toBe(200)
    }

    expectRateLimited(
      await request(app)
        .get(`/api/v1/auth/reset-password/${TOKEN}`)
        .set('X-Forwarded-For', '198.18.2.2'),
    )
  })
})
