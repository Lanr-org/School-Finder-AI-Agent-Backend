import { logger } from '../../config/logger.js'
import { ProviderContactDTO } from '../../integrations/telegram/mappers/telegram-user.mapper.js'
import { ContactProvider } from '../../generated/prisma/index.js'
import { ContactsRepo } from './contacts.repository.js'
import { ResolvedStudentContext } from './contacts.types.js'
import { createPublicStudentId } from '../../common/security/publicId.js'

export class ContactsService {
  /**
   * Business Logic: Resolves a Telegram contact by coordinating repository queries.
   */
  static resolveTelegramContact = async (
    contactDTO: ProviderContactDTO
  ): Promise<ResolvedStudentContext> => {
    const providerType = ContactProvider.TELEGRAM
    const providerUserId = contactDTO.providerUserId

    // 1. Find the student through their Telegram identity (may be a linked web-born student).
    const existing = await ContactsRepo.findStudentByTelegramId(providerUserId)

    // 2. Handle Existing Student
    if (existing) {
      // Create a new conversation thread if the previous one was resolved.
      const conversationId =
        existing.conversations[0]?.id ?? (await ContactsRepo.createStudentConversation(existing.id)).id

      return {
        contactId: existing.contact_id,
        studentId: existing.id,
        publicId: existing.public_id,
        conversationId,
        isNewStudent: false,
      }
    }

    // 3. Handle New Student Registration via Repository
    logger.info({ providerUserId, name: contactDTO.firstName }, 'Registering new Student via Telegram.')

    const publicId = createPublicStudentId()

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
