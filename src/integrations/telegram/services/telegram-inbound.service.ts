import { telegramInboundQueue } from '../../../jobs/queues.js'
import { logger } from '../../../config/logger.js'
import { TelegramWebhookUpdate } from '../schemas/telegram-webhook.schema.js'

export class TelegramInboundService {
  /**
   * Enqueues an incoming Telegram update into BullMQ for background processing.
   * Uses update_id as job ID to guarantee idempotency and prevent duplicate processing.
   */
  static async enqueueUpdate(update: TelegramWebhookUpdate): Promise<boolean> {
    try {
      await telegramInboundQueue.add(
        'process-telegram-update',
        update,
        {
          jobId: `update_${update.update_id}`, // Idempotency check: duplicate update_ids are dropped by Redis
        }
      )

      logger.debug({ updateId: update.update_id }, 'Enqueued Telegram update to BullMQ.')
      return true
    } catch (error) {
      logger.error(
        { updateId: update.update_id, error: (error as Error).message },
        'Failed to enqueue Telegram update.'
      )
      return false
    }
  }
}
