import type { NextFunction, Request, Response } from 'express'
import { createError } from '../common/errors/AppError'
import { AUTH_ERROR_CODES } from '../common/errors/errorCodes'

// Must run after AuthenticateMiddleware, which populates req.auth.
export const requireRole =
  (...roles: string[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth || !roles.includes(req.auth.role)) {
      return next(
        createError(
          'You do not have permission to perform this action',
          403,
          {},
          AUTH_ERROR_CODES.FORBIDDEN,
        ),
      )
    }

    next()
  }
