import type { NextFunction, Request, Response } from 'express'
import type { AppError } from '../common/errors/AppError'
import env from '../config/env'
import { logger } from '../config/logger'

export const errorHandler = (
  err: AppError,
  req: Request,
  res: Response,
  _next: NextFunction,
) => {
  void _next
  const statusCode = err.statusCode ?? 500
  const code = err.code ?? 'INTERNAL_ERROR'
  const requestId =
    typeof req.id === 'string'
      ? req.id
      : typeof req.id === 'number'
        ? req.id.toString()
        : ''

  if (statusCode >= 500) {
    logger.error({ err, requestId: req.id, code }, 'Unhandled request error')
  }

  let errDetails: {
    message: string
    code: string
    requestId: string
    details?: unknown
  } = {
    message:
      statusCode >= 500 && env.nodeEnv === 'production'
        ? 'Internal server error'
        : err.message,
    code,
    requestId,
  }

  // Most errors pass `{}` — only send details that carry something.
  const hasDetails =
    err.details !== undefined &&
    err.details !== null &&
    !(
      typeof err.details === 'object' &&
      !Array.isArray(err.details) &&
      Object.keys(err.details).length === 0
    )

  // Client errors (4xx) always carry their details (validation field errors,
  // conflict context such as allowed next statuses). Server errors (5xx) can
  // carry stack traces, so their details are only exposed in development.
  if (hasDetails && (statusCode < 500 || env.nodeEnv === 'development')) {
    errDetails = { ...errDetails, details: err.details }
  }

  return res.status(statusCode).send({ success: false, error: errDetails })
}
