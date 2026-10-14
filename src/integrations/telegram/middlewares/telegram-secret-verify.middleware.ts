import crypto from 'crypto'
import { Request, Response, NextFunction } from 'express'
import env from '../../../config/env.js'
import { logger } from '../../../config/logger.js'

// Constant-time comparison, so response timing can't reveal how much of a guess was right.
const matchesSecret = (header: unknown, secret: string): boolean => {
  if (typeof header !== 'string') return false
  const given = Buffer.from(header)
  const expected = Buffer.from(secret)
  return given.length === expected.length && crypto.timingSafeEqual(given, expected)
}

/**
 * Express middleware that checks the X-Telegram-Bot-Api-Secret-Token header
 * on incoming HTTP webhooks to ensure requests come strictly from Telegram.
 */
export function verifyTelegramWebhookSecret(req: Request, res: Response, next: NextFunction): void {
  const secretHeader = req.headers['x-telegram-bot-api-secret-token']

  if (!env.telegramWebhookSecret) {
    logger.error('TELEGRAM_WEBHOOK_SECRET is not configured in environment.')
    res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Webhook security misconfigured',
      },
    })
    return
  }

  if (!matchesSecret(secretHeader, env.telegramWebhookSecret)) {
    logger.warn({ ip: req.ip }, 'Unauthorized Telegram webhook request rejected: Secret mismatch.')
    res.status(403).json({
      error: {
        code: 'FORBIDDEN',
        message: 'Invalid Telegram secret token header',
      },
    })
    return
  }

  next()
}
