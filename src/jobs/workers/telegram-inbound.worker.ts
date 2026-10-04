import { Worker, Job } from 'bullmq'
import env from '../../config/env.js'
import { logger } from '../../config/logger.js'
import { TelegramWebhookUpdate } from '../../integrations/telegram/schemas/telegram-webhook.schema.js'
import { TelegramUserMapper } from '../../integrations/telegram/mappers/telegram-user.mapper.js'
import { TelegramMessageMapper } from '../../integrations/telegram/mappers/telegram-message.mapper.js'
import { LINK_REPLIES, TelegramCommandHandler } from '../../integrations/telegram/handlers/command.handler.js'
import StudentLinkService from '../../modules/studentLink/studentLink.service.js'
import { TelegramCallbackQueryHandler } from '../../integrations/telegram/handlers/callback-query.handler.js'
import { ContactsService } from '../../modules/contacts/contacts.service.js'
import { CentrifugoClient } from '../../integrations/centrifugo/services/centrifugo.client.js'
import { StudentMessageService } from '../../modules/conversations/studentMessage.service.js'
import { TelegramOutboundService } from '../../integrations/telegram/services/telegram-outbound.service.js'
import { MessageChannel } from '../../generated/prisma/index.js'
import { AiUsageService } from '../../modules/ai/aiUsage.service.js'

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

    // The bot only serves 1:1 chats for now (community-group support is BACKLOG #7e).
    // In a group the chat id is shared, so processing would turn the whole group into
    // one "student" and have the AI reply to every message.
    if (messageDTO.isGroup) {
      logger.info(
        { updateId: update.update_id, chatId: messageDTO.externalChatId },
        'Ignoring Telegram update from a non-private chat.'
      )
      return
    }

    // 0. Account linking ("/start link_<token>" from the web app) comes before resolving the
    // student, so a new Telegram user who links never gets a throwaway student of their own.
    const linkToken = TelegramCommandHandler.parseLinkToken(messageDTO.textContent)
    if (linkToken) {
      const { outcome } = await StudentLinkService.LinkTelegram(linkToken, contactDTO.providerUserId)
      logger.info({ updateId: update.update_id, outcome }, 'Handled Telegram account link.')
      await TelegramOutboundService.sendMessage(messageDTO.externalChatId, LINK_REPLIES[outcome])
      return
    }

    // 1. Resolve or Register Student in PostgreSQL Database
    const studentContext = await ContactsService.resolveTelegramContact(contactDTO)

    // 2. Handle Bot Commands (e.g. /start, /help, /plan)
    if (messageDTO.textContent && messageDTO.textContent.startsWith('/')) {
      const handled = await TelegramCommandHandler.handleCommand(
        messageDTO.externalChatId,
        messageDTO.textContent,
        studentContext.studentId
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


    // 4. Save free-text messages. Unless an advisor has taken over, the AI reply is queued
    // and sent to this chat by the ai-reply worker.
    if (messageDTO.textContent) {
      // A chat sending more than the per-minute allowance is dropped without a reply.
      if (!(await AiUsageService.ConsumeTelegramMessage(messageDTO.externalChatId))) {
        logger.warn(
          { updateId: update.update_id, chatId: messageDTO.externalChatId },
          'Telegram message dropped: per-minute limit exceeded.'
        )
        return
      }
      await StudentMessageService.Receive({
        conversationId: studentContext.conversationId,
        studentId: studentContext.studentId,
        text: messageDTO.textContent,
        channel: MessageChannel.TELEGRAM,
      })
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
        channel: MessageChannel.TELEGRAM,
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
