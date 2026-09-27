import './setup-env'
import jwt from 'jsonwebtoken'
import { describe, expect, it } from 'vitest'
import env from '../src/config/env'
import { signStudentAccessToken, verifyStudentAccessToken } from '../src/common/security/studentToken'
import { decodeAcessToken, generateAcessToken } from '../src/common/security/token'

const codeOf = (fn: () => unknown) => {
  try {
    fn()
  } catch (error) {
    return (error as { code?: string }).code
  }
  return 'NO_ERROR'
}

describe('student access tokens', () => {
  it('round-trips the student and session ids', () => {
    const token = signStudentAccessToken('student-1', 'session-1')
    expect(verifyStudentAccessToken(token)).toEqual({ sub: 'student-1', sid: 'session-1' })
  })

  it('rejects a token signed with another secret', () => {
    const token = jwt.sign({ sid: 's' }, 'some-other-secret-that-is-long-enough', {
      subject: 'student-1',
      audience: 'smetase-student',
    })
    expect(codeOf(() => verifyStudentAccessToken(token))).toBe('ACCESS_TOKEN_INVALID')
  })

  it('rejects a token with the wrong audience', () => {
    const token = jwt.sign({ sid: 's' }, env.studentJwtSecret, { subject: 'student-1', audience: 'someone-else' })
    expect(codeOf(() => verifyStudentAccessToken(token))).toBe('ACCESS_TOKEN_INVALID')
  })

  it('reports an expired token as expired', () => {
    const token = jwt.sign({ sid: 's' }, env.studentJwtSecret, {
      subject: 'student-1',
      audience: 'smetase-student',
      expiresIn: -10,
    })
    expect(codeOf(() => verifyStudentAccessToken(token))).toBe('ACCESS_TOKEN_EXPIRED')
  })

  it('rejects a staff token', () => {
    const staffToken = generateAcessToken('user-1', 'session-1', 'ADMIN', 0)
    expect(codeOf(() => verifyStudentAccessToken(staffToken))).toBe('ACCESS_TOKEN_INVALID')
  })

  it('is rejected by staff token verification', () => {
    const studentToken = signStudentAccessToken('student-1', 'session-1')
    expect(codeOf(() => decodeAcessToken(studentToken))).toBe('ACCESS_TOKEN_INVALID')
  })
})
