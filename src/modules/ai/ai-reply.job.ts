import { logger } from '../../config/logger.js'
import {
  ConversationMode,
  MessageSenderType,
} from '../../generated/prisma/index.js'
import { TelegramOutboundService } from '../../integrations/telegram/services/telegram-outbound.service.js'
import type { AiReplyJob } from '../../jobs/queues.js'
import { ConversationsRepo } from '../conversations/conversations.repository.js'
import { AIReplyService } from './ai-reply.service.js'
import { AiUsageService } from './aiUsage.service.js'

export const AI_FALLBACK_REPLY =
  "Sorry, I'm having trouble responding right now — please try again in a moment."

export const AI_STUDENT_LIMIT_REPLY =
  "You've reached today's limit for AI chat. It resets tomorrow. If you need help sooner, tap “Talk to an advisor” (or send /advisor) and our team will follow up."

export const AI_GLOBAL_LIMIT_REPLY =
  "We're very busy and the AI chat is at capacity for today. Please try again tomorrow, or tap “Talk to an advisor” (or send /advisor) and our team will follow up."

export type AiReplyOutcome =
  | 'REPLIED'
  | 'FALLBACK'
  | 'SKIPPED_ADVISOR'
  | 'SKIPPED_NEWER_MESSAGE'
  | 'SKIPPED_LIMIT'

// Answers one queued student message. Runs in the ai-reply worker, off the request path.
export const processAiReply = async ({
  conversationId,
  studentId,
  messageId,
  channel,
}: AiReplyJob): Promise<AiReplyOutcome> => {
  // An advisor may have taken over while the job waited.
  if (
    (await ConversationsRepo.findConversationMode(conversationId)) !==
    ConversationMode.AI_BOT
  ) {
    return 'SKIPPED_ADVISOR'
  }
  // Several messages in a row get one reply: the newest message's job answers them all
  // (the AI sees the whole recent history).
  if (
    await ConversationsRepo.hasNewerStudentMessage(conversationId, messageId)
  ) {
    return 'SKIPPED_NEWER_MESSAGE'
  }

  let outcome: AiReplyOutcome = 'REPLIED'
  let content: string
  const usage = await AiUsageService.TryConsume(studentId)
  if (!usage.allowed) {
    logger.info(
      { conversationId, studentId, reason: usage.reason },
      'AI reply skipped: daily limit reached.',
    )
    // Saved so the student (and staff) see why there was no answer.
    outcome = 'SKIPPED_LIMIT'
    content = (
      await ConversationsRepo.createMessage(
        conversationId,
        MessageSenderType.AGENT,
        usage.reason === 'GLOBAL_DAILY'
          ? AI_GLOBAL_LIMIT_REPLY
          : AI_STUDENT_LIMIT_REPLY,
        channel,
      )
    ).content
  } else {
    try {
      content = (
        await AIReplyService.GenerateReply(conversationId, studentId, channel)
      ).content
    } catch (error) {
      logger.error(
        { err: error, conversationId },
        'AI reply generation failed.',
      )
      // Saved so staff can see the student got an error instead of an answer.
      outcome = 'FALLBACK'
      content = (
        await ConversationsRepo.createMessage(
          conversationId,
          MessageSenderType.AGENT,
          AI_FALLBACK_REPLY,
          channel,
        )
      ).content
    }
  }

  // Web students pick the reply up on their next poll; Telegram students get it pushed.
  if (channel === 'TELEGRAM') {
    const chatId = await ConversationsRepo.findTelegramChatId(studentId)
    if (chatId) await TelegramOutboundService.sendMessage(chatId, content)
    else
      logger.warn(
        { studentId, conversationId },
        'No Telegram chat for a Telegram reply.',
      )
  }
  return outcome
}
