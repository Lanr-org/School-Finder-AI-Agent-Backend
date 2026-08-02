import { Request, Response } from 'express'
import { logger } from '../../../config/logger.js'
import { telegramWebhookUpdateSchema } from '../schemas/telegram-webhook.schema.js'
import { TelegramInboundService } from '../services/telegram-inbound.service.js'

export class TelegramWebhookController {
  /**
   * Handles incoming HTTP POST webhooks from Telegram API servers.
   */
  static async handleWebhook(req: Request, res: Response): Promise<void> {
    const parseResult = telegramWebhookUpdateSchema.safeParse(req.body)

    if (!parseResult.success) {
      logger.warn({ errors: parseResult.error.flatten().fieldErrors }, 'Invalid Telegram webhook payload.')
      // Always return 200 to Telegram even on malformed body so Telegram does not retry invalid payloads indefinitely
      res.status(200).json({ ok: true, ignored: true, reason: 'Invalid schema' })
      return
    }

    const update = parseResult.data

    logger.info({ updateId: update.update_id }, 'Received Telegram update.')

    // Push update into BullMQ queue for background processing
    await TelegramInboundService.enqueueUpdate(update)

    // Fast ACK: Respond with 200 OK immediately (< 100ms) to satisfy Telegram's webhook requirements.
    res.status(200).json({ ok: true })
  }
}

