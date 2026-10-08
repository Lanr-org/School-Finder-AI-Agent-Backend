import { logger } from '../../config/logger.js'
import {
  ConversationMode,
  MessageSenderType,
  type MessageChannel,
} from '../../generated/prisma/index.js'
import { aiReplyQueue } from '../../jobs/queues.js'
import { ConversationsRepo } from './conversations.repository.js'

export type ReceiveStudentMessageInput = {
  conversationId: string
  studentId: string
  text: string
  channel: MessageChannel
}

export class StudentMessageService {
  /**
   * Saves a student's message (always, even mid-escalation, so the advisor sees it), then,
   * while the conversation is AI-handled, queues the AI reply (see AIReplyJob). The reply
   * arrives later: over Telegram, or on the web app's next poll.
   */
  static Receive = async ({
    conversationId,
    studentId,
    text,
    channel,
  }: ReceiveStudentMessageInput) => {
    const message = await ConversationsRepo.createMessage(
      conversationId,
      MessageSenderType.STUDENT,
      text,
      channel,
    )

    const mode = await ConversationsRepo.findConversationMode(conversationId)
    if (mode !== ConversationMode.AI_BOT) {
      return { message, replyQueued: false }
    }

    // The job id is the message id, so the same message is never answered twice.
    await aiReplyQueue.add(
      'reply',
      { conversationId, studentId, messageId: message.id, channel },
      { jobId: `ai_${message.id}` },
    )
    logger.debug({ conversationId, messageId: message.id }, 'Queued AI reply.')
    return { message, replyQueued: true }
  }
}
