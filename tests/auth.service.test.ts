import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AUTH_ERROR_CODES } from '../src/common/errors/errorCodes'
import { hashPassword, verifyPassword } from '../src/common/security/password'
import {
  generateOpaqueToken,
  hashOpaqueToken,
} from '../src/common/security/opaqueToken'
import {
  generateAcessToken,
  generateRefreshToken,
} from '../src/common/security/token'
import { hashRefreshToken } from '../src/common/security/tokenHash'
import EmailProvider from '../src/integrations/email/email.provider'
import AuthRepo from '../src/modules/auth/auth.repository'
import TeamRepo from '../src/modules/team/team.repository'
import AuthService from '../src/modules/auth/auth.service'

vi.mock('../src/modules/auth/auth.repository', () => ({
  default: {
    findUser: vi.fn(),
    createAuthSession: vi.fn(),
    updateLastLogin: vi.fn(),
    findAuthSession: vi.fn(),
    rotateRefreshToken: vi.fn(),
    revokeAuthSession: vi.fn(),
    revokeAuthSessionFamily: vi.fn(),
    findAuthSessionById: vi.fn(),
    updateUserDetails: vi.fn(),
    changePasswordAndRotateSessions: vi.fn(),
    createPasswordResetToken: vi.fn(),
    findPasswordResetTokenByHash: vi.fn(),
    resetPasswordAndRevokeSessions: vi.fn(),
    UpdateInvitationAndUserPassword: vi.fn(),
  },
}))

vi.mock('../src/modules/team/team.repository', () => ({
  default: {
    FindTeamInvitation: vi.fn(),
  },
}))

vi.mock('../src/common/security/opaqueToken', () => ({
  generateOpaqueToken: vi.fn(),
  hashOpaqueToken: vi.fn(),
}))

vi.mock('../src/common/security/password', () => ({
  hashPassword: vi.fn(),
  verifyPassword: vi.fn(),
}))

vi.mock('../src/common/security/token', () => ({
  generateAcessToken: vi.fn(),
  generateRefreshToken: vi.fn(),
}))

vi.mock('../src/common/security/tokenHash', () => ({
  hashRefreshToken: vi.fn(),
}))

vi.mock('../src/integrations/email/email.provider', () => ({
  default: {
    send: vi.fn(),
  },
}))

vi.mock('../src/config/logger', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
  },
  httpLogger: vi.fn((_req, _res, next: () => void) => next()),
}))

const authRepoMock = vi.mocked(AuthRepo)
const teamRepoMock = vi.mocked(TeamRepo)
const generateOpaqueTokenMock = vi.mocked(generateOpaqueToken)
const hashOpaqueTokenMock = vi.mocked(hashOpaqueToken)
const hashPasswordMock = vi.mocked(hashPassword)
const verifyPasswordMock = vi.mocked(verifyPassword)
const generateAcessTokenMock = vi.mocked(generateAcessToken)
const generateRefreshTokenMock = vi.mocked(generateRefreshToken)
const hashRefreshTokenMock = vi.mocked(hashRefreshToken)
const emailProviderMock = vi.mocked(EmailProvider)

const activeUser = {
  id: '78bd6894-d3d7-405b-9443-17d376b50db1',
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
  user_id: activeUser.id,
  refresh_token_hash: 'hashed-refresh-token',
  token_family: 'token-family-id',
  user_agent: 'vitest-agent',
  ip_address: '127.0.0.1',
  expires_at: new Date('2026-07-01T00:00:00.000Z'),
  revoked_at: null,
  last_used_at: null,
  created_at: new Date('2026-06-01T00:00:00.000Z'),
} as const

describe('AuthService.Login', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authRepoMock.findUser.mockResolvedValue(activeUser)
    authRepoMock.createAuthSession.mockResolvedValue({
      id: 'session-id',
      expires_at: new Date('2026-07-01T00:00:00.000Z'),
    })
    authRepoMock.updateLastLogin.mockResolvedValue(undefined)
    authRepoMock.findAuthSession.mockResolvedValue(activeSession)
    authRepoMock.rotateRefreshToken.mockResolvedValue({
      ...activeSession,
      refresh_token_hash: 'new-hashed-refresh-token',
      last_used_at: new Date('2026-06-15T00:00:00.000Z'),
    })
    authRepoMock.revokeAuthSession.mockResolvedValue(undefined)
    authRepoMock.revokeAuthSessionFamily.mockResolvedValue(undefined)
    verifyPasswordMock.mockResolvedValue(true)
    generateRefreshTokenMock.mockReturnValue('raw-refresh-token')
    hashRefreshTokenMock.mockReturnValue('hashed-refresh-token')
    generateAcessTokenMock.mockReturnValue('access-token')
  })

  it('stores only the hashed refresh token and returns the raw refresh token for the cookie', async () => {
    const result = await AuthService.Login({
      email: 'admin@example.com',
      password: 'correct-password',
      userAgent: 'vitest-agent',
      ipAddress: '127.0.0.1',
    })

    expect(hashRefreshTokenMock).toHaveBeenCalledWith('raw-refresh-token')
    expect(authRepoMock.createAuthSession).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: activeUser.id,
        refreshTokenHash: 'hashed-refresh-token',
        userAgent: 'vitest-agent',
        ipAddress: '127.0.0.1',
      }),
    )
    expect(result.refreshToken).toBe('raw-refresh-token')
    expect(result.data).toEqual({
      accessToken: 'access-token',
      user: {
        publicId: 'usr_123',
        fullName: 'Admin User',
        email: 'admin@example.com',
        role: 'ADMIN',
        status: 'ACTIVE',
      },
    })
    expect(authRepoMock.updateLastLogin).toHaveBeenCalledWith(activeUser.id)
  })

  it('rejects unknown users with a generic credentials error', async () => {
    authRepoMock.findUser.mockResolvedValue(null)

    await expect(
      AuthService.Login({
        email: 'missing@example.com',
        password: 'correct-password',
        userAgent: '',
        ipAddress: '',
      }),
    ).rejects.toMatchObject({
      statusCode: 401,
      code: AUTH_ERROR_CODES.INVALID_CREDENTIALS,
      message: 'Invalid email or password',
    })
  })

  it('rejects invalid passwords with a generic credentials error', async () => {
    verifyPasswordMock.mockResolvedValue(false)

    await expect(
      AuthService.Login({
        email: 'admin@example.com',
        password: 'wrong-password',
        userAgent: '',
        ipAddress: '',
      }),
    ).rejects.toMatchObject({
      statusCode: 401,
      code: AUTH_ERROR_CODES.INVALID_CREDENTIALS,
      message: 'Invalid email or password',
    })
  })

  it('rejects inactive accounts', async () => {
    authRepoMock.findUser.mockResolvedValue({
      ...activeUser,
      status: 'DISABLED',
    })

    await expect(
      AuthService.Login({
        email: 'admin@example.com',
        password: 'correct-password',
        userAgent: '',
        ipAddress: '',
      }),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: AUTH_ERROR_CODES.ACCOUNT_DISABLED,
    })
  })
})

describe('AuthService.Refresh', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T00:00:00.000Z'))

    authRepoMock.findAuthSession.mockResolvedValue(activeSession)
    authRepoMock.findUser.mockResolvedValue(activeUser)
    authRepoMock.rotateRefreshToken.mockResolvedValue({
      ...activeSession,
      refresh_token_hash: 'new-hashed-refresh-token',
      last_used_at: new Date('2026-06-15T00:00:00.000Z'),
    })
    authRepoMock.revokeAuthSession.mockResolvedValue(undefined)
    authRepoMock.revokeAuthSessionFamily.mockResolvedValue(undefined)
    hashRefreshTokenMock
      .mockReturnValueOnce('hashed-refresh-token')
      .mockReturnValueOnce('new-hashed-refresh-token')
    generateRefreshTokenMock.mockReturnValue('new-raw-refresh-token')
    generateAcessTokenMock.mockReturnValue('new-access-token')
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('rotates the refresh token and returns a new access token', async () => {
    const result = await AuthService.Refresh({
      refreshToken: 'raw-refresh-token',
      ipAddress: '127.0.0.1',
      userAgent: 'vitest-agent',
    })

    expect(hashRefreshTokenMock).toHaveBeenNthCalledWith(1, 'raw-refresh-token')
    expect(authRepoMock.findAuthSession).toHaveBeenCalledWith(
      'hashed-refresh-token',
    )
    expect(generateAcessTokenMock).toHaveBeenCalledWith(
      activeUser.id,
      activeSession.id,
      activeUser.role,
      activeUser.token_version,
    )
    expect(authRepoMock.rotateRefreshToken).toHaveBeenCalledWith({
      authSessionId: activeSession.id,
      lastUsedAt: new Date('2026-06-15T00:00:00.000Z'),
      hashedRefreshToken: 'new-hashed-refresh-token',
    })
    expect(result).toEqual({
      newRefreshToken: 'new-raw-refresh-token',
      accessToken: 'new-access-token',
    })
  })

  it('rejects an unknown refresh token', async () => {
    authRepoMock.findAuthSession.mockResolvedValue(null)

    await expect(
      AuthService.Refresh({
        refreshToken: 'missing-token',
        ipAddress: '127.0.0.1',
        userAgent: 'vitest-agent',
      }),
    ).rejects.toMatchObject({
      statusCode: 401,
      code: AUTH_ERROR_CODES.AUTH_SESSION_NOT_FOUND,
    })
    expect(authRepoMock.rotateRefreshToken).not.toHaveBeenCalled()
  })

  it('rejects expired sessions', async () => {
    authRepoMock.findAuthSession.mockResolvedValue({
      ...activeSession,
      expires_at: new Date('2026-06-01T00:00:00.000Z'),
    })

    await expect(
      AuthService.Refresh({
        refreshToken: 'raw-refresh-token',
        ipAddress: '127.0.0.1',
        userAgent: 'vitest-agent',
      }),
    ).rejects.toMatchObject({
      statusCode: 401,
      code: AUTH_ERROR_CODES.AUTH_SESSION_EXPIRED,
    })
    expect(authRepoMock.revokeAuthSession).toHaveBeenCalledWith(
      activeSession.id,
    )
  })

  it('rejects revoked sessions', async () => {
    authRepoMock.findAuthSession.mockResolvedValue({
      ...activeSession,
      revoked_at: new Date('2026-06-10T00:00:00.000Z'),
    })

    await expect(
      AuthService.Refresh({
        refreshToken: 'raw-refresh-token',
        ipAddress: '127.0.0.1',
        userAgent: 'vitest-agent',
      }),
    ).rejects.toMatchObject({
      statusCode: 401,
      code: AUTH_ERROR_CODES.AUTH_SESSION_REVOKED,
    })
    expect(authRepoMock.revokeAuthSessionFamily).not.toHaveBeenCalled()
  })

  it('rejects inactive users', async () => {
    authRepoMock.findUser.mockResolvedValue({
      ...activeUser,
      status: 'DISABLED',
    })

    await expect(
      AuthService.Refresh({
        refreshToken: 'raw-refresh-token',
        ipAddress: '127.0.0.1',
        userAgent: 'vitest-agent',
      }),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: AUTH_ERROR_CODES.ACCOUNT_DISABLED,
    })
  })

  it('rejects session fingerprint mismatch', async () => {
    await expect(
      AuthService.Refresh({
        refreshToken: 'raw-refresh-token',
        ipAddress: '127.0.0.1',
        userAgent: 'different-agent',
      }),
    ).rejects.toMatchObject({
      statusCode: 401,
      code: AUTH_ERROR_CODES.AUTH_SESSION_DEVICE_MISMATCH,
    })
    expect(authRepoMock.revokeAuthSession).toHaveBeenCalledWith(
      activeSession.id,
    )
  })
})

describe('AuthService.Logout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hashRefreshTokenMock.mockReset()
    authRepoMock.findAuthSession.mockResolvedValue(activeSession)
    authRepoMock.revokeAuthSession.mockResolvedValue(undefined)
    hashRefreshTokenMock.mockReturnValue('hashed-refresh-token')
  })

  it('revokes the current refresh-token session', async () => {
    await AuthService.Logout({
      sub: activeUser.id,
      session_Id: activeSession.id,
      role: activeUser.role,
      token_version: activeUser.token_version,
      refreshToken: 'raw-refresh-token',
    })

    expect(hashRefreshTokenMock).toHaveBeenCalledWith('raw-refresh-token')
    expect(authRepoMock.findAuthSession).toHaveBeenCalledWith(
      'hashed-refresh-token',
    )
    expect(authRepoMock.revokeAuthSession).toHaveBeenCalledWith(
      activeSession.id,
    )
  })

  it('rejects missing refresh-token sessions', async () => {
    authRepoMock.findAuthSession.mockResolvedValue(null)

    await expect(
      AuthService.Logout({
        sub: activeUser.id,
        session_Id: activeSession.id,
        role: activeUser.role,
        token_version: activeUser.token_version,
        refreshToken: 'raw-refresh-token',
      }),
    ).rejects.toMatchObject({
      statusCode: 401,
      code: AUTH_ERROR_CODES.AUTH_SESSION_NOT_FOUND,
    })
    expect(authRepoMock.revokeAuthSession).not.toHaveBeenCalled()
  })

  it('rejects refresh sessions that do not match the access token', async () => {
    await expect(
      AuthService.Logout({
        sub: activeUser.id,
        session_Id: 'different-session-id',
        role: activeUser.role,
        token_version: activeUser.token_version,
        refreshToken: 'raw-refresh-token',
      }),
    ).rejects.toMatchObject({
      statusCode: 401,
      code: AUTH_ERROR_CODES.AUTH_SESSION_DEVICE_MISMATCH,
    })
    expect(authRepoMock.revokeAuthSession).not.toHaveBeenCalled()
  })
})

describe('AuthService.LogoutAll', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hashRefreshTokenMock.mockReset()
    authRepoMock.findAuthSession.mockResolvedValue(activeSession)
    authRepoMock.revokeAuthSessionFamily.mockResolvedValue(undefined)
    hashRefreshTokenMock.mockReturnValue('hashed-refresh-token')
  })

  it('revokes all active sessions for the authenticated user', async () => {
    await AuthService.LogoutAll({
      sub: activeUser.id,
      session_Id: activeSession.id,
      role: activeUser.role,
      token_version: activeUser.token_version,
      refreshToken: 'raw-refresh-token',
    })

    expect(authRepoMock.revokeAuthSessionFamily).toHaveBeenCalledWith(
      activeUser.id,
    )
  })

  it('rejects refresh sessions owned by another user', async () => {
    await expect(
      AuthService.LogoutAll({
        sub: 'different-user-id',
        session_Id: activeSession.id,
        role: activeUser.role,
        token_version: activeUser.token_version,
        refreshToken: 'raw-refresh-token',
      }),
    ).rejects.toMatchObject({
      statusCode: 401,
      code: AUTH_ERROR_CODES.AUTH_SESSION_DEVICE_MISMATCH,
    })
    expect(authRepoMock.revokeAuthSessionFamily).not.toHaveBeenCalled()
  })
})

describe('AuthService.UserDetails', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authRepoMock.findUser.mockResolvedValue(activeUser)
  })

  it('returns the safe authenticated user shape', async () => {
    const result = await AuthService.UserDetails({
      sub: activeUser.id,
      session_Id: activeSession.id,
      role: activeUser.role,
      token_version: activeUser.token_version,
    })

    expect(result).toEqual({
      public_id: activeUser.public_id,
      full_name: activeUser.full_name,
      email: activeUser.email,
      phone: activeUser.phone,
      role: activeUser.role,
      status: activeUser.status,
      last_login_at: activeUser.last_login_at,
      created_at: activeUser.created_at,
      updated_at: activeUser.updated_at,
    })
    expect(result).not.toHaveProperty('password_hash')
    expect(result).not.toHaveProperty('token_version')
  })
})

describe('AuthService.EditUserDetails', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authRepoMock.findUser.mockResolvedValue(activeUser)
    authRepoMock.updateUserDetails.mockResolvedValue({
      ...activeUser,
      full_name: 'Updated Admin',
      phone: '+2348012345678',
      updated_at: new Date('2026-06-20T00:00:00.000Z'),
    })
  })

  it('updates editable profile fields and returns the safe user shape', async () => {
    const result = await AuthService.EditUserDetails(
      {
        sub: activeUser.id,
        session_Id: activeSession.id,
        role: activeUser.role,
        token_version: activeUser.token_version,
      },
      {
        fullName: 'Updated Admin',
        phone: '+2348012345678',
      },
    )

    expect(authRepoMock.findUser).toHaveBeenCalledWith({ id: activeUser.id })
    expect(authRepoMock.updateUserDetails).toHaveBeenCalledWith(activeUser.id, {
      fullName: 'Updated Admin',
      phone: '+2348012345678',
    })
    expect(result).toEqual({
      public_id: activeUser.public_id,
      full_name: 'Updated Admin',
      email: activeUser.email,
      phone: '+2348012345678',
      role: activeUser.role,
      status: activeUser.status,
      last_login_at: activeUser.last_login_at,
      created_at: activeUser.created_at,
      updated_at: new Date('2026-06-20T00:00:00.000Z'),
    })
    expect(result).not.toHaveProperty('password_hash')
    expect(result).not.toHaveProperty('token_version')
  })

  it('rejects missing users', async () => {
    authRepoMock.findUser.mockResolvedValue(null)

    await expect(
      AuthService.EditUserDetails(
        {
          sub: activeUser.id,
          session_Id: activeSession.id,
          role: activeUser.role,
          token_version: activeUser.token_version,
        },
        { fullName: 'Updated Admin' },
      ),
    ).rejects.toMatchObject({
      statusCode: 401,
      code: AUTH_ERROR_CODES.INVALID_CREDENTIALS,
    })
    expect(authRepoMock.updateUserDetails).not.toHaveBeenCalled()
  })
})

describe('AuthService.ChangePassword', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-21T00:00:00.000Z'))

    authRepoMock.findUser.mockResolvedValue(activeUser)
    authRepoMock.changePasswordAndRotateSessions.mockResolvedValue({
      ...activeUser,
      password_hash: 'new-argon-hash',
      token_version: 1,
      password_changed_at: new Date('2026-06-21T00:00:00.000Z'),
      updated_at: new Date('2026-06-21T00:00:00.000Z'),
    })
    verifyPasswordMock.mockResolvedValueOnce(true).mockResolvedValueOnce(false)
    hashPasswordMock.mockResolvedValue('new-argon-hash')
    generateRefreshTokenMock.mockReturnValue('new-raw-refresh-token')
    hashRefreshTokenMock.mockReturnValue('new-hashed-refresh-token')
    generateAcessTokenMock.mockReturnValue('new-access-token')
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('updates the password, revokes other sessions, rotates the current refresh token, and returns a fresh access token', async () => {
    const result = await AuthService.ChangePassword(
      {
        sub: activeUser.id,
        session_Id: activeSession.id,
        role: activeUser.role,
        token_version: activeUser.token_version,
      },
      {
        currentPassword: 'CorrectPass123',
        newPassword: 'NewCorrectPass123',
        confirmNewPassword: 'NewCorrectPass123',
      },
    )

    expect(verifyPasswordMock).toHaveBeenNthCalledWith(
      1,
      activeUser.password_hash,
      'CorrectPass123',
    )
    expect(verifyPasswordMock).toHaveBeenNthCalledWith(
      2,
      activeUser.password_hash,
      'NewCorrectPass123',
    )
    expect(hashPasswordMock).toHaveBeenCalledWith('NewCorrectPass123')
    expect(hashRefreshTokenMock).toHaveBeenCalledWith('new-raw-refresh-token')
    expect(authRepoMock.changePasswordAndRotateSessions).toHaveBeenCalledWith({
      userId: activeUser.id,
      currentSessionId: activeSession.id,
      newPasswordHash: 'new-argon-hash',
      newRefreshTokenHash: 'new-hashed-refresh-token',
      currentTokenVersion: 0,
      changedAt: new Date('2026-06-21T00:00:00.000Z'),
    })
    expect(generateAcessTokenMock).toHaveBeenCalledWith(
      activeUser.id,
      activeSession.id,
      activeUser.role,
      1,
    )
    expect(result).toEqual({
      user: {
        public_id: activeUser.public_id,
        full_name: activeUser.full_name,
        email: activeUser.email,
        phone: activeUser.phone,
        role: activeUser.role,
        status: activeUser.status,
        last_login_at: activeUser.last_login_at,
        created_at: activeUser.created_at,
        updated_at: new Date('2026-06-21T00:00:00.000Z'),
      },
      accessToken: 'new-access-token',
      refreshToken: 'new-raw-refresh-token',
    })
  })

  it('rejects mismatched confirmation before touching password storage', async () => {
    await expect(
      AuthService.ChangePassword(
        {
          sub: activeUser.id,
          session_Id: activeSession.id,
          role: activeUser.role,
          token_version: activeUser.token_version,
        },
        {
          currentPassword: 'CorrectPass123',
          newPassword: 'NewCorrectPass123',
          confirmNewPassword: 'DifferentPass123',
        },
      ),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
    })
    expect(authRepoMock.findUser).not.toHaveBeenCalled()
    expect(authRepoMock.changePasswordAndRotateSessions).not.toHaveBeenCalled()
  })

  it('rejects invalid current passwords with a generic credential error', async () => {
    verifyPasswordMock.mockReset()
    verifyPasswordMock.mockResolvedValue(false)

    await expect(
      AuthService.ChangePassword(
        {
          sub: activeUser.id,
          session_Id: activeSession.id,
          role: activeUser.role,
          token_version: activeUser.token_version,
        },
        {
          currentPassword: 'WrongPass123',
          newPassword: 'NewCorrectPass123',
          confirmNewPassword: 'NewCorrectPass123',
        },
      ),
    ).rejects.toMatchObject({
      statusCode: 401,
      code: AUTH_ERROR_CODES.INVALID_CREDENTIALS,
      message: 'Invalid current password',
    })
    expect(hashPasswordMock).not.toHaveBeenCalled()
    expect(authRepoMock.changePasswordAndRotateSessions).not.toHaveBeenCalled()
  })

  it('rejects reusing the current password', async () => {
    verifyPasswordMock.mockReset()
    verifyPasswordMock.mockResolvedValue(true)

    await expect(
      AuthService.ChangePassword(
        {
          sub: activeUser.id,
          session_Id: activeSession.id,
          role: activeUser.role,
          token_version: activeUser.token_version,
        },
        {
          currentPassword: 'CorrectPass123',
          newPassword: 'CorrectPass123',
          confirmNewPassword: 'CorrectPass123',
        },
      ),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'New password must be different from the current password',
    })
    expect(hashPasswordMock).not.toHaveBeenCalled()
    expect(authRepoMock.changePasswordAndRotateSessions).not.toHaveBeenCalled()
  })
})

describe('AuthService.ForgotPassword', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-22T00:00:00.000Z'))

    authRepoMock.findUser.mockResolvedValue(activeUser)
    authRepoMock.createPasswordResetToken.mockResolvedValue({
      id: 'reset-token-id',
      expires_at: new Date('2026-06-22T01:00:00.000Z'),
    })
    generateOpaqueTokenMock.mockReturnValue('raw-reset-token')
    hashOpaqueTokenMock.mockReturnValue('hashed-reset-token')
    emailProviderMock.send.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('creates a hashed reset token and sends the reset email for active users', async () => {
    await AuthService.ForgotPassword({ email: ' ADMIN@example.com ' })

    expect(authRepoMock.findUser).toHaveBeenCalledWith({
      email: 'admin@example.com',
    })
    expect(generateOpaqueTokenMock).toHaveBeenCalled()
    expect(hashOpaqueTokenMock).toHaveBeenCalledWith('raw-reset-token')
    expect(authRepoMock.createPasswordResetToken).toHaveBeenCalledWith({
      userId: activeUser.id,
      tokenHash: 'hashed-reset-token',
      expiresAt: new Date('2026-06-22T01:00:00.000Z'),
    })
    expect(emailProviderMock.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: activeUser.email,
        subject: 'Reset your School Finder AI password',
        html: expect.stringContaining(
          '/reset-password/raw-reset-token',
        ) as string,
        text: expect.stringContaining(
          '/reset-password/raw-reset-token',
        ) as string,
      }),
    )
  })

  it('does not create a token for unknown users', async () => {
    authRepoMock.findUser.mockResolvedValue(null)

    await AuthService.ForgotPassword({ email: 'missing@example.com' })

    expect(authRepoMock.createPasswordResetToken).not.toHaveBeenCalled()
    expect(emailProviderMock.send).not.toHaveBeenCalled()
  })

  it('does not create a token for inactive users', async () => {
    authRepoMock.findUser.mockResolvedValue({
      ...activeUser,
      status: 'DISABLED',
    })

    await AuthService.ForgotPassword({ email: 'admin@example.com' })

    expect(authRepoMock.createPasswordResetToken).not.toHaveBeenCalled()
    expect(emailProviderMock.send).not.toHaveBeenCalled()
  })

  it('does not expose email delivery failures to the caller', async () => {
    emailProviderMock.send.mockRejectedValue(new Error('smtp unavailable'))

    await expect(
      AuthService.ForgotPassword({ email: 'admin@example.com' }),
    ).resolves.toBeUndefined()

    expect(authRepoMock.createPasswordResetToken).toHaveBeenCalled()
    expect(emailProviderMock.send).toHaveBeenCalled()
  })
})

describe('AuthService.VerifyResetPasswordToken', () => {
  const resetTokenRecord = {
    id: 'reset-token-id',
    user_id: activeUser.id,
    token_hash: 'hashed-reset-token',
    expires_at: new Date('2026-06-22T01:00:00.000Z'),
    used_at: null,
    created_at: new Date('2026-06-22T00:00:00.000Z'),
    user: activeUser,
  } as const

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-22T00:30:00.000Z'))

    hashOpaqueTokenMock.mockReturnValue('hashed-reset-token')
    authRepoMock.findPasswordResetTokenByHash.mockResolvedValue(
      resetTokenRecord,
    )
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('hashes the reset token and returns only minimal public state', async () => {
    const result = await AuthService.VerifyResetPasswordToken('a'.repeat(128))

    expect(hashOpaqueTokenMock).toHaveBeenCalledWith('a'.repeat(128))
    expect(authRepoMock.findPasswordResetTokenByHash).toHaveBeenCalledWith(
      'hashed-reset-token',
    )
    expect(result).toEqual({
      email: activeUser.email,
      fullName: activeUser.full_name,
    })
    expect(result).not.toHaveProperty('id')
    expect(result).not.toHaveProperty('token_hash')
    expect(result).not.toHaveProperty('status')
  })

  it('rejects malformed tokens before hashing', async () => {
    await expect(
      AuthService.VerifyResetPasswordToken('not-a-reset-token'),
    ).rejects.toMatchObject({
      statusCode: 401,
      code: AUTH_ERROR_CODES.TOKEN_INVALID,
    })

    expect(hashOpaqueTokenMock).not.toHaveBeenCalled()
    expect(authRepoMock.findPasswordResetTokenByHash).not.toHaveBeenCalled()
  })

  it('rejects unknown reset tokens', async () => {
    authRepoMock.findPasswordResetTokenByHash.mockResolvedValue(null)

    await expect(
      AuthService.VerifyResetPasswordToken('a'.repeat(128)),
    ).rejects.toMatchObject({
      statusCode: 401,
      code: AUTH_ERROR_CODES.TOKEN_INVALID,
    })
  })

  it('rejects used reset tokens', async () => {
    authRepoMock.findPasswordResetTokenByHash.mockResolvedValue({
      ...resetTokenRecord,
      used_at: new Date('2026-06-22T00:15:00.000Z'),
    })

    await expect(
      AuthService.VerifyResetPasswordToken('a'.repeat(128)),
    ).rejects.toMatchObject({
      statusCode: 401,
      code: AUTH_ERROR_CODES.TOKEN_INVALID,
    })
  })

  it('rejects expired reset tokens', async () => {
    authRepoMock.findPasswordResetTokenByHash.mockResolvedValue({
      ...resetTokenRecord,
      expires_at: new Date('2026-06-22T00:00:00.000Z'),
    })

    await expect(
      AuthService.VerifyResetPasswordToken('a'.repeat(128)),
    ).rejects.toMatchObject({
      statusCode: 401,
      code: AUTH_ERROR_CODES.TOKEN_EXPIRED,
    })
  })

  it('rejects reset tokens for inactive users', async () => {
    authRepoMock.findPasswordResetTokenByHash.mockResolvedValue({
      ...resetTokenRecord,
      user: {
        ...activeUser,
        status: 'DISABLED',
      },
    })

    await expect(
      AuthService.VerifyResetPasswordToken('a'.repeat(128)),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: AUTH_ERROR_CODES.ACCOUNT_DISABLED,
    })
  })
})

describe('AuthService.ResetPassword', () => {
  const resetTokenRecord = {
    id: 'reset-token-id',
    user_id: activeUser.id,
    token_hash: 'hashed-reset-token',
    expires_at: new Date('2026-06-22T01:00:00.000Z'),
    used_at: null,
    created_at: new Date('2026-06-22T00:00:00.000Z'),
    user: activeUser,
  } as const

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-22T00:30:00.000Z'))

    hashOpaqueTokenMock.mockReturnValue('hashed-reset-token')
    authRepoMock.findPasswordResetTokenByHash.mockResolvedValue(
      resetTokenRecord,
    )
    verifyPasswordMock.mockResolvedValue(false)
    hashPasswordMock.mockResolvedValue('new-argon-hash')
    authRepoMock.resetPasswordAndRevokeSessions.mockResolvedValue({
      ...activeUser,
      password_hash: 'new-argon-hash',
      token_version: 1,
      password_changed_at: new Date('2026-06-22T00:30:00.000Z'),
      updated_at: new Date('2026-06-22T00:30:00.000Z'),
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('consumes the reset token, updates the password, and revokes active sessions', async () => {
    await AuthService.ResetPassword('a'.repeat(128), {
      newPassword: 'NewCorrectPass123',
      confirmNewPassword: 'NewCorrectPass123',
    })

    expect(hashOpaqueTokenMock).toHaveBeenCalledWith('a'.repeat(128))
    expect(authRepoMock.findPasswordResetTokenByHash).toHaveBeenCalledWith(
      'hashed-reset-token',
    )
    expect(verifyPasswordMock).toHaveBeenCalledWith(
      activeUser.password_hash,
      'NewCorrectPass123',
    )
    expect(hashPasswordMock).toHaveBeenCalledWith('NewCorrectPass123')
    expect(authRepoMock.resetPasswordAndRevokeSessions).toHaveBeenCalledWith({
      resetTokenId: resetTokenRecord.id,
      userId: activeUser.id,
      newPasswordHash: 'new-argon-hash',
      currentTokenVersion: 0,
      changedAt: new Date('2026-06-22T00:30:00.000Z'),
    })
  })

  it('rejects mismatched confirmation before hashing the token', async () => {
    await expect(
      AuthService.ResetPassword('a'.repeat(128), {
        newPassword: 'NewCorrectPass123',
        confirmNewPassword: 'DifferentPass123',
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
    })

    expect(hashOpaqueTokenMock).not.toHaveBeenCalled()
    expect(authRepoMock.resetPasswordAndRevokeSessions).not.toHaveBeenCalled()
  })

  it('rejects malformed tokens before looking up reset storage', async () => {
    await expect(
      AuthService.ResetPassword('not-a-reset-token', {
        newPassword: 'NewCorrectPass123',
        confirmNewPassword: 'NewCorrectPass123',
      }),
    ).rejects.toMatchObject({
      statusCode: 401,
      code: AUTH_ERROR_CODES.TOKEN_INVALID,
    })

    expect(hashOpaqueTokenMock).not.toHaveBeenCalled()
    expect(authRepoMock.findPasswordResetTokenByHash).not.toHaveBeenCalled()
  })

  it('rejects unknown reset tokens', async () => {
    authRepoMock.findPasswordResetTokenByHash.mockResolvedValue(null)

    await expect(
      AuthService.ResetPassword('a'.repeat(128), {
        newPassword: 'NewCorrectPass123',
        confirmNewPassword: 'NewCorrectPass123',
      }),
    ).rejects.toMatchObject({
      statusCode: 401,
      code: AUTH_ERROR_CODES.TOKEN_INVALID,
    })

    expect(authRepoMock.resetPasswordAndRevokeSessions).not.toHaveBeenCalled()
  })

  it('rejects used reset tokens', async () => {
    authRepoMock.findPasswordResetTokenByHash.mockResolvedValue({
      ...resetTokenRecord,
      used_at: new Date('2026-06-22T00:15:00.000Z'),
    })

    await expect(
      AuthService.ResetPassword('a'.repeat(128), {
        newPassword: 'NewCorrectPass123',
        confirmNewPassword: 'NewCorrectPass123',
      }),
    ).rejects.toMatchObject({
      statusCode: 401,
      code: AUTH_ERROR_CODES.TOKEN_INVALID,
    })

    expect(authRepoMock.resetPasswordAndRevokeSessions).not.toHaveBeenCalled()
  })

  it('rejects expired reset tokens', async () => {
    authRepoMock.findPasswordResetTokenByHash.mockResolvedValue({
      ...resetTokenRecord,
      expires_at: new Date('2026-06-22T00:00:00.000Z'),
    })

    await expect(
      AuthService.ResetPassword('a'.repeat(128), {
        newPassword: 'NewCorrectPass123',
        confirmNewPassword: 'NewCorrectPass123',
      }),
    ).rejects.toMatchObject({
      statusCode: 401,
      code: AUTH_ERROR_CODES.TOKEN_EXPIRED,
    })

    expect(authRepoMock.resetPasswordAndRevokeSessions).not.toHaveBeenCalled()
  })

  it('rejects reset tokens for inactive users', async () => {
    authRepoMock.findPasswordResetTokenByHash.mockResolvedValue({
      ...resetTokenRecord,
      user: {
        ...activeUser,
        status: 'DISABLED',
      },
    })

    await expect(
      AuthService.ResetPassword('a'.repeat(128), {
        newPassword: 'NewCorrectPass123',
        confirmNewPassword: 'NewCorrectPass123',
      }),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: AUTH_ERROR_CODES.ACCOUNT_DISABLED,
    })

    expect(authRepoMock.resetPasswordAndRevokeSessions).not.toHaveBeenCalled()
  })

  it('rejects reusing the current password', async () => {
    verifyPasswordMock.mockResolvedValue(true)

    await expect(
      AuthService.ResetPassword('a'.repeat(128), {
        newPassword: 'CorrectPass123',
        confirmNewPassword: 'CorrectPass123',
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'New password must be different from the current password',
    })

    expect(hashPasswordMock).not.toHaveBeenCalled()
    expect(authRepoMock.resetPasswordAndRevokeSessions).not.toHaveBeenCalled()
  })
})

describe('AuthService.VerifyInvitationToken', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const invitationRecord = {
    id: 'invite-uuid',
    user_id: 'user-uuid',
    invited_by_user_id: 'admin-uuid',
    token_hash: 'a'.repeat(64),
    expires_at: new Date(Date.now() + 3600 * 1000),
    accepted_at: null,
    canceled_at: null,
    sent_at: new Date(),
    last_sent_at: new Date(),
    send_count: 1,
    user: {
      full_name: 'Bob Invited',
      email: 'bob@example.com',
    },
  }

  it('verifies a valid invitation token and returns full name and email', async () => {
    hashOpaqueTokenMock.mockReturnValue('a'.repeat(64))
    teamRepoMock.FindTeamInvitation.mockResolvedValue(
      invitationRecord as unknown as Awaited<
        ReturnType<typeof TeamRepo.FindTeamInvitation>
      >,
    )

    const result = await AuthService.VerifyInvitationToken('a'.repeat(128))

    expect(result).toEqual({
      fullName: 'Bob Invited',
      email: 'bob@example.com',
    })
    expect(hashOpaqueTokenMock).toHaveBeenCalledWith('a'.repeat(128))
    expect(teamRepoMock.FindTeamInvitation).toHaveBeenCalledWith({
      token_hash: 'a'.repeat(64),
    })
  })

  it('rejects invalid or non-hex tokens', async () => {
    await expect(
      AuthService.VerifyInvitationToken('invalid-token'),
    ).rejects.toMatchObject({
      statusCode: 401,
      code: AUTH_ERROR_CODES.TOKEN_INVALID,
    })
  })

  it('rejects missing or already accepted/canceled invitations', async () => {
    hashOpaqueTokenMock.mockReturnValue('a'.repeat(64))
    teamRepoMock.FindTeamInvitation.mockResolvedValue(null)

    await expect(
      AuthService.VerifyInvitationToken('a'.repeat(128)),
    ).rejects.toMatchObject({
      statusCode: 401,
      code: AUTH_ERROR_CODES.TOKEN_INVALID,
    })

    teamRepoMock.FindTeamInvitation.mockResolvedValue({
      ...invitationRecord,
      accepted_at: new Date(),
    } as unknown as Awaited<ReturnType<typeof TeamRepo.FindTeamInvitation>>)

    await expect(
      AuthService.VerifyInvitationToken('a'.repeat(128)),
    ).rejects.toMatchObject({
      statusCode: 401,
      code: AUTH_ERROR_CODES.TOKEN_INVALID,
    })
  })

  it('rejects expired invitation tokens', async () => {
    hashOpaqueTokenMock.mockReturnValue('a'.repeat(64))
    teamRepoMock.FindTeamInvitation.mockResolvedValue({
      ...invitationRecord,
      expires_at: new Date(Date.now() - 1000),
    } as unknown as Awaited<ReturnType<typeof TeamRepo.FindTeamInvitation>>)

    await expect(
      AuthService.VerifyInvitationToken('a'.repeat(128)),
    ).rejects.toMatchObject({
      statusCode: 401,
      code: AUTH_ERROR_CODES.TOKEN_EXPIRED,
    })
  })
})

describe('AuthService.ResetPasswordFromInvitation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const invitationRecord = {
    id: 'invite-uuid',
    user_id: 'user-uuid',
    invited_by_user_id: 'admin-uuid',
    token_hash: 'a'.repeat(64),
    expires_at: new Date(Date.now() + 3600 * 1000),
    accepted_at: null,
    canceled_at: null,
    sent_at: new Date(),
    last_sent_at: new Date(),
    send_count: 1,
    user: {
      full_name: 'Bob Invited',
      email: 'bob@example.com',
    },
  }

  it('successfully sets password from invitation and updates status to ACTIVE', async () => {
    hashOpaqueTokenMock.mockReturnValue('a'.repeat(64))
    teamRepoMock.FindTeamInvitation.mockResolvedValue(
      invitationRecord as unknown as Awaited<
        ReturnType<typeof TeamRepo.FindTeamInvitation>
      >,
    )
    hashPasswordMock.mockResolvedValue('hashed-new-password')
    authRepoMock.UpdateInvitationAndUserPassword.mockResolvedValue(undefined)

    await AuthService.ResetPasswordFromInvitation('a'.repeat(128), {
      newPassword: 'NewCorrectPass123',
      confirmNewPassword: 'NewCorrectPass123',
    })

    expect(hashPasswordMock).toHaveBeenCalledWith('NewCorrectPass123')
    expect(authRepoMock.UpdateInvitationAndUserPassword).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-uuid',
        newPasswordHash: 'hashed-new-password',
        invitationId: 'invite-uuid',
      }),
    )
  })

  it('rejects password confirm mismatch', async () => {
    await expect(
      AuthService.ResetPasswordFromInvitation('a'.repeat(128), {
        newPassword: 'NewCorrectPass123',
        confirmNewPassword: 'MismatchNewPassword',
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'Passwords do not match',
    })
  })
})
