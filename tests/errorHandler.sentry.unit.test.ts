import './setup-env'
import type { Request, Response } from 'express'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createError } from '../src/common/errors/AppError'
import { captureError } from '../src/config/sentry'
import { errorHandler } from '../src/middleware/errorHandler'

vi.mock('../src/config/sentry', () => ({ captureError: vi.fn() }))

const run = (err: ReturnType<typeof createError>) => {
  const res = { status: vi.fn().mockReturnThis(), send: vi.fn() }
  const req = { id: 'req_1', method: 'POST', route: { path: '/messages' } }
  errorHandler(err, req as unknown as Request, res as unknown as Response, vi.fn())
  return res
}

beforeEach(() => vi.clearAllMocks())

describe('errorHandler → Sentry', () => {
  it('reports a 500 with the request id and route', () => {
    const err = createError('db exploded', 500, {}, 'INTERNAL_ERROR')

    const res = run(err)

    expect(captureError).toHaveBeenCalledWith(err, {
      tags: { requestId: 'req_1', code: 'INTERNAL_ERROR', route: 'POST /messages' },
    })
    expect(res.status).toHaveBeenCalledWith(500)
  })

  it.each([400, 401, 403, 404, 409, 429])('does not report a %i', (status) => {
    run(createError('client problem', status, {}, 'X'))
    expect(captureError).not.toHaveBeenCalled()
  })

  it('does not report an error whose root cause was already reported', () => {
    const err = Object.assign(createError('try again', 500, {}, 'INTERNAL_ERROR'), { reported: true })

    run(err)

    expect(captureError).not.toHaveBeenCalled()
  })
})
