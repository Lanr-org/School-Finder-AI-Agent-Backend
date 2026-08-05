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

  if (env.nodeEnv === 'development' && err.details !== undefined) {
    errDetails = { ...errDetails, details: err.details }
  }

  return res.status(statusCode).send({ success: false, error: errDetails })
}
