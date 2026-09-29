import prisma from '../../database/prisma.js'
import {
  ConversationMode,
  ConversationStatus,
  StudentIdentityProvider,
  StudentStatus,
} from '../../generated/prisma/index.js'
import { createPublicConversationId } from '../../common/security/publicId.js'
import { CreateContactStudentTransactionData } from './contacts.types.js'

export class ContactsRepo {
  /**
   * Finds the student behind a Telegram user through their TELEGRAM identity, so a Telegram
   * account linked to a web-born student resolves to that student. Includes the current thread.
   */
  static findStudentByTelegramId = async (telegramUserId: string) => {
    const identity = await prisma.studentIdentity.findUnique({
      where: { provider_subject: { provider: StudentIdentityProvider.TELEGRAM, subject: telegramUserId } },
      include: {
        student: {
          include: {
            // ESCALATED conversations are still "current" — only RESOLVED closes a thread.
            // Otherwise a student messaging mid-escalation would silently spawn a new
            // AI_BOT conversation and the AI would reply during an active human handoff.
            conversations: {
              where: { status: { in: [ConversationStatus.ACTIVE, ConversationStatus.ESCALATED] } },
              take: 1,
              orderBy: { created_at: 'desc' },
            },
          },
        },
      },
    })
    return identity?.student ?? null
  }

  /**
   * Creates a new active Conversation thread for an existing student.
   */
  static createStudentConversation = async (studentId: string) => {
    return prisma.conversations.create({
      data: {
        public_id: createPublicConversationId(),
        student_id: studentId,
        mode: ConversationMode.AI_BOT,
        status: ConversationStatus.ACTIVE,
      },
    })
  }


  /**
   * Atomically registers a new Contact, Student, and Conversation in 1 transaction.
   */
  static registerStudentWithContact = async (data: CreateContactStudentTransactionData) => {
    return prisma.$transaction(async (tx) => {
      const newContact = await tx.contacts.create({
        data: {
          provider_type: data.providerType,
          provider_user_id: data.providerUserId,
          first_name: data.firstName,
          ...(data.lastName !== undefined && { last_name: data.lastName }),
          ...(data.username !== undefined && { username: data.username }),
        },
      })


      const newStudent = await tx.student.create({
        data: {
          public_id: data.publicId,
          contact_id: newContact.id,
          status: StudentStatus.NEW,
        },
      })

      // Initial timeline entry — system-created lead, no staff user involved.
      await tx.studentStatusHistory.create({
        data: {
          student_id: newStudent.id,
          from_status: null,
          to_status: StudentStatus.NEW,
          source: 'LEAD_CREATED',
          changed_by: null,
        },
      })

      const newConversation = await tx.conversations.create({
        data: {
          public_id: createPublicConversationId(),
          student_id: newStudent.id,
          mode: ConversationMode.AI_BOT,
          status: ConversationStatus.ACTIVE,
        },
      })

      // How later Telegram messages find this student (findStudentByTelegramId).
      await tx.studentIdentity.create({
        data: {
          student_id: newStudent.id,
          provider: StudentIdentityProvider.TELEGRAM,
          subject: data.providerUserId,
          email: null,
        },
      })

      return {
        contactId: newContact.id,
        studentId: newStudent.id,
        publicId: newStudent.public_id,
        conversationId: newConversation.id,
      }
    })
  }
}
