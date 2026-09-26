import type { NextFunction, Request, Response } from 'express'
import { setRequestActor } from '../common/context/requestContext'
import { createError } from '../common/errors/AppError'
import { AUTH_ERROR_CODES } from '../common/errors/errorCodes'
import { decodeAcessToken } from '../common/security/token'
import AuthRepo from '../modules/auth/auth.repository'
import type { AccessTokenClaims } from '../modules/auth/auth.types'

export const AuthenticateMiddleware = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  try {
    const [scheme, accessToken] = req.headers.authorization?.split(' ') ?? []

    if (scheme !== 'Bearer' || !accessToken) {
      return next(
        createError('Not authorized', 401, {}, AUTH_ERROR_CODES.TOKEN_MISSING),
      )
    }

    const tokenClaims = decodeAcessToken(accessToken) as AccessTokenClaims
    const [user, authSession] = await Promise.all([
      AuthRepo.findUser({ id: tokenClaims.sub }),
      AuthRepo.findAuthSessionById(tokenClaims.session_Id),
    ])

    if (!user) {
      return next(
        createError(
          'Unable to authenticate user',
          401,
          {},
          AUTH_ERROR_CODES.ACCESS_TOKEN_INVALID,
        ),
      )
    }

    if (user.status !== 'ACTIVE') {
      return next(
        createError(
          'Account is not active',
          403,
          {},
          AUTH_ERROR_CODES.ACCOUNT_DISABLED,
        ),
      )
    }

    if (user.token_version !== tokenClaims.token_version) {
      return next(
        createError(
          'Unable to authenticate user',
          401,
          {},
          AUTH_ERROR_CODES.ACCESS_TOKEN_INVALID,
        ),
      )
    }

    if (!authSession || authSession.user_id !== tokenClaims.sub) {
      return next(
        createError(
          'Authentication session not found or has expired',
          401,
          {},
          AUTH_ERROR_CODES.AUTH_SESSION_NOT_FOUND,
        ),
      )
    }

    if (authSession.revoked_at) {
      return next(
        createError(
          'Authentication session revoked, please log in again',
          401,
          {},
          AUTH_ERROR_CODES.AUTH_SESSION_REVOKED,
        ),
      )
    }

    if (new Date(authSession.expires_at) <= new Date()) {
      return next(
        createError(
          'Authentication session has expired, please log in again',
          401,
          {},
          AUTH_ERROR_CODES.AUTH_SESSION_EXPIRED,
        ),
      )
    }

    req.auth = tokenClaims
    // Role from the verified DB row (the role at the time of the action), not the token claim.
    setRequestActor(user.id, user.role)
    next()
  } catch (error) {
    next(error)
  }
}
