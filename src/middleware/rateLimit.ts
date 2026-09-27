import rateLimit from 'express-rate-limit'
import { createError } from '../common/errors/AppError'

// Per-IP limits. Errors go through the global handler so they use the standard envelope.
export const createRateLimit = (limit: number, windowMinutes: number) =>
  rateLimit({
    windowMs: windowMinutes * 60_000,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, _res, next) =>
      next(createError('Too many requests, please try again later', 429, {}, 'RATE_LIMITED')),
  })
