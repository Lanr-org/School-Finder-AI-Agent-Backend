import { Worker, Job } from 'bullmq'
import env from '../../config/env.js'
import { logger } from '../../config/logger.js'
import { TelegramBotService } from '../../integrations/telegram/services/telegram-bot.service.js'
import { OutboundTelegramPayload } from '../../integrations/telegram/services/telegram-outbound.service.js'

const parseRedisUrl = (url: string) => {
  const parsed = new URL(url)
  return {
    host: parsed.hostname || '127.0.0.1',
    port: parseInt(parsed.port || '6379', 10),
  }
}

/**
 * Worker that processes outgoing Telegram messages from BullMQ.
 */
export const telegramOutboundWorker = new Worker<OutboundTelegramPayload>(
  'telegram-outbound',
  async (job: Job<OutboundTelegramPayload>) => {
    const { chatId, text, parseMode, replyMarkup } = job.data
    logger.info({ jobId: job.id, chatId }, 'Sending outbound Telegram message.')

    const bot = TelegramBotService.getBot()

    await bot.api.sendMessage(chatId, text, {
      parse_mode: parseMode || 'MarkdownV2',
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    })

  },
  {
    connection: parseRedisUrl(env.redisUrl),
    concurrency: 3, // Rate limiting: Max 3 concurrent outbound requests to Telegram
  }
)

telegramOutboundWorker.on('completed', (job) => {
  logger.debug({ jobId: job.id }, 'Outbound Telegram message delivered successfully.')
})

telegramOutboundWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, error: err.message }, 'Outbound Telegram message delivery failed.')
})
