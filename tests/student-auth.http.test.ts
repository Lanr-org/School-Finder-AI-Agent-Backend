import './setup-env'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import app from '../src/app'
import { createError } from '../src/common/errors/AppError'
import { signStudentAccessToken } from '../src/common/security/studentToken'
import { generateAcessToken } from '../src/common/security/token'
import { hashRefreshToken } from '../src/common/security/tokenHash'
import { verifyGoogleIdToken } from '../src/integrations/google/googleIdToken'
import StudentAuthRepo from '../src/modules/studentAuth/studentAuth.repository'

vi.mock('../src/integrations/google/googleIdToken', () => ({ verifyGoogleIdToken: vi.fn() }))

vi.mock('../src/modules/studentAuth/studentAuth.repository', () => ({
  default: {
    findSessionById: vi.fn(),
    findIdentity: vi.fn(),
    touchIdentityLogin: vi.fn(),
    registerGoogleStudent: vi.fn(),
    createSession: vi.fn(),
    findSessionByTokenHash: vi.fn(),
    rotateSession: vi.fn(),
    revokeSessionByTokenHash: vi.fn(),
    findStudentById: vi.fn(),
  },
}))

// Staff middleware looks up users/sessions; a student token must fail before that matters.
vi.mock('../src/modules/auth/auth.repository', () => ({
  default: { findUser: vi.fn(), findAuthSessionById: vi.fn() },
}))

const repo = vi.mocked(StudentAuthRepo)
const verifyGoogle = vi.mocked(verifyGoogleIdToken)

const COOKIE = 'smetase_student_rt'
const refreshToken = 'a'.repeat(128)
const future = () => new Date(Date.now() + 60_000)

const student = {
  id: 'student-uuid',
  public_id: 'STU-1234',
  contact: { first_name: 'Tobi', last_name: 'Adeyemi', email: 'tobi@example.com' },
  identities: [{ email: 'tobi@example.com' }],
} as never

const profile = { subject: 'google-sub-1', email: 'tobi@example.com', givenName: 'Tobi', familyName: 'Adeyemi' }

const setCookieHeader = (res: request.Response) => {
  const header = res.headers['set-cookie'] as unknown as string[] | undefined
  return header?.find((cookie) => cookie.startsWith(`${COOKIE}=`)) ?? ''
}

beforeEach(() => {
  vi.clearAllMocks()
  repo.createSession.mockResolvedValue({ id: 'session-uuid' } as never)
})

describe('POST /api/v1/student/auth/google', () => {
  it('creates a new student on first sign-in and sets the refresh cookie', async () => {
    verifyGoogle.mockResolvedValue(profile)
    repo.findIdentity.mockResolvedValue(null)
    repo.registerGoogleStudent.mockResolvedValue(student)

    const res = await request(app).post('/api/v1/student/auth/google').send({ credential: 'google-id-token' })

    expect(res.status).toBe(200)
    expect(res.body.data).toMatchObject({
      isNewStudent: true,
      student: { publicId: 'STU-1234', firstName: 'Tobi', fullName: 'Tobi Adeyemi', email: 'tobi@example.com' },
    })
    expect(typeof res.body.data.accessToken).toBe('string')
    expect(repo.registerGoogleStudent).toHaveBeenCalledWith(
      expect.objectContaining({ subject: 'google-sub-1', email: 'tobi@example.com', publicId: expect.stringMatching(/^STU-/) }),
    )
    const cookie = setCookieHeader(res)
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('Path=/api/v1/student/auth')
    expect(cookie).toContain('SameSite=Strict')
  })

  it('signs a returning student into the same record', async () => {
    verifyGoogle.mockResolvedValue(profile)
    repo.findIdentity.mockResolvedValue({ id: 'identity-uuid', student } as never)

    const res = await request(app).post('/api/v1/student/auth/google').send({ credential: 'google-id-token' })

    expect(res.status).toBe(200)
    expect(res.body.data.isNewStudent).toBe(false)
    expect(repo.registerGoogleStudent).not.toHaveBeenCalled()
    expect(repo.touchIdentityLogin).toHaveBeenCalledWith('identity-uuid')
  })

  it('rejects an unverified Google email', async () => {
    verifyGoogle.mockRejectedValue(
      createError('Your Google account email is not verified', 401, {}, 'GOOGLE_EMAIL_NOT_VERIFIED'),
    )

    const res = await request(app).post('/api/v1/student/auth/google').send({ credential: 'google-id-token' })

    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('GOOGLE_EMAIL_NOT_VERIFIED')
    expect(repo.createSession).not.toHaveBeenCalled()
  })

  it('requires a credential', async () => {
    const res = await request(app).post('/api/v1/student/auth/google').send({})
    expect(res.status).toBe(400)
    expect(verifyGoogle).not.toHaveBeenCalled()
  })
})

describe('POST /api/v1/student/auth/refresh', () => {
  it('rotates the refresh token and returns a new access token', async () => {
    repo.findSessionByTokenHash.mockResolvedValue({
      id: 'session-uuid',
      student_id: 'student-uuid',
      revoked_at: null,
      expires_at: future(),
      student,
    } as never)

    const res = await request(app).post('/api/v1/student/auth/refresh').set('Cookie', `${COOKIE}=${refreshToken}`)

    expect(res.status).toBe(200)
    expect(res.body.data.student.publicId).toBe('STU-1234')
    expect(repo.findSessionByTokenHash).toHaveBeenCalledWith(hashRefreshToken(refreshToken))
    const [, newHash] = repo.rotateSession.mock.calls[0] ?? []
    expect(newHash).not.toBe(hashRefreshToken(refreshToken))
    expect(setCookieHeader(res)).not.toContain(`${COOKIE}=${refreshToken}`)
  })

  it('requires the refresh cookie', async () => {
    const res = await request(app).post('/api/v1/student/auth/refresh')
    expect(res.status).toBe(400)
  })

  it('rejects a revoked session and clears the cookie', async () => {
    repo.findSessionByTokenHash.mockResolvedValue({
      id: 'session-uuid',
      student_id: 'student-uuid',
      revoked_at: new Date(),
      expires_at: future(),
      student,
    } as never)

    const res = await request(app).post('/api/v1/student/auth/refresh').set('Cookie', `${COOKIE}=${refreshToken}`)

    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('AUTH_SESSION_NOT_FOUND')
    expect(setCookieHeader(res)).toMatch(/Expires=Thu, 01 Jan 1970/)
    expect(repo.rotateSession).not.toHaveBeenCalled()
  })
})

describe('POST /api/v1/student/auth/logout', () => {
  it('revokes the session and clears the cookie', async () => {
    const res = await request(app).post('/api/v1/student/auth/logout').set('Cookie', `${COOKIE}=${refreshToken}`)

    expect(res.status).toBe(200)
    expect(repo.revokeSessionByTokenHash).toHaveBeenCalledWith(hashRefreshToken(refreshToken))
    expect(setCookieHeader(res)).toMatch(/Expires=Thu, 01 Jan 1970/)
  })

  it('succeeds without a cookie', async () => {
    const res = await request(app).post('/api/v1/student/auth/logout')
    expect(res.status).toBe(200)
    expect(repo.revokeSessionByTokenHash).not.toHaveBeenCalled()
  })
})

describe('student and staff tokens stay separate', () => {
  it('GET /student/me works with a student token', async () => {
    repo.findSessionById.mockResolvedValue({
      id: 'session-uuid',
      student_id: 'student-uuid',
      revoked_at: null,
      expires_at: future(),
    } as never)
    repo.findStudentById.mockResolvedValue(student)

    const res = await request(app)
      .get('/api/v1/student/me')
      .set('Authorization', `Bearer ${signStudentAccessToken('student-uuid', 'session-uuid')}`)

    expect(res.status).toBe(200)
    expect(res.body.data.publicId).toBe('STU-1234')
  })

  it('GET /student/me rejects a revoked session', async () => {
    repo.findSessionById.mockResolvedValue({
      id: 'session-uuid',
      student_id: 'student-uuid',
      revoked_at: new Date(),
      expires_at: future(),
    } as never)

    const res = await request(app)
      .get('/api/v1/student/me')
      .set('Authorization', `Bearer ${signStudentAccessToken('student-uuid', 'session-uuid')}`)

    expect(res.status).toBe(401)
  })

  it('GET /student/me rejects a staff token', async () => {
    const res = await request(app)
      .get('/api/v1/student/me')
      .set('Authorization', `Bearer ${generateAcessToken('user-uuid', 'session-uuid', 'ADMIN', 0)}`)

    expect(res.status).toBe(401)
    expect(repo.findSessionById).not.toHaveBeenCalled()
  })

  it('a staff route rejects a student token', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${signStudentAccessToken('student-uuid', 'session-uuid')}`)

    expect(res.status).toBe(401)
  })
})

describe('CORS', () => {
  it('allows the student app origin', async () => {
    const res = await request(app).post('/api/v1/student/auth/logout').set('Origin', 'http://localhost:5174')
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5174')
    expect(res.headers['access-control-allow-credentials']).toBe('true')
  })

  it('does not allow an unknown origin', async () => {
    const res = await request(app).post('/api/v1/student/auth/logout').set('Origin', 'https://evil.example')
    expect(res.headers['access-control-allow-origin']).toBeUndefined()
  })
})
