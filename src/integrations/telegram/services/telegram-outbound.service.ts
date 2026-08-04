import { telegramOutboundQueue } from '../../../jobs/queues.js'
import { logger } from '../../../config/logger.js'
import { TelegramFormattingUtil } from '../utils/telegram-formatting.util.js'

export interface OutboundTelegramPayload {
  chatId: string
  text: string
  parseMode?: 'MarkdownV2' | 'HTML' | undefined
  replyMarkup?: any | undefined
}

export class TelegramOutboundService {
  /**
   * Enqueues an outbound text message to be sent to a Telegram chat.
   * Handles markdown escaping, chunking, and optional inline keyboards.
   */
  static async sendMessage(chatId: string, rawText: string, replyMarkup?: any): Promise<boolean> {
    try {
      const escapedText = TelegramFormattingUtil.escapeMarkdownV2(rawText)
      const textChunks = TelegramFormattingUtil.chunkMessageText(escapedText)

      for (let i = 0; i < textChunks.length; i++) {
        const isLastChunk = i === textChunks.length - 1
        await telegramOutboundQueue.add(
          'send-telegram-message',
          {
            chatId,
            text: textChunks[i],
            parseMode: 'MarkdownV2',
            ...(isLastChunk && replyMarkup ? { replyMarkup } : {}),
          },
          {
            jobId: `outbound_${chatId}_${Date.now()}_${i}`,
          }
        )
      }

      logger.debug({ chatId, chunkCount: textChunks.length }, 'Enqueued outbound Telegram message.')
      return true
    } catch (error) {
      logger.error(
        { chatId, error: (error as Error).message },
        'Failed to enqueue outbound Telegram message.'
      )
      return false
    }
  }
}

