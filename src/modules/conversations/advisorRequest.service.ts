import { logger } from '../../config/logger.js'
import { createError } from '../../common/errors/AppError.js'
import {
  ConversationStatus,
  type MessageChannel,
} from '../../generated/prisma/index.js'
import { CentrifugoClient } from '../../integrations/centrifugo/services/centrifugo.client.js'
import { AUDIT_ACTIONS } from '../audit/audit.actions.js'
import { AuditService } from '../audit/audit.service.js'
import { ContactsRepo } from '../contacts/contacts.repository.js'
import { NotificationsService } from '../notifications/notifications.service.js'
import TeamRepo from '../team/team.repository.js'
import { ConversationsRepo } from './conversations.repository.js'

export interface AdvisorRequestResult {
  alreadyRequested: boolean
}

// A student asking for a human (web button or Telegram /advisor). The thread is
// flagged ESCALATED for staff but stays in AI mode, so the AI keeps helping
// until an advisor actually takes over.
export class AdvisorRequestService {
  static Request = async (
    studentId: string,
    channel: MessageChannel,
  ): Promise<AdvisorRequestResult> => {
    const student = await ConversationsRepo.findStudentForNotice(studentId)
    if (!student) {
      throw createError('Student not found', 404, {}, 'NOT_FOUND')
    }

    // After a resolve there's no open thread; start one, as the portal does.
    const conversation =
      (await ConversationsRepo.findCurrentConversation(studentId)) ??
      (await ContactsRepo.createStudentConversation(studentId))

    if (conversation.status === ConversationStatus.ESCALATED) {
      return { alreadyRequested: true }
    }

    await AuditService.withAudit(
      (tx) => ConversationsRepo.requestAdvisor(conversation.id, tx),
      () => ({
        action: AUDIT_ACTIONS.CONVERSATION_ADVISOR_REQUESTED,
        entityType: 'conversation',
        entityId: conversation.public_id,
        // Students have no staff user id, so the actor stays null (system).
        actorId: null,
        actorRole: null,
        before: { status: conversation.status },
        after: { status: ConversationStatus.ESCALATED },
        metadata: {
          studentId: student.public_id,
          conversationId: conversation.public_id,
          channel,
        },
      }),
    )

    const name =
      [student.contact.first_name, student.contact.last_name]
        .filter(Boolean)
        .join(' ') || student.public_id
    const assignedId = student.assigned_advisor_id
    // Commit is done; from here a failure must not undo the request.
    try {
      const recipients = assignedId
        ? [assignedId]
        : await TeamRepo.findActiveAdminIds()
      await NotificationsService.notify(recipients, {
        type: 'CONVERSATION',
        title: 'Student requested an advisor',
        body: assignedId
          ? `${name} (${student.public_id}) asked to talk to an advisor.`
          : `${name} (${student.public_id}) asked to talk to an advisor and has none assigned yet.`,
        // Unassigned: land on the student so the admin can use the assign modal.
        link: assignedId
          ? `/conversations/${conversation.public_id}`
          : `/students/${student.public_id}`,
      })

      await CentrifugoClient.publish('admin:dashboard', {
        event: 'conversation.status_changed',
        data: {
          conversationId: conversation.id,
          publicId: conversation.public_id,
          studentId: student.public_id,
          status: ConversationStatus.ESCALATED,
          reason: 'advisor_requested',
        },
        timestamp: new Date().toISOString(),
      })
    } catch (error) {
      logger.error(
        { error: (error as Error).message, conversationId: conversation.id },
        'Advisor request saved but staff could not be notified.',
      )
    }

    return { alreadyRequested: false }
  }
}
