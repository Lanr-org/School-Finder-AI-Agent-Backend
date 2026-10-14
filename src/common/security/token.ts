import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import env from '../../config/env'
import { createError } from '../errors/AppError'
import { AUTH_ERROR_CODES } from '../errors/errorCodes'

// Pinned on both sign and verify, so a token signed any other way is rejected.
const ALGORITHM = 'HS256'

const generateAcessToken = (
  sub: string,
  session_Id: string,
  role: string,
  token_version: number,
): string => {
  return jwt.sign({ sub, session_Id, role, token_version }, env.jwtSecret, {
    algorithm: ALGORITHM,
    expiresIn: '15m',
  })
}

const decodeAcessToken = (token: string) => {
  try {
    return jwt.verify(token, env.jwtSecret, { algorithms: [ALGORITHM] })
  } catch (error) {
    if (error instanceof Error) {
      if (
        error.message === 'jwt must be provided' ||
        error.message === 'jwt malformed'
      ) {
        throw createError(
          'Unable to authenticate user',
          401,
          {},
          AUTH_ERROR_CODES.ACCESS_TOKEN_MALFORMED,
        )
      }

      if (error.message === 'jwt expired') {
        throw createError(
          'Unable to authenticate user',
          401,
          {},
          AUTH_ERROR_CODES.ACCESS_TOKEN_EXPIRED,
        )
      }
    }

    throw createError(
      'Unable to authenticate user',
      401,
      {},
      AUTH_ERROR_CODES.ACCESS_TOKEN_INVALID,
    )
  }
}

const generateRefreshToken = (): string => {
  return crypto.randomBytes(64).toString('hex')
}

export { generateAcessToken, decodeAcessToken, generateRefreshToken }
