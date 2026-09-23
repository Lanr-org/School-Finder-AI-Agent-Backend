import prisma from '../../database/prisma.js'
import {
  ConversationMode,
  ConversationStatus,
  MessageSenderType,
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

  static touchLastActivity = async (id: string) => {
    return prisma.conversations.update({
      where: { id },
      data: { last_activity_at: new Date() },
    })
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
