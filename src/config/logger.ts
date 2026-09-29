import pino from 'pino'
import pinoHttp from 'pino-http'
import type { Request, Response } from 'express'
import env from './env'

const loggerOptions: pino.LoggerOptions = {
  level:
    process.env.LOG_LEVEL ?? (env.nodeEnv === 'production' ? 'info' : 'debug'),
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.body.password',
      'req.body.currentPassword',
      'req.body.newPassword',
      'req.body.confirmNewPassword',
      'req.body.refreshToken',
      'req.params.token',
      'res.headers["set-cookie"]',
    ],
    censor: '[REDACTED]',
  },
}

// Routes whose path carries a secret token: a logged URL must never be usable.
const TOKEN_PATHS = [
  '/api/v1/auth/reset-password/',
  '/api/v1/auth/invitations/',
  '/api/v1/public/study-plans/',
]

export const sanitizeLoggedUrl = (url: string | undefined) =>
  TOKEN_PATHS.reduce(
    (safe, prefix) =>
      safe?.replace(
        new RegExp(`${prefix.replace(/\//g, '\\/')}[^/?#]+`, 'g'),
        `${prefix}[REDACTED]`,
      ),
    url,
  )

if (env.nodeEnv === 'development') {
  loggerOptions.transport = {
    target: 'pino-pretty',
    options: {
      colorize: true,
      singleLine: true,
    },
  }
}

export const logger = pino(loggerOptions)

export const httpLogger = pinoHttp<Request, Response>({
  logger,
  serializers: {
    req(req: Request) {
      const serializedRequest = pino.stdSerializers.req(req)

      return {
        ...serializedRequest,
        url: sanitizeLoggedUrl(serializedRequest.url),
      }
    },
  },
  genReqId: (req) => req.id,
  customProps: (req) => ({
    requestId: req.id,
  }),
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return 'error'
    if (res.statusCode >= 400) return 'warn'
    return 'info'
  },
})
