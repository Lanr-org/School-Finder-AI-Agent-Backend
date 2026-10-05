import './setup-env'
import * as Sentry from '@sentry/node'
import type { ErrorEvent } from '@sentry/node'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  captureAlert,
  captureError,
  captureWorkerFailure,
  initSentry,
  scrubEvent,
  scrubString,
} from '../src/config/sentry'

vi.mock('@sentry/node', () => ({
  init: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  close: vi.fn(),
}))

const capture = vi.mocked(Sentry).captureException

beforeEach(() => vi.clearAllMocks())

describe('scrubString', () => {
  it.each([
    ['/api/v1/auth/reset-password/abc123', '/api/v1/auth/reset-password/[REDACTED]'],
    ['/api/v1/auth/invitations/tok_9/accept', '/api/v1/auth/invitations/[REDACTED]/accept'],
    ['/api/v1/public/study-plans/secret', '/api/v1/public/study-plans/[REDACTED]'],
    [
      'https://api.telegram.org/bot123456:ABC-def_ghi/sendMessage',
      'https://api.telegram.org/bot[REDACTED]/sendMessage',
    ],
    ['/api/v1/student/me', '/api/v1/student/me'],
  ])('%s', (input, expected) => {
    expect(scrubString(input)).toBe(expected)
  })
})

describe('scrubEvent', () => {
  it('drops credentials, cookies, bodies and query strings, and cleans URLs', () => {
    const event = {
      request: {
        url: 'https://api.example.com/api/v1/auth/reset-password/abc123',
        query_string: 'token=secret',
        data: { password: 'hunter2' },
        cookies: { refresh: 'raw-token' },
        headers: {
          Authorization: 'Bearer abc',
          Cookie: 'refresh=raw',
          'X-Telegram-Bot-Api-Secret-Token': 'hook-secret',
          'User-Agent': 'curl',
        },
      },
      breadcrumbs: [
        { category: 'http', data: { url: 'https://api.telegram.org/bot123:SECRET/getMe' } },
        { category: 'console', message: 'hello' },
      ],
      exception: {
        values: [{ type: 'Error', value: 'failed calling /bot123:SECRET/sendMessage' }],
      },
    } as unknown as ErrorEvent

    const scrubbed = scrubEvent(event)

    expect(scrubbed.request?.url).toBe('https://api.example.com/api/v1/auth/reset-password/[REDACTED]')
    expect(scrubbed.request?.query_string).toBe('[REDACTED]')
    expect(scrubbed.request?.data).toBeUndefined()
    expect(scrubbed.request?.cookies).toBeUndefined()
    expect(scrubbed.request?.headers).toEqual({ 'User-Agent': 'curl' })
    expect(scrubbed.breadcrumbs?.[0]?.data?.url).toBe('https://api.telegram.org/bot[REDACTED]/getMe')
    expect(scrubbed.breadcrumbs?.[1]?.message).toBe('hello')
    expect(scrubbed.exception?.values?.[0]?.value).toBe('failed calling /bot[REDACTED]/sendMessage')
  })

  it('cleans the source lines attached to stack frames', () => {
    const event = {
      exception: {
        values: [
          {
            type: 'Error',
            value: 'x',
            stacktrace: {
              frames: [
                {
                  pre_context: ['// call https://api.telegram.org/bot123:SECRET/getMe'],
                  context_line: "fetch('https://api.telegram.org/bot123:SECRET/sendMessage')",
                  post_context: ['return null'],
                },
              ],
            },
          },
        ],
      },
    } as unknown as ErrorEvent

    const frame = scrubEvent(event).exception?.values?.[0]?.stacktrace?.frames?.[0]

    expect(frame?.pre_context).toEqual(['// call https://api.telegram.org/bot[REDACTED]/getMe'])
    expect(frame?.context_line).toBe("fetch('https://api.telegram.org/bot[REDACTED]/sendMessage')")
    expect(frame?.post_context).toEqual(['return null'])
  })

  it('leaves an event without a request alone', () => {
    const event = { message: 'plain' } as ErrorEvent
    expect(scrubEvent(event)).toEqual({ message: 'plain' })
  })
})

describe('initSentry', () => {
  it('stays off when there is no DSN', () => {
    expect(initSentry()).toBe(false)
    expect(vi.mocked(Sentry).init).not.toHaveBeenCalled()
  })
})

describe('captureWorkerFailure', () => {
  const error = new Error('boom')

  it('waits for the last retry before reporting', () => {
    captureWorkerFailure('telegram-outbound', { id: '1', attemptsMade: 1, opts: { attempts: 3 } }, error)
    expect(capture).not.toHaveBeenCalled()

    captureWorkerFailure('telegram-outbound', { id: '1', attemptsMade: 3, opts: { attempts: 3 } }, error)
    expect(capture).toHaveBeenCalledTimes(1)
  })

  it('reports a job that has no retries straight away', () => {
    captureWorkerFailure('ai-reply', { id: '2', attemptsMade: 1, opts: {} }, error)
    expect(capture).toHaveBeenCalledWith(error, {
      tags: { queue: 'ai-reply' },
      extra: { jobId: '2', attemptsMade: 1 },
    })
  })

  it('reports when the job is unknown', () => {
    captureWorkerFailure('ai-reply', undefined, error)
    expect(capture).toHaveBeenCalledTimes(1)
  })
})

describe('captureError / captureAlert', () => {
  it('passes tags and extra through', () => {
    const error = new Error('x')
    captureError(error, { tags: { area: 'interview' } })
    expect(capture).toHaveBeenCalledWith(error, { tags: { area: 'interview' } })
  })

  it('groups alerts by fingerprint at warning level', () => {
    captureAlert('cap reached', 'ai-global-daily-cap')
    expect(vi.mocked(Sentry).captureMessage).toHaveBeenCalledWith('cap reached', {
      level: 'warning',
      fingerprint: ['ai-global-daily-cap'],
    })
  })
})
