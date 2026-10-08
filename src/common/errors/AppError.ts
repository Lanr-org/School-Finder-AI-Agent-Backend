export interface AppError extends Error {
  statusCode: number
  code: string
  details?: unknown
  // Set when the root cause was already sent to Sentry, so the error handler doesn't
  // report this wrapper a second time.
  reported?: boolean
}

export const createError = (
  message: string,
  statusCode: number,
  details: unknown,
  code: string,
): AppError => {
  const error = new Error(message) as AppError
  error.statusCode = statusCode
  error.code = code
  error.details = details

  return error
}
