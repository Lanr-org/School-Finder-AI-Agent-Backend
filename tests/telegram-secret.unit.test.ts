import './setup-env'
import type { NextFunction, Request, Response } from 'express'
import { describe, expect, it, vi } from 'vitest'
import { verifyTelegramWebhookSecret } from '../src/integrations/telegram/middlewares/telegram-secret-verify.middleware.js'

vi.mock('../src/config/env.js', async (importOriginal) => {
  const actual = await importOriginal<{ default: Record<string, unknown> }>()
  return {
    default: { ...actual.default, telegramWebhookSecret: 'right-secret_123' },
  }
})

const run = (header?: string | string[]) => {
  const req = {
    headers:
      header === undefined ? {} : { 'x-telegram-bot-api-secret-token': header },
    ip: '1.2.3.4',
  }
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  }
  const next = vi.fn()
  verifyTelegramWebhookSecret(
    req as unknown as Request,
    res as unknown as Response,
    next as NextFunction,
  )
  return { res, next }
}

describe('verifyTelegramWebhookSecret', () => {
  it('lets the right secret through', () => {
    expect(run('right-secret_123').next).toHaveBeenCalledOnce()
  })

  it.each([
    ['a wrong secret of the same length', 'wrong-secret_123'],
    ['a prefix of the secret', 'right-secret'],
    ['a longer value', 'right-secret_1234'],
    ['an empty header', ''],
  ])('rejects %s with 403', (_label, header) => {
    const { res, next } = run(header)
    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(403)
  })

  it('rejects a missing or repeated header', () => {
    expect(run().res.status).toHaveBeenCalledWith(403)
    expect(run(['right-secret_123', 'x']).res.status).toHaveBeenCalledWith(403)
  })
})
