import type { Request } from 'express'
import rateLimit from 'express-rate-limit'
import { createError } from '../common/errors/AppError'

// Per-IP limits unless a keyGenerator says otherwise (e.g. per signed-in student).
// Errors go through the global handler so they use the standard envelope.
export const createRateLimit = (
  limit: number,
  windowMinutes: number,
  keyGenerator?: (req: Request) => string,
) =>
  rateLimit({
    windowMs: windowMinutes * 60_000,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    ...(keyGenerator && { keyGenerator }),
    handler: (_req, _res, next) =>
      next(createError('Too many requests, please try again later', 429, {}, 'RATE_LIMITED')),
  })
