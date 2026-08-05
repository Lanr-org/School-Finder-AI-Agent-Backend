import { logger } from '../../config/logger.js'
import { ProviderContactDTO } from '../../integrations/telegram/mappers/telegram-user.mapper.js'
import { ContactProvider } from '../../generated/prisma/index.js'
import { ContactsRepo } from './contacts.repository.js'
import { ResolvedStudentContext } from './contacts.types.js'

export class ContactsService {
  private static generatePublicStudentId = (): string => {
    const randomNum = Math.floor(1000 + Math.random() * 9000)
    return `STU-${randomNum}`
  }

  /**
   * Business Logic: Resolves a Telegram contact by coordinating repository queries.
   */
  static resolveTelegramContact = async (
    contactDTO: ProviderContactDTO
  ): Promise<ResolvedStudentContext> => {
    const providerType = ContactProvider.TELEGRAM
    const providerUserId = contactDTO.providerUserId

    // 1. Search DB via Repository
    const existingContact = await ContactsRepo.findContactWithActiveStudent(providerType, providerUserId)

    // 2. Handle Existing Student
    if (existingContact && existingContact.student) {
      const activeConv = existingContact.student.conversations[0]

      if (activeConv) {
        return {
          contactId: existingContact.id,
          studentId: existingContact.student.id,
          publicId: existingContact.student.public_id,
          conversationId: activeConv.id,
          isNewStudent: false,
        }
      }

      // Create new conversation thread if previous was resolved
      const newConv = await ContactsRepo.createStudentConversation(existingContact.student.id)


      return {
        contactId: existingContact.id,
        studentId: existingContact.student.id,
        publicId: existingContact.student.public_id,
        conversationId: newConv.id,
        isNewStudent: false,
      }
    }

    // 3. Handle New Student Registration via Repository
    logger.info({ providerUserId, name: contactDTO.firstName }, 'Registering new Student via Telegram.')

    const publicId = ContactsService.generatePublicStudentId()

    const created = await ContactsRepo.registerStudentWithContact({
      providerType,
      providerUserId,
      firstName: contactDTO.firstName,
      lastName: contactDTO.lastName,
      username: contactDTO.username,
      publicId,
    })

    return {
      ...created,
      isNewStudent: true,
    }
  }
}
