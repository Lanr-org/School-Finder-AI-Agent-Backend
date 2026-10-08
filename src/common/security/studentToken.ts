import jwt from 'jsonwebtoken'
import env from '../../config/env'
import { createError } from '../errors/AppError'
import { AUTH_ERROR_CODES } from '../errors/errorCodes'

// Own secret + audience + pinned algorithm: staff and student tokens can't be swapped.
const AUDIENCE = 'smetase-student'
const ALGORITHM = 'HS256'

export type StudentAccessClaims = { sub: string; sid: string }

export const signStudentAccessToken = (studentId: string, sessionId: string): string =>
  jwt.sign({ sid: sessionId }, env.studentJwtSecret, {
    subject: studentId,
    audience: AUDIENCE,
    algorithm: ALGORITHM,
    expiresIn: '15m',
  })

export const verifyStudentAccessToken = (token: string): StudentAccessClaims => {
  try {
    const payload = jwt.verify(token, env.studentJwtSecret, {
      audience: AUDIENCE,
      algorithms: [ALGORITHM],
    })
    if (typeof payload === 'string' || typeof payload.sub !== 'string' || typeof payload.sid !== 'string') {
      throw new Error('Unexpected student token claims')
    }
    return { sub: payload.sub, sid: payload.sid }
  } catch (error) {
    throw createError(
      'Unable to authenticate student',
      401,
      {},
      error instanceof jwt.TokenExpiredError
        ? AUTH_ERROR_CODES.ACCESS_TOKEN_EXPIRED
        : AUTH_ERROR_CODES.ACCESS_TOKEN_INVALID,
    )
  }
}
