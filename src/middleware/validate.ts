import type { NextFunction, Request, Response } from 'express'
import type { z } from 'zod'
import { createError } from '../common/errors/AppError'
import { AUTH_ERROR_CODES } from '../common/errors/errorCodes'

// Error `details` shape from AGENTS.md: { "email": ["Must be a valid email"] }.
// Nested fields use dotted paths ("intakes.0.year"); errors not tied to a
// field (e.g. an "at least one field must be provided" refine) go under "_form".
export const toFieldErrors = (error: z.ZodError): Record<string, string[]> => {
  const fieldErrors: Record<string, string[]> = {}
  for (const issue of error.issues) {
    const field = issue.path.length ? issue.path.join('.') : '_form'
    ;(fieldErrors[field] ??= []).push(issue.message)
  }
  return fieldErrors
}

const validationError = (error: z.ZodError) =>
  createError(
    'Validation failed',
    400,
    toFieldErrors(error),
    'VALIDATION_ERROR',
  )

export const validate =
  (schema: z.ZodType) => (req: Request, _res: Response, next: NextFunction) => {
    const requestEnvironment = schema.safeParse(req.body)

    if (!requestEnvironment.success) {
      return next(validationError(requestEnvironment.error))
    }

    req.body = requestEnvironment.data
    next()
  }

export const validateParams =
  (schema: z.ZodType) => (req: Request, _res: Response, next: NextFunction) => {
    const requestEnvironment = schema.safeParse(req.params)

    if (!requestEnvironment.success) {
      return next(validationError(requestEnvironment.error))
    }

    req.params = requestEnvironment.data as typeof req.params
    next()
  }

export const validateQuery =
  (schema: z.ZodType) => (req: Request, _res: Response, next: NextFunction) => {
    const requestEnvironment = schema.safeParse(req.query)

    if (!requestEnvironment.success) {
      return next(validationError(requestEnvironment.error))
    }

    // Express 5 defines `req.query` as a getter-only property, so it can't be
    // reassigned directly — redefine it to hold the parsed, coerced data.
    Object.defineProperty(req, 'query', {
      value: requestEnvironment.data,
      writable: true,
      configurable: true,
    })
    next()
  }

export const validateRefreshToken =
  (schema: z.ZodObject) =>
  (req: Request, _res: Response, next: NextFunction) => {
    const requestEnvironment = schema.safeParse(req.cookies)

    if (!requestEnvironment.success) {
      return next(
        createError(
          'Refresh token is required',
          400,
          {},
          AUTH_ERROR_CODES.UNAUTHORIZED,
        ),
      )
    }

    const body =
      typeof req.body === 'object' && req.body !== null
        ? (req.body as Record<string, unknown>)
        : {}

    req.body = { ...body, ...requestEnvironment.data }
    next()
  }
