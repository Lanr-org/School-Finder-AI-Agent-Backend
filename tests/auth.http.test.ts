import './setup-env'
import type { Express } from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import app from '../src/app'
import { generateAcessToken } from '../src/common/security/token'
import AuthRepo from '../src/modules/auth/auth.repository'
import AuthService from '../src/modules/auth/auth.service'

vi.mock('../src/modules/auth/auth.repository', () => ({
  default: {
    findUser: vi.fn(),
    findAuthSessionById: vi.fn(),
  },
}))

vi.mock('../src/modules/auth/auth.service', () => ({
  default: {
    Login: vi.fn(),
    Refresh: vi.fn(),
    Logout: vi.fn(),
    LogoutAll: vi.fn(),
    UserDetails: vi.fn(),
    EditUserDetails: vi.fn(),
    ChangePassword: vi.fn(),
    ForgotPassword: vi.fn(),
    VerifyResetPasswordToken: vi.fn(),
    ResetPassword: vi.fn(),
    VerifyInvitationToken: vi.fn(),
    ResetPasswordFromInvitation: vi.fn(),
  },
}))

const authRepoMock = vi.mocked(AuthRepo)

type LoginResponseBody = {
  success: boolean
  message: string
  data: {
    accessToken: string
    user: {
      publicId: string
      email: string
    }
  }
  meta: {
    requestId: unknown
  }
}

type RefreshResponseBody = {
  success: boolean
  message: string
  data: {
    accessToken: string
  }
  meta: {
    requestId: unknown
  }
}

type UserDetailsResponseBody = {
  success: boolean
  message: string
  data: {
    public_id: string
    email: string
    role: string
  }
  meta: {
    requestId: unknown
  }
}

type ChangePasswordResponseBody = {
  success: boolean
  message: string
  data: {
    accessToken: string
    user: {
      public_id: string
      email: string
      role: string
    }
  }
  meta: {
    requestId: unknown
  }
}

type VerifyResetPasswordTokenResponseBody = {
  success: boolean
  message: string
  data: {
    email: string
    fullName: string
  }
  meta: {
    requestId: unknown
  }
}

type ErrorResponseBody = {
  success: false
  error: {
    message: string
    code: string
    requestId: unknown
  }
}

const accessToken = generateAcessToken('user-id', 'session-id', 'ADMIN', 0)
const activeUser = {
  id: 'user-id',
  public_id: 'usr_123',
  full_name: 'Admin User',
  email: 'admin@example.com',
  phone: null,
  password_hash: 'argon-hash',
  role: 'ADMIN',
  status: 'ACTIVE',
  last_login_at: null,
  password_changed_at: null,
  token_version: 0,
  created_at: new Date('2026-06-01T00:00:00.000Z'),
  updated_at: new Date('2026-06-01T00:00:00.000Z'),
} as const
const activeSession = {
  id: 'session-id',
  user_id: 'user-id',
  refresh_token_hash: 'hashed-refresh-token',
  token_family: 'token-family-id',
  user_agent: 'vitest-agent',
  ip_address: '127.0.0.1',
  expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
  revoked_at: null as Date | null,
  last_used_at: null as Date | null,
  created_at: new Date('2026-06-01T00:00:00.000Z'),
}

const mockAuthenticatedRequest = () => {
  authRepoMock.findUser.mockResolvedValue(activeUser)
  authRepoMock.findAuthSessionById.mockResolvedValue(activeSession)
}

const getFirstSetCookie = (headers: unknown): string | undefined => {
  const headerRecord =
    typeof headers === 'object' && headers !== null
      ? (headers as Record<string, unknown>)
      : {}
  const setCookie = headerRecord['set-cookie']

  if (Array.isArray(setCookie)) {
    const setCookieValues = setCookie as unknown[]
    const firstCookie = setCookieValues[0]
    return typeof firstCookie === 'string' ? firstCookie : undefined
  }

  return typeof setCookie === 'string' ? setCookie : undefined
}

describe('POST /api/v1/auth/login', () => {
  const testApp: Express = app

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns an access token payload and sets an HttpOnly refresh cookie', async () => {
    vi.mocked(AuthService.Login).mockResolvedValue({
      refreshToken: 'raw-refresh-token',
      data: {
        accessToken: 'access-token',
        user: {
          publicId: 'usr_123',
          fullName: 'Admin User',
          email: 'admin@example.com',
          role: 'ADMIN',
          status: 'ACTIVE',
        },
      },
    })

    const response = await request(testApp)
      .post('/api/v1/auth/login')
      .set('User-Agent', 'vitest-agent')
      .send({ email: 'admin@example.com', password: 'correct-password' })
      .expect(200)

    const responseBody = response.body as unknown as LoginResponseBody
    const setCookie = getFirstSetCookie(response.headers)

    expect(responseBody).toMatchObject({
      success: true,
      message: 'Login successful',
      data: {
        accessToken: 'access-token',
        user: {
          publicId: 'usr_123',
          email: 'admin@example.com',
        },
      },
    })
    expect(typeof responseBody.meta.requestId).toBe('string')
    expect(setCookie).toContain('refreshToken=raw-refresh-token')
    expect(setCookie).toContain('HttpOnly')

    const loginRequest = vi.mocked(AuthService.Login).mock.calls[0]?.[0]
    expect(loginRequest).toMatchObject({
      email: 'admin@example.com',
      password: 'correct-password',
      userAgent: 'vitest-agent',
    })
    expect(typeof loginRequest?.ipAddress).toBe('string')
  })

  it('returns a stable validation error response', async () => {
    const response = await request(testApp)
      .post('/api/v1/auth/login')
      .send({ email: 'not-an-email', password: 'short' })
      .expect(400)

    const responseBody = response.body as unknown as ErrorResponseBody

    expect(responseBody.error).toMatchObject({
      message: 'Validation failed',
      code: 'VALIDATION_ERROR',
    })
    expect(typeof responseBody.error.requestId).toBe('string')
  })
})

describe('POST /api/v1/auth/refresh', () => {
  const testApp: Express = app

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reads the refresh token from the cookie, rotates it, and returns a new access token', async () => {
    vi.mocked(AuthService.Refresh).mockResolvedValue({
      newRefreshToken: 'new-raw-refresh-token',
      accessToken: 'new-access-token',
    })

    const response = await request(testApp)
      .post('/api/v1/auth/refresh')
      .set('User-Agent', 'vitest-agent')
      .set('Cookie', 'refreshToken=' + 'a'.repeat(128))
      .expect(200)

    const responseBody = response.body as unknown as RefreshResponseBody
    const setCookie = getFirstSetCookie(response.headers)

    expect(responseBody).toMatchObject({
      success: true,
      message: 'Refresh successful',
      data: {
        accessToken: 'new-access-token',
      },
    })
    expect(typeof responseBody.meta.requestId).toBe('string')
    expect(setCookie).toContain('refreshToken=new-raw-refresh-token')
    expect(setCookie).toContain('HttpOnly')

    const refreshRequest = vi.mocked(AuthService.Refresh).mock.calls[0]?.[0]
    expect(refreshRequest).toMatchObject({
      refreshToken: 'a'.repeat(128),
      userAgent: 'vitest-agent',
    })
    expect(typeof refreshRequest?.ipAddress).toBe('string')
  })

  it('rejects requests without a refresh cookie', async () => {
    const response = await request(testApp)
      .post('/api/v1/auth/refresh')
      .expect(400)

    const responseBody = response.body as unknown as ErrorResponseBody

    expect(responseBody.error).toMatchObject({
      message: 'Refresh token is required',
      code: 'UNAUTHORIZED',
    })
    expect(AuthService.Refresh).not.toHaveBeenCalled()
  })
})

describe('POST /api/v1/auth/forgot-password', () => {
  const testApp: Express = app

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(AuthService.ForgotPassword).mockResolvedValue(undefined)
  })

  it('returns a generic success response and passes the email to the service', async () => {
    const response = await request(testApp)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'admin@example.com' })
      .expect(200)

    expect(response.body).toMatchObject({
      success: true,
      message:
        'If an active account exists for that email, a password reset link has been sent',
      meta: {
        requestId: expect.any(String) as string,
      },
    })
    expect(AuthService.ForgotPassword).toHaveBeenCalledWith({
      email: 'admin@example.com',
    })
  })

  it('rejects invalid email requests before calling the service', async () => {
    const response = await request(testApp)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'not-an-email' })
      .expect(400)

    const responseBody = response.body as unknown as ErrorResponseBody

    expect(responseBody.error).toMatchObject({
      message: 'Validation failed',
      code: 'VALIDATION_ERROR',
    })
    expect(AuthService.ForgotPassword).not.toHaveBeenCalled()
  })
})

describe('GET /api/v1/auth/reset-password/:token', () => {
  const testApp: Express = app

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(AuthService.VerifyResetPasswordToken).mockResolvedValue({
      email: 'admin@example.com',
      fullName: 'Admin User',
    })
  })

  it('verifies the reset token and returns minimal public user state', async () => {
    const token = 'a'.repeat(128)

    const response = await request(testApp)
      .get(`/api/v1/auth/reset-password/${token}`)
      .expect(200)

    const responseBody =
      response.body as unknown as VerifyResetPasswordTokenResponseBody

    expect(responseBody).toMatchObject({
      success: true,
      message: 'Password reset token is valid',
      data: {
        email: 'admin@example.com',
        fullName: 'Admin User',
      },
    })
    expect(typeof responseBody.meta.requestId).toBe('string')
    expect(responseBody.data).not.toHaveProperty('id')
    expect(responseBody.data).not.toHaveProperty('status')
    expect(AuthService.VerifyResetPasswordToken).toHaveBeenCalledWith(token)
  })

  it('rejects malformed reset tokens before calling the service', async () => {
    const response = await request(testApp)
      .get('/api/v1/auth/reset-password/not-a-token')
      .expect(400)

    const responseBody = response.body as unknown as ErrorResponseBody

    expect(responseBody.error).toMatchObject({
      message: 'Validation failed',
      code: 'VALIDATION_ERROR',
    })
    expect(AuthService.VerifyResetPasswordToken).not.toHaveBeenCalled()
  })
})

describe('POST /api/v1/auth/reset-password/:token', () => {
  const testApp: Express = app

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(AuthService.ResetPassword).mockResolvedValue(undefined)
  })

  it('resets the password, clears the refresh cookie, and returns an empty success response', async () => {
    const token = 'a'.repeat(128)

    const response = await request(testApp)
      .post(`/api/v1/auth/reset-password/${token}`)
      .set('Cookie', 'refreshToken=' + 'b'.repeat(128))
      .send({
        newPassword: 'NewCorrectPass123',
        confirmNewPassword: 'NewCorrectPass123',
      })
      .expect(200)

    const setCookie = getFirstSetCookie(response.headers)

    expect(response.body).toMatchObject({
      success: true,
      message: 'Password reset successfully',
      meta: {
        requestId: expect.any(String) as string,
      },
    })
    expect(setCookie).toContain('refreshToken=')
    expect(setCookie).toContain('Expires=Thu, 01 Jan 1970')
    expect(AuthService.ResetPassword).toHaveBeenCalledWith(token, {
      newPassword: 'NewCorrectPass123',
      confirmNewPassword: 'NewCorrectPass123',
    })
  })

  it('rejects malformed reset tokens before calling the service', async () => {
    const response = await request(testApp)
      .post('/api/v1/auth/reset-password/not-a-token')
      .send({
        newPassword: 'NewCorrectPass123',
        confirmNewPassword: 'NewCorrectPass123',
      })
      .expect(400)

    const responseBody = response.body as unknown as ErrorResponseBody

    expect(responseBody.error).toMatchObject({
      message: 'Validation failed',
      code: 'VALIDATION_ERROR',
    })
    expect(AuthService.ResetPassword).not.toHaveBeenCalled()
  })

  it('rejects weak replacement passwords before calling the service', async () => {
    const response = await request(testApp)
      .post(`/api/v1/auth/reset-password/${'a'.repeat(128)}`)
      .send({
        newPassword: 'weak-password',
        confirmNewPassword: 'weak-password',
      })
      .expect(400)

    const responseBody = response.body as unknown as ErrorResponseBody

    expect(responseBody.error).toMatchObject({
      message: 'Validation failed',
      code: 'VALIDATION_ERROR',
    })
    expect(AuthService.ResetPassword).not.toHaveBeenCalled()
  })

  it('rejects mismatched password confirmation before calling the service', async () => {
    const response = await request(testApp)
      .post(`/api/v1/auth/reset-password/${'a'.repeat(128)}`)
      .send({
        newPassword: 'NewCorrectPass123',
        confirmNewPassword: 'DifferentPass123',
      })
      .expect(400)

    const responseBody = response.body as unknown as ErrorResponseBody

    expect(responseBody.error).toMatchObject({
      message: 'Validation failed',
      code: 'VALIDATION_ERROR',
    })
    expect(AuthService.ResetPassword).not.toHaveBeenCalled()
  })
})

describe('POST /api/v1/auth/logout', () => {
  const testApp: Express = app

  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthenticatedRequest()
    vi.mocked(AuthService.Logout).mockResolvedValue(undefined)
  })

  it('passes bearer claims and the refresh cookie to the service, then clears the cookie', async () => {
    const response = await request(testApp)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Cookie', 'refreshToken=' + 'a'.repeat(128))
      .expect(200)

    const setCookie = getFirstSetCookie(response.headers)

    expect(response.body).toMatchObject({
      success: true,
      message: 'Successfully logged out',
      meta: {
        requestId: expect.any(String) as string,
      },
    })
    expect(setCookie).toContain('refreshToken=')
    expect(setCookie).toContain('Expires=Thu, 01 Jan 1970')
    expect(AuthService.Logout).toHaveBeenCalledWith({
      sub: 'user-id',
      session_Id: 'session-id',
      role: 'ADMIN',
      token_version: 0,
      iat: expect.any(Number) as number,
      exp: expect.any(Number) as number,
      refreshToken: 'a'.repeat(128),
    })
  })

  it('rejects requests without a bearer token', async () => {
    const response = await request(testApp)
      .post('/api/v1/auth/logout')
      .set('Cookie', 'refreshToken=' + 'a'.repeat(128))
      .expect(401)

    const responseBody = response.body as unknown as ErrorResponseBody

    expect(responseBody.error).toMatchObject({
      message: 'Not authorized',
      code: 'TOKEN_MISSING',
    })
    expect(AuthService.Logout).not.toHaveBeenCalled()
  })
})

describe('POST /api/v1/auth/logout-all', () => {
  const testApp: Express = app

  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthenticatedRequest()
    vi.mocked(AuthService.LogoutAll).mockResolvedValue(undefined)
  })

  it('passes bearer claims and revokes all sessions for that user', async () => {
    const response = await request(testApp)
      .post('/api/v1/auth/logout-all')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Cookie', 'refreshToken=' + 'a'.repeat(128))
      .expect(200)

    expect(response.body).toMatchObject({
      success: true,
      message: 'All sessions logged out',
      meta: {
        requestId: expect.any(String) as string,
      },
    })
    expect(AuthService.LogoutAll).toHaveBeenCalledWith({
      sub: 'user-id',
      session_Id: 'session-id',
      role: 'ADMIN',
      token_version: 0,
      iat: expect.any(Number) as number,
      exp: expect.any(Number) as number,
      refreshToken: 'a'.repeat(128),
    })
  })
})

describe('GET /api/v1/auth/me', () => {
  const testApp: Express = app

  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthenticatedRequest()
    vi.mocked(AuthService.UserDetails).mockResolvedValue({
      public_id: 'usr_123',
      full_name: 'Admin User',
      email: 'admin@example.com',
      phone: null,
      role: 'ADMIN',
      status: 'ACTIVE',
      last_login_at: null,
      created_at: new Date('2026-06-01T00:00:00.000Z'),
      updated_at: new Date('2026-06-01T00:00:00.000Z'),
    })
  })

  it('returns the authenticated user from bearer-token claims', async () => {
    const response = await request(testApp)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)

    const responseBody = response.body as unknown as UserDetailsResponseBody

    expect(responseBody).toMatchObject({
      success: true,
      message: 'User details retrieved successfully',
      data: {
        public_id: 'usr_123',
        email: 'admin@example.com',
        role: 'ADMIN',
      },
    })
    expect(typeof responseBody.meta.requestId).toBe('string')
    expect(AuthService.UserDetails).toHaveBeenCalledWith({
      sub: 'user-id',
      session_Id: 'session-id',
      role: 'ADMIN',
      token_version: 0,
      iat: expect.any(Number) as number,
      exp: expect.any(Number) as number,
    })
  })
})

describe('PATCH /api/v1/auth/me', () => {
  const testApp: Express = app

  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthenticatedRequest()
    vi.mocked(AuthService.EditUserDetails).mockResolvedValue({
      public_id: 'usr_123',
      full_name: 'Updated Admin',
      email: 'admin@example.com',
      phone: '+2348012345678',
      role: 'ADMIN',
      status: 'ACTIVE',
      last_login_at: null,
      created_at: new Date('2026-06-01T00:00:00.000Z'),
      updated_at: new Date('2026-06-20T00:00:00.000Z'),
    })
  })

  it('updates the authenticated user profile fields', async () => {
    const response = await request(testApp)
      .patch('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ fullName: 'Updated Admin', phone: '+2348012345678' })
      .expect(200)

    const responseBody = response.body as unknown as UserDetailsResponseBody

    expect(responseBody).toMatchObject({
      success: true,
      message: 'User details updated successfully',
      data: {
        public_id: 'usr_123',
        email: 'admin@example.com',
        role: 'ADMIN',
      },
    })
    expect(typeof responseBody.meta.requestId).toBe('string')
    expect(AuthService.EditUserDetails).toHaveBeenCalledWith(
      {
        sub: 'user-id',
        session_Id: 'session-id',
        role: 'ADMIN',
        token_version: 0,
        iat: expect.any(Number) as number,
        exp: expect.any(Number) as number,
      },
      {
        fullName: 'Updated Admin',
        phone: '+2348012345678',
      },
    )
  })

  it('rejects empty profile updates', async () => {
    const response = await request(testApp)
      .patch('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(400)

    const responseBody = response.body as unknown as ErrorResponseBody

    expect(responseBody.error).toMatchObject({
      message: 'Validation failed',
      code: 'VALIDATION_ERROR',
    })
    expect(AuthService.EditUserDetails).not.toHaveBeenCalled()
  })

  it('rejects revoked access-token sessions before updating', async () => {
    authRepoMock.findAuthSessionById.mockResolvedValue({
      ...activeSession,
      revoked_at: new Date('2026-06-20T00:00:00.000Z'),
    })

    const response = await request(testApp)
      .patch('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ fullName: 'Updated Admin' })
      .expect(401)

    const responseBody = response.body as unknown as ErrorResponseBody

    expect(responseBody.error).toMatchObject({
      message: 'Authentication session revoked, please log in again',
      code: 'AUTH_SESSION_REVOKED',
    })
    expect(AuthService.EditUserDetails).not.toHaveBeenCalled()
  })
})

describe('POST /api/v1/auth/change-password', () => {
  const testApp: Express = app

  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthenticatedRequest()
    vi.mocked(AuthService.ChangePassword).mockResolvedValue({
      user: {
        public_id: 'usr_123',
        full_name: 'Admin User',
        email: 'admin@example.com',
        phone: null,
        role: 'ADMIN',
        status: 'ACTIVE',
        last_login_at: null,
        created_at: new Date('2026-06-01T00:00:00.000Z'),
        updated_at: new Date('2026-06-21T00:00:00.000Z'),
      },
      accessToken: 'new-access-token',
      refreshToken: 'new-raw-refresh-token',
    })
  })

  it('changes the authenticated user password and rotates the refresh cookie', async () => {
    const response = await request(testApp)
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        currentPassword: 'CorrectPass123',
        newPassword: 'NewCorrectPass123',
        confirmNewPassword: 'NewCorrectPass123',
      })
      .expect(200)

    const responseBody = response.body as unknown as ChangePasswordResponseBody
    const setCookie = getFirstSetCookie(response.headers)

    expect(responseBody).toMatchObject({
      success: true,
      message: 'Password changed successfully',
      data: {
        accessToken: 'new-access-token',
        user: {
          public_id: 'usr_123',
          email: 'admin@example.com',
          role: 'ADMIN',
        },
      },
    })
    expect(typeof responseBody.meta.requestId).toBe('string')
    expect(setCookie).toContain('refreshToken=new-raw-refresh-token')
    expect(setCookie).toContain('HttpOnly')
    expect(AuthService.ChangePassword).toHaveBeenCalledWith(
      {
        sub: 'user-id',
        session_Id: 'session-id',
        role: 'ADMIN',
        token_version: 0,
        iat: expect.any(Number) as number,
        exp: expect.any(Number) as number,
      },
      {
        currentPassword: 'CorrectPass123',
        newPassword: 'NewCorrectPass123',
        confirmNewPassword: 'NewCorrectPass123',
      },
    )
  })

  it('rejects weak replacement passwords before calling the service', async () => {
    const response = await request(testApp)
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        currentPassword: 'CorrectPass123',
        newPassword: 'weak-password',
        confirmNewPassword: 'weak-password',
      })
      .expect(400)

    const responseBody = response.body as unknown as ErrorResponseBody

    expect(responseBody.error).toMatchObject({
      message: 'Validation failed',
      code: 'VALIDATION_ERROR',
    })
    expect(AuthService.ChangePassword).not.toHaveBeenCalled()
  })

  it('rejects revoked access-token sessions before changing the password', async () => {
    authRepoMock.findAuthSessionById.mockResolvedValue({
      ...activeSession,
      revoked_at: new Date('2026-06-20T00:00:00.000Z'),
    })

    const response = await request(testApp)
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        currentPassword: 'CorrectPass123',
        newPassword: 'NewCorrectPass123',
        confirmNewPassword: 'NewCorrectPass123',
      })
      .expect(401)

    const responseBody = response.body as unknown as ErrorResponseBody

    expect(responseBody.error).toMatchObject({
      message: 'Authentication session revoked, please log in again',
      code: 'AUTH_SESSION_REVOKED',
    })
    expect(AuthService.ChangePassword).not.toHaveBeenCalled()
  })
})

describe('GET /api/v1/auth/invitations/:token', () => {
  const testApp: Express = app

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('verifies the invitation token and returns minimal public user state', async () => {
    const verifiedInvitation = {
      email: 'invited@example.com',
      fullName: 'Invited User',
    }
    vi.mocked(AuthService.VerifyInvitationToken).mockResolvedValue(
      verifiedInvitation,
    )

    const response = await request(testApp)
      .get('/api/v1/auth/invitations/' + 'a'.repeat(128))
      .expect(200)

    const responseBody =
      response.body as unknown as VerifyResetPasswordTokenResponseBody

    expect(responseBody).toMatchObject({
      success: true,
      message: 'Invitation verification token is valid',
      data: verifiedInvitation,
    })
    expect(AuthService.VerifyInvitationToken).toHaveBeenCalledWith(
      'a'.repeat(128),
    )
  })

  it('rejects malformed invitation tokens before calling the service', async () => {
    const response = await request(testApp)
      .get('/api/v1/auth/invitations/invalid-token')
      .expect(400)

    const responseBody = response.body as unknown as ErrorResponseBody

    expect(responseBody.error).toMatchObject({
      message: 'Validation failed',
      code: 'VALIDATION_ERROR',
    })
    expect(AuthService.VerifyInvitationToken).not.toHaveBeenCalled()
  })
})

describe('POST /api/v1/auth/invitations/:token/accept', () => {
  const testApp: Express = app

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('accepts the invitation and sets the password', async () => {
    vi.mocked(AuthService.ResetPasswordFromInvitation).mockResolvedValue(
      undefined,
    )

    await request(testApp)
      .post('/api/v1/auth/invitations/' + 'a'.repeat(128) + '/accept')
      .send({
        newPassword: 'CorrectPass123',
        confirmNewPassword: 'CorrectPass123',
      })
      .expect(204)

    expect(AuthService.ResetPasswordFromInvitation).toHaveBeenCalledWith(
      'a'.repeat(128),
      {
        newPassword: 'CorrectPass123',
        confirmNewPassword: 'CorrectPass123',
      },
    )
  })

  it('rejects malformed invitation tokens before calling the service', async () => {
    const response = await request(testApp)
      .post('/api/v1/auth/invitations/invalid-token/accept')
      .send({
        newPassword: 'CorrectPass123',
        confirmNewPassword: 'CorrectPass123',
      })
      .expect(400)

    const responseBody = response.body as unknown as ErrorResponseBody

    expect(responseBody.error).toMatchObject({
      message: 'Validation failed',
      code: 'VALIDATION_ERROR',
    })
    expect(AuthService.ResetPasswordFromInvitation).not.toHaveBeenCalled()
  })

  it('rejects weak passwords before calling the service', async () => {
    const response = await request(testApp)
      .post('/api/v1/auth/invitations/' + 'a'.repeat(128) + '/accept')
      .send({
        newPassword: 'weak',
        confirmNewPassword: 'weak',
      })
      .expect(400)

    const responseBody = response.body as unknown as ErrorResponseBody

    expect(responseBody.error).toMatchObject({
      message: 'Validation failed',
      code: 'VALIDATION_ERROR',
    })
    expect(AuthService.ResetPasswordFromInvitation).not.toHaveBeenCalled()
  })
})
