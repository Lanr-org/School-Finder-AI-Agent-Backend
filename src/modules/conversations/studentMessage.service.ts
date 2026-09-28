import { logger } from '../../config/logger.js'
import { ConversationMode, MessageSenderType, type MessageChannel } from '../../generated/prisma/index.js'
import { AIReplyService } from '../ai/ai-reply.service.js'
import { ConversationsRepo } from './conversations.repository.js'

export const AI_FALLBACK_REPLY =
  "Sorry, I'm having trouble responding right now — please try again in a moment."

export type ReceiveStudentMessageInput = {
  conversationId: string
  studentId: string
  text: string
  channel: MessageChannel
}

export class StudentMessageService {
  /**
   * Saves a student's message (always, even mid-escalation, so the advisor sees it), then
   * answers with the AI only while the conversation is still AI-handled.
   */
  static Receive = async ({ conversationId, studentId, text, channel }: ReceiveStudentMessageInput) => {
    const message = await ConversationsRepo.createMessage(
      conversationId,
      MessageSenderType.STUDENT,
      text,
      channel,
    )

    const mode = await ConversationsRepo.findConversationMode(conversationId)
    if (mode !== ConversationMode.AI_BOT) {
      return { message, reply: null }
    }

    try {
      const reply = await AIReplyService.GenerateReply(conversationId, studentId, channel)
      return { message, reply }
    } catch (error) {
      logger.error({ error: (error as Error).message, conversationId }, 'AI reply generation failed.')
      // Saved so staff can see the student got an error instead of an answer.
      const reply = await ConversationsRepo.createMessage(
        conversationId,
        MessageSenderType.AGENT,
        AI_FALLBACK_REPLY,
        channel,
      )
      return { message, reply }
    }
  }
}
