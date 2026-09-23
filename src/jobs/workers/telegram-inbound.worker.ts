import { Worker, Job } from 'bullmq'
import env from '../../config/env.js'
import { logger } from '../../config/logger.js'
import { TelegramWebhookUpdate } from '../../integrations/telegram/schemas/telegram-webhook.schema.js'
import { TelegramUserMapper } from '../../integrations/telegram/mappers/telegram-user.mapper.js'
import { TelegramMessageMapper } from '../../integrations/telegram/mappers/telegram-message.mapper.js'
import { TelegramCommandHandler } from '../../integrations/telegram/handlers/command.handler.js'
import { TelegramCallbackQueryHandler } from '../../integrations/telegram/handlers/callback-query.handler.js'
import { ContactsService } from '../../modules/contacts/contacts.service.js'
import { CentrifugoClient } from '../../integrations/centrifugo/services/centrifugo.client.js'
import { ConversationsRepo } from '../../modules/conversations/conversations.repository.js'
import { AIReplyService } from '../../modules/ai/ai-reply.service.js'
import { TelegramOutboundService } from '../../integrations/telegram/services/telegram-outbound.service.js'
import { ConversationMode } from '../../generated/prisma/index.js'

const parseRedisUrl = (url: string) => {
  const parsed = new URL(url)
  return {
    host: parsed.hostname || '127.0.0.1',
    port: parseInt(parsed.port || '6379', 10),
  }
}

/**
 * Worker that processes incoming Telegram updates from BullMQ.
 */
export const telegramInboundWorker = new Worker<TelegramWebhookUpdate>(
  'telegram-inbound',
  async (job: Job<TelegramWebhookUpdate>) => {
    const update = job.data
    logger.info({ jobId: job.id, updateId: update.update_id }, 'Processing inbound Telegram update.')

    const contactDTO = TelegramUserMapper.toProviderContact(update)
    const messageDTO = TelegramMessageMapper.toInboundMessage(update)

    if (!contactDTO || !messageDTO) {
      logger.warn({ updateId: update.update_id }, 'Skipping update: Unable to map contact or message.')
      return
    }

    // 1. Resolve or Register Student in PostgreSQL Database
    const studentContext = await ContactsService.resolveTelegramContact(contactDTO)

    // 2. Handle Bot Commands (e.g. /start, /help)
    if (messageDTO.textContent && messageDTO.textContent.startsWith('/')) {
      const handled = await TelegramCommandHandler.handleCommand(
        messageDTO.externalChatId,
        messageDTO.textContent
      )
      if (handled) return
    }

    // 3. Handle Inline Keyboard Button Clicks (Callback Queries)
    if (messageDTO.isCallback && messageDTO.callbackData) {
      const handled = await TelegramCallbackQueryHandler.handleCallbackQuery(
        messageDTO.externalChatId,
        messageDTO.callbackData,
        studentContext.studentId
      )
      if (handled) return
    }


    // 4. Generate and send an AI reply for free-text messages, but only while the
    // conversation hasn't been escalated to a human advisor.
    if (messageDTO.textContent) {
      const mode = await ConversationsRepo.findConversationMode(studentContext.conversationId)

      if (mode === ConversationMode.AI_BOT) {
        try {
          const replyText = await AIReplyService.GenerateReply(
            studentContext.conversationId,
            studentContext.studentId,
            messageDTO.textContent
          )
          await TelegramOutboundService.sendMessage(messageDTO.externalChatId, replyText)
        } catch (error) {
          logger.error(
            { error: (error as Error).message, conversationId: studentContext.conversationId },
            'AI reply generation failed.'
          )
          await TelegramOutboundService.sendMessage(
            messageDTO.externalChatId,
            "Sorry, I'm having trouble responding right now — please try again in a moment."
          )
        }
      }
    }

    // 5. Broadcast live event via Centrifugo to admin dashboard
    await CentrifugoClient.publish('admin:dashboard', {
      event: 'message.created',
      data: {
        publicId: studentContext.publicId,
        studentId: studentContext.studentId,
        conversationId: studentContext.conversationId,
        providerUserId: contactDTO.providerUserId,
        firstName: contactDTO.firstName,
        text: messageDTO.textContent || messageDTO.callbackData,
        chatId: messageDTO.externalChatId,
        isNewStudent: studentContext.isNewStudent,
      },
      timestamp: new Date().toISOString(),
    })
  },
  {
    connection: parseRedisUrl(env.redisUrl),
    concurrency: 5,
  }
)



telegramInboundWorker.on('completed', (job) => {
  logger.debug({ jobId: job.id }, 'Inbound Telegram update processed successfully.')
})

telegramInboundWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, error: err.message }, 'Inbound Telegram update processing failed.')
})
