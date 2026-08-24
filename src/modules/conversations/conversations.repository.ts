import prisma from '../../database/prisma.js'
import { MessageSenderType } from '../../generated/prisma/index.js'

export class ConversationsRepo {
  static findConversationMode = async (conversationId: string) => {
    const conversation = await prisma.conversations.findUnique({
      where: { id: conversationId },
      select: { mode: true },
    })
    return conversation?.mode
  }

  static findRecentMessages = async (conversationId: string, limit = 20) => {
    const messages = await prisma.conversationMessages.findMany({
      where: { conversation_id: conversationId },
      orderBy: { created_at: 'desc' },
      take: limit,
    })
    return messages.reverse()
  }

  static createMessage = async (
    conversationId: string,
    senderType: MessageSenderType,
    content: string,
  ) => {
    return prisma.conversationMessages.create({
      data: { conversation_id: conversationId, sender_type: senderType, content },
    })
  }
}
