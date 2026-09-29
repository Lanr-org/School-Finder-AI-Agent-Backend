import prisma from '../../database/prisma.js'
import { logger } from '../../config/logger.js'
import {
  ConversationMode,
  ConversationStatus,
  MessageSenderType,
  StudentIdentityProvider,
  type MessageChannel,
  type Prisma,
} from '../../generated/prisma/index.js'
import type { ListConversationsFilters } from './conversations.types.js'

const withStudentAndContact = {
  include: { student: { include: { contact: true } } },
} as const

export class ConversationsRepo {
  static findConversationMode = async (conversationId: string) => {
    const conversation = await prisma.conversations.findUnique({
      where: { id: conversationId },
      select: { mode: true },
    })
    return conversation?.mode
  }

  static findConversationByPublicId = async (publicId: string) => {
    return prisma.conversations.findUnique({
      where: { public_id: publicId },
      ...withStudentAndContact,
    })
  }

  static listConversations = async (filters: ListConversationsFilters) => {
    // Built as one combined sub-filter rather than separate spread keys — Prisma's nested
    // `student: {...}` object would otherwise get silently overwritten instead of merged
    // if more than one filter targets it (e.g. advisor + search together).
    const studentFilter: Prisma.StudentWhereInput = {
      ...(filters.advisorUserId !== undefined
        ? { assigned_advisor_id: filters.advisorUserId }
        : filters.unassigned === true
          ? { assigned_advisor_id: null }
          : {}),
      ...(filters.search !== undefined && {
        OR: [
          { public_id: { contains: filters.search, mode: 'insensitive' } },
          { contact: { first_name: { contains: filters.search, mode: 'insensitive' } } },
          { contact: { last_name: { contains: filters.search, mode: 'insensitive' } } },
        ],
      }),
    }

    const where: Prisma.ConversationsWhereInput = {
      ...(filters.status !== undefined && { status: filters.status }),
      ...(Object.keys(studentFilter).length > 0 && { student: studentFilter }),
    }

    const [conversations, total] = await prisma.$transaction([
      prisma.conversations.findMany({
        where,
        ...withStudentAndContact,
        orderBy: { last_activity_at: 'desc' },
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      prisma.conversations.count({ where }),
    ])

    return { conversations, total }
  }

  static escalateConversation = async (id: string) => {
    return prisma.conversations.update({
      where: { id },
      data: { mode: ConversationMode.HUMAN_ADVISOR, status: ConversationStatus.ESCALATED, last_activity_at: new Date() },
      ...withStudentAndContact,
    })
  }

  static resolveConversation = async (id: string) => {
    return prisma.conversations.update({
      where: { id },
      data: { status: ConversationStatus.RESOLVED },
      ...withStudentAndContact,
    })
  }

  static handbackConversation = async (id: string) => {
    return prisma.conversations.update({
      where: { id },
      data: { mode: ConversationMode.AI_BOT, status: ConversationStatus.ACTIVE },
      ...withStudentAndContact,
    })
  }

  static findCurrentConversation = async (studentId: string) => {
    // Same rule as Telegram: ESCALATED is still current; only RESOLVED closes a thread.
    return prisma.conversations.findFirst({
      where: {
        student_id: studentId,
        status: { in: [ConversationStatus.ACTIVE, ConversationStatus.ESCALATED] },
      },
      orderBy: { created_at: 'desc' },
    })
  }

  // A linked Telegram account's user id, which is also its private chat id; null if none.
  static findTelegramChatId = async (studentId: string) => {
    const identity = await prisma.studentIdentity.findUnique({
      where: { student_id_provider: { student_id: studentId, provider: StudentIdentityProvider.TELEGRAM } },
      select: { subject: true },
    })
    return identity?.subject ?? null
  }

  static findLastSenderType = async (conversationId: string) => {
    const message = await prisma.conversationMessages.findFirst({
      where: { conversation_id: conversationId },
      orderBy: { created_at: 'desc' },
      select: { sender_type: true },
    })
    return message?.sender_type ?? null
  }

  static findLastStudentChannel = async (conversationId: string) => {
    const message = await prisma.conversationMessages.findFirst({
      where: { conversation_id: conversationId, sender_type: MessageSenderType.STUDENT },
      orderBy: { created_at: 'desc' },
      select: { channel: true },
    })
    return message?.channel ?? null
  }

  // Across all the student's conversations, so a resolved thread doesn't vanish from their chat.
  static findStudentMessages = async (studentId: string, limit = 50) => {
    const messages = await prisma.conversationMessages.findMany({
      where: { conversation: { student_id: studentId } },
      orderBy: { created_at: 'desc' },
      take: limit,
    })
    return messages.reverse()
  }

  static findRecentMessages = async (conversationId: string, limit = 20) => {
    const messages = await prisma.conversationMessages.findMany({
      where: { conversation_id: conversationId },
      orderBy: { created_at: 'desc' },
      take: limit,
    })
    return messages.reverse()
  }

  // Every message moves the conversation up the staff list, whoever sent it.
  static createMessage = async (
    conversationId: string,
    senderType: MessageSenderType,
    content: string,
    channel: MessageChannel,
  ) => {
    const message = await prisma.conversationMessages.create({
      data: { conversation_id: conversationId, sender_type: senderType, content, channel },
    })
    // Separate from the insert: a failed activity bump must never lose the message.
    await prisma.conversations
      .update({ where: { id: conversationId }, data: { last_activity_at: new Date() } })
      .catch((error: unknown) =>
        logger.warn(
          { conversationId, error: (error as Error).message },
          'Could not update conversation last activity.',
        ),
      )
    return message
  }
}
