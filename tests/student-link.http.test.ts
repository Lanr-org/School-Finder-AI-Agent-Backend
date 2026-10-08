import './setup-env'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import app from '../src/app'
import { signStudentAccessToken } from '../src/common/security/studentToken'
import { generateAcessToken } from '../src/common/security/token'
import env from '../src/config/env'
import StudentAuthRepo from '../src/modules/studentAuth/studentAuth.repository'
import StudentLinkRepo from '../src/modules/studentLink/studentLink.repository'

vi.mock('../src/modules/studentAuth/studentAuth.repository', () => ({
  default: { findSessionById: vi.fn() },
}))
vi.mock('../src/modules/studentLink/studentLink.repository', () => ({
  default: { createToken: vi.fn() },
}))

const STUDENT_ID = 'student-uuid'
const auth = (req: request.Test) =>
  req.set('Authorization', `Bearer ${signStudentAccessToken(STUDENT_ID, 'session-uuid')}`)

beforeEach(() => {
  vi.clearAllMocks()
  env.telegramBotUsername = 'SmetaseBot'
  vi.mocked(StudentAuthRepo).findSessionById.mockResolvedValue({
    id: 'session-uuid',
    student_id: STUDENT_ID,
    revoked_at: null,
    expires_at: new Date(Date.now() + 60_000),
  } as never)
  vi.mocked(StudentLinkRepo).createToken.mockResolvedValue({ expires_at: new Date('2026-09-28T12:15:00Z') } as never)
})

describe('POST /api/v1/student/telegram-link', () => {
  it("returns a t.me link for the signed-in student", async () => {
    const res = await auth(request(app).post('/api/v1/student/telegram-link'))

    expect(res.status).toBe(201)
    expect(res.body.data.url).toMatch(/^https:\/\/t\.me\/SmetaseBot\?start=link_[A-Za-z0-9_-]{43}$/)
    expect(res.body.data.expiresAt).toBe('2026-09-28T12:15:00.000Z')
    expect(StudentLinkRepo.createToken).toHaveBeenCalledWith(STUDENT_ID, expect.any(String), 'TELEGRAM')
  })

  it('returns 500 when the bot username is not configured', async () => {
    env.telegramBotUsername = undefined
    const res = await auth(request(app).post('/api/v1/student/telegram-link'))
    expect(res.status).toBe(500)
  })

  it('needs a student token', async () => {
    const res = await request(app).post('/api/v1/student/telegram-link')
    expect(res.status).toBe(401)
  })

  it('rejects a staff token', async () => {
    const staff = generateAcessToken('user-uuid', 'session-uuid', 'ADMIN', 0)
    const res = await request(app).post('/api/v1/student/telegram-link').set('Authorization', `Bearer ${staff}`)
    expect(res.status).toBe(401)
    expect(StudentLinkRepo.createToken).not.toHaveBeenCalled()
  })
})
