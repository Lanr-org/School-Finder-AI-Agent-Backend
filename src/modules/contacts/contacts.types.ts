import { ContactProvider } from '../../generated/prisma/index.js'

export interface ResolvedStudentContext {
  contactId: string
  studentId: string
  publicId: string
  conversationId: string
  isNewStudent: boolean
}

export interface CreateContactStudentTransactionData {
  providerType: ContactProvider
  providerUserId: string
  firstName: string
  lastName?: string | undefined
  username?: string | undefined
  publicId: string
}
