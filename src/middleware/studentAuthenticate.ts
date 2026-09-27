import type { NextFunction, Request, Response } from 'express'
import { createError } from '../common/errors/AppError'
import { AUTH_ERROR_CODES } from '../common/errors/errorCodes'
import { verifyStudentAccessToken } from '../common/security/studentToken'
import StudentAuthRepo from '../modules/studentAuth/studentAuth.repository'

// Student-only counterpart to AuthenticateMiddleware. Sets req.student, never req.auth,
// so staff guards (requireRole, ownership checks) can't be satisfied by a student.
export const StudentAuthenticateMiddleware = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    const [scheme, token] = req.headers.authorization?.split(' ') ?? []
    if (scheme !== 'Bearer' || !token) {
      return next(createError('Not authorized', 401, {}, AUTH_ERROR_CODES.TOKEN_MISSING))
    }

    const claims = verifyStudentAccessToken(token)
    const session = await StudentAuthRepo.findSessionById(claims.sid)

    if (!session || session.student_id !== claims.sub || session.revoked_at || session.expires_at <= new Date()) {
      return next(
        createError('Your session has ended, please sign in again', 401, {}, AUTH_ERROR_CODES.AUTH_SESSION_NOT_FOUND),
      )
    }

    req.student = { studentId: claims.sub, sessionId: claims.sid }
    next()
  } catch (error) {
    next(error)
  }
}
