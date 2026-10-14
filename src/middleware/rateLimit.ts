import type { Request } from 'express'
import rateLimit from 'express-rate-limit'
import { createError } from '../common/errors/AppError'

// Per-IP limits unless a keyGenerator says otherwise (e.g. per signed-in student).
// `failedOnly` counts only responses with an error status, so people who type their
// password right are never slowed down. Errors go through the global handler so they use
// the standard envelope.
export const createRateLimit = (
  limit: number,
  windowMinutes: number,
  keyGenerator?: (req: Request) => string,
  { failedOnly = false }: { failedOnly?: boolean } = {},
) =>
  rateLimit({
    windowMs: windowMinutes * 60_000,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skipSuccessfulRequests: failedOnly,
    ...(keyGenerator && { keyGenerator }),
    handler: (_req, _res, next) =>
      next(createError('Too many requests, please try again later', 429, {}, 'RATE_LIMITED')),
  })
