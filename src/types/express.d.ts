import type { AccessTokenClaims } from '../modules/auth/auth.types'

declare global {
  namespace Express {
    interface Request {
      id: string
      auth?: AccessTokenClaims
      // Set only by StudentAuthenticateMiddleware; never alongside `auth`.
      student?: { studentId: string; sessionId: string }
    }
  }
}

export {}
