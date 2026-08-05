import prisma from '../../database/prisma.js'
import { ContactProvider, ConversationMode, ConversationStatus, StudentStatus } from '../../generated/prisma/index.js'
import { CreateContactStudentTransactionData } from './contacts.types.js'

export class ContactsRepo {
  /**
   * Finds an existing Contact by provider identity and includes active student context.
   */
  static findContactWithActiveStudent = async (providerType: ContactProvider, providerUserId: string) => {
    return prisma.contacts.findUnique({
      where: {
        provider_type_provider_user_id: {
          provider_type: providerType,
          provider_user_id: providerUserId,
        },
      },
      include: {
        student: {
          include: {
            conversations: {
              where: { status: ConversationStatus.ACTIVE },
              take: 1,
              orderBy: { created_at: 'desc' },
            },
          },
        },
      },
    })
  }

  /**
   * Creates a new active Conversation thread for an existing student.
   */
  static createStudentConversation = async (studentId: string) => {
    return prisma.conversations.create({
      data: {
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

      const newConversation = await tx.conversations.create({
        data: {
          student_id: newStudent.id,
          mode: ConversationMode.AI_BOT,
          status: ConversationStatus.ACTIVE,
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
