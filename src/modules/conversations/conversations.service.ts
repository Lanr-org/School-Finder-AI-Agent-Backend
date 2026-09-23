import { logger } from '../../config/logger.js'
import { createError } from '../../common/errors/AppError.js'
import { assertStudentOwnership } from '../../common/security/ownership.js'
import { MessageSenderType } from '../../generated/prisma/index.js'
import type { AccessTokenClaims } from '../auth/auth.types.js'
import TeamRepo from '../team/team.repository.js'
import { buildAdvisorLookup, type AdvisorRef } from '../team/advisor-lookup.js'
import { TelegramOutboundService } from '../../integrations/telegram/services/telegram-outbound.service.js'
import { ConversationsRepo } from './conversations.repository.js'
import type { CreateReplyDTO, ListConversationsQueryDTO } from './conversations.types.js'

type ConversationWithStudent = NonNullable<Awaited<ReturnType<typeof ConversationsRepo.findConversationByPublicId>>>

const toConversationSummary = (conversation: ConversationWithStudent, advisorLookup: Map<string, AdvisorRef>) => ({
  publicId: conversation.public_id,
  mode: conversation.mode,
  status: conversation.status,
  lastActivityAt: conversation.last_activity_at,
  createdAt: conversation.created_at,
  student: {
    publicId: conversation.student.public_id,
    firstName: conversation.student.contact.first_name,
    lastName: conversation.student.contact.last_name,
    assignedAdvisor: conversation.student.assigned_advisor_id
      ? (advisorLookup.get(conversation.student.assigned_advisor_id) ?? null)
      : null,
  },
})

const getOwnedConversation = async (publicId: string, auth: AccessTokenClaims) => {
  const conversation = await ConversationsRepo.findConversationByPublicId(publicId)
  if (!conversation) {
    throw createError('Conversation not found', 404, {}, 'NOT_FOUND')
  }
  assertStudentOwnership(conversation.student.assigned_advisor_id, auth)
  return conversation
}

export class ConversationsService {
  // ── GET /conversations ──────────────────────────────────────────────────
  static ListConversations = async (query: ListConversationsQueryDTO, auth: AccessTokenClaims) => {
    let advisorUserId: string | undefined
    if (auth.role === 'ADVISOR') {
      advisorUserId = auth.sub
    } else if (query.advisorId !== undefined) {
      const advisor = await TeamRepo.findUserByPublicId(query.advisorId)
      if (!advisor) {
        throw createError('Advisor not found', 404, {}, 'NOT_FOUND')
      }
      advisorUserId = advisor.id
    }

    const { conversations, total } = await ConversationsRepo.listConversations({
      status: query.status,
      advisorUserId,
      // Advisors are already hard-scoped to their own id above — "unassigned" only makes
      // sense for ADMIN browsing the queue, so ignore it for the ADVISOR role.
      unassigned: auth.role === 'ADVISOR' ? undefined : query.unassigned,
      search: query.search,
      page: query.page,
      limit: query.limit,
    })

    const advisorLookup = await buildAdvisorLookup(
      conversations.map((conversation) => conversation.student.assigned_advisor_id),
    )

    return {
      conversations: conversations.map((conversation) => toConversationSummary(conversation, advisorLookup)),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    }
  }

  // ── GET /conversations/:conversationId ──────────────────────────────────
  static GetConversation = async (publicId: string, auth: AccessTokenClaims) => {
    const conversation = await getOwnedConversation(publicId, auth)
    const [messages, advisorLookup] = await Promise.all([
      ConversationsRepo.findRecentMessages(conversation.id, 100),
      buildAdvisorLookup([conversation.student.assigned_advisor_id]),
    ])
    const summary = toConversationSummary(conversation, advisorLookup)

    return {
      ...summary,
      student: {
        ...summary.student,
        email: conversation.student.contact.email,
        phone: conversation.student.contact.phone,
      },
      messages: messages.map((message) => ({
        senderType: message.sender_type,
        content: message.content,
        createdAt: message.created_at,
      })),
    }
  }

  // ── POST /conversations/:conversationId/replies ─────────────────────────
  static Reply = async (publicId: string, dto: CreateReplyDTO, auth: AccessTokenClaims) => {
    const conversation = await getOwnedConversation(publicId, auth)

    const message = await ConversationsRepo.createMessage(conversation.id, MessageSenderType.ADVISOR, dto.content)
    await ConversationsRepo.touchLastActivity(conversation.id)

    const delivered = await TelegramOutboundService.sendMessage(
      conversation.student.contact.provider_user_id,
      dto.content,
    )
    if (!delivered) {
      logger.error({ conversationId: conversation.public_id }, 'Advisor reply saved but Telegram delivery failed.')
    }

    return {
      senderType: message.sender_type,
      content: message.content,
      createdAt: message.created_at,
      delivered,
    }
  }

  // ── POST /conversations/:conversationId/escalate ────────────────────────
  static Escalate = async (publicId: string, auth: AccessTokenClaims) => {
    const conversation = await getOwnedConversation(publicId, auth)
    const updated = await ConversationsRepo.escalateConversation(conversation.id)
    const advisorLookup = await buildAdvisorLookup([updated.student.assigned_advisor_id])
    logger.info({ conversationId: publicId, by: auth.sub }, 'Conversation escalated to human advisor.')
    return toConversationSummary(updated, advisorLookup)
  }

  // ── POST /conversations/:conversationId/resolve ─────────────────────────
  static Resolve = async (publicId: string, auth: AccessTokenClaims) => {
    const conversation = await getOwnedConversation(publicId, auth)
    const updated = await ConversationsRepo.resolveConversation(conversation.id)
    const advisorLookup = await buildAdvisorLookup([updated.student.assigned_advisor_id])
    logger.info({ conversationId: publicId, by: auth.sub }, 'Conversation marked resolved.')
    return toConversationSummary(updated, advisorLookup)
  }

  // ── POST /conversations/:conversationId/handback ────────────────────────
  // Returns the same conversation thread to the AI (unlike Resolve, which closes the
  // thread and loses message-history context for the next one).
  static Handback = async (publicId: string, auth: AccessTokenClaims) => {
    const conversation = await getOwnedConversation(publicId, auth)
    if (conversation.mode !== 'HUMAN_ADVISOR') {
      throw createError('Conversation is not currently handled by an advisor', 409, {}, 'CONFLICT')
    }

    const updated = await ConversationsRepo.handbackConversation(conversation.id)
    const advisorLookup = await buildAdvisorLookup([updated.student.assigned_advisor_id])
    logger.info({ conversationId: publicId, by: auth.sub }, 'Conversation handed back to AI.')
    return toConversationSummary(updated, advisorLookup)
  }
}
