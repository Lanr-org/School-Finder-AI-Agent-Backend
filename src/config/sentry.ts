import * as Sentry from '@sentry/node'
import type { Breadcrumb, ErrorEvent } from '@sentry/node'
import env from './env'
import { sanitizeLoggedUrl } from './logger'

// Headers that can carry credentials; removed from every event.
const SENSITIVE_HEADERS = [
  'authorization',
  'cookie',
  'set-cookie',
  'x-telegram-bot-api-secret-token',
]

// The Telegram bot token is part of the path of every Bot API call
// (https://api.telegram.org/bot<id>:<secret>/sendMessage).
const TELEGRAM_BOT_TOKEN_PATTERN = /\/bot\d+:[\w-]+/g

export const scrubString = (value: string) =>
  (sanitizeLoggedUrl(value) ?? value).replace(
    TELEGRAM_BOT_TOKEN_PATTERN,
    '/bot[REDACTED]',
  )

const scrubBreadcrumb = (breadcrumb: Breadcrumb): Breadcrumb => {
  const data = breadcrumb.data
  if (!data) return breadcrumb
  const scrubbed = { ...data }
  for (const key of ['url', 'to', 'from']) {
    if (typeof scrubbed[key] === 'string') scrubbed[key] = scrubString(scrubbed[key])
  }
  return { ...breadcrumb, data: scrubbed }
}

// Runs on every event before it leaves the server. Request bodies are dropped entirely
// (they can hold passwords or tokens), as are credential headers and cookies; URLs are
// stripped of the secret tokens the logger already redacts.
export const scrubEvent = <T extends ErrorEvent>(event: T): T => {
  const request = event.request
  if (request) {
    delete request.data
    delete request.cookies
    if (request.headers) {
      request.headers = Object.fromEntries(
        Object.entries(request.headers).filter(
          ([name]) => !SENSITIVE_HEADERS.includes(name.toLowerCase()),
        ),
      )
    }
    if (request.url) request.url = scrubString(request.url)
    if (request.query_string) request.query_string = '[REDACTED]'
  }
  if (event.breadcrumbs) event.breadcrumbs = event.breadcrumbs.map(scrubBreadcrumb)
  for (const exception of event.exception?.values ?? []) {
    if (exception.value) exception.value = scrubString(exception.value)
    // The SDK attaches a few lines of source around each stack frame.
    for (const frame of exception.stacktrace?.frames ?? []) {
      if (frame.context_line) frame.context_line = scrubString(frame.context_line)
      if (frame.pre_context) frame.pre_context = frame.pre_context.map(scrubString)
      if (frame.post_context) frame.post_context = frame.post_context.map(scrubString)
    }
  }
  if (event.message) event.message = scrubString(event.message)
  return event
}

// Off unless SENTRY_DSN is set, so local development and tests never send anything.
export const initSentry = () => {
  if (!env.sentryDsn) return false
  Sentry.init({
    dsn: env.sentryDsn,
    environment: env.sentryEnvironment ?? env.nodeEnv,
    // Errors only: no performance tracing.
    tracesSampleRate: 0,
    // Sentry 11 collects all of this by default. We send none of it: it can hold passwords,
    // tokens and student messages. scrubEvent below is a second layer, not the only one.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      stackFrameVariables: false,
      databaseQueryData: false,
      queues: false,
    },
    beforeSend: (event) => scrubEvent(event),
  })
  return true
}

// Report an error we handled ourselves (a worker job failure, a provider outage...).
// A no-op when Sentry is off.
export const captureError = (
  error: unknown,
  context: { tags?: Record<string, string>; extra?: Record<string, unknown> } = {},
) => {
  Sentry.captureException(error, {
    ...(context.tags ? { tags: context.tags } : {}),
    ...(context.extra ? { extra: context.extra } : {}),
  })
}

type FailedJob = { id?: string | undefined; attemptsMade: number; opts: { attempts?: number | undefined } }

// For a queue worker's `failed` event, which fires on every attempt: reports only when the
// job has used its last retry. The payload is left out (it holds student messages); only ids go.
export const captureWorkerFailure = (queue: string, job: FailedJob | undefined, error: Error) => {
  if (job && job.attemptsMade < (job.opts.attempts ?? 1)) return
  captureError(error, {
    tags: { queue },
    extra: { jobId: job?.id, attemptsMade: job?.attemptsMade },
  })
}

// A condition worth an alert that isn't an exception (e.g. the daily AI cap was hit).
// Grouped into one Sentry issue per `fingerprint` so a busy day doesn't flood the inbox.
export const captureAlert = (message: string, fingerprint: string) => {
  Sentry.captureMessage(message, { level: 'warning', fingerprint: [fingerprint] })
}

// Sends queued events before the process exits.
export const flushSentry = (timeoutMs = 2000) => Sentry.close(timeoutMs)
