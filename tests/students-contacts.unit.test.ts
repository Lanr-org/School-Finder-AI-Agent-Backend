import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ContactsService } from '../src/modules/contacts/contacts.service.js'
import { ContactsRepo } from '../src/modules/contacts/contacts.repository.js'
import { StudentsService } from '../src/modules/students/students.service.js'
import { StudentsRepo } from '../src/modules/students/students.repository.js'

describe('ContactsService & StudentsService Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('ContactsService.resolveTelegramContact', () => {
    const mockExistingStudent = (conversations: { id: string }[]) => ({
      id: 'student-uuid-1',
      public_id: 'STU-1048',
      contact_id: 'contact-uuid-1',
      conversations,
    })

    it('finds the student through their Telegram identity, with the current conversation', async () => {
      vi.spyOn(ContactsRepo, 'findStudentByTelegramId').mockResolvedValue(
        mockExistingStudent([{ id: 'conv-uuid-1' }]) as any,
      )

      const result = await ContactsService.resolveTelegramContact({
        providerType: 'TELEGRAM',
        providerUserId: '987654321',
        firstName: 'Chinedu',
      })

      expect(ContactsRepo.findStudentByTelegramId).toHaveBeenCalledWith('987654321')
      expect(result).toEqual({
        contactId: 'contact-uuid-1',
        studentId: 'student-uuid-1',
        publicId: 'STU-1048',
        conversationId: 'conv-uuid-1',
        isNewStudent: false,
      })
    })

    it('starts a new conversation when the last one was resolved', async () => {
      vi.spyOn(ContactsRepo, 'findStudentByTelegramId').mockResolvedValue(mockExistingStudent([]) as any)
      vi.spyOn(ContactsRepo, 'createStudentConversation').mockResolvedValue({ id: 'conv-uuid-2' } as any)

      const result = await ContactsService.resolveTelegramContact({
        providerType: 'TELEGRAM',
        providerUserId: '987654321',
        firstName: 'Chinedu',
      })

      expect(ContactsRepo.createStudentConversation).toHaveBeenCalledWith('student-uuid-1')
      expect(result.conversationId).toBe('conv-uuid-2')
    })

    it('should register a new student when no student has this Telegram account', async () => {
      vi.spyOn(ContactsRepo, 'findStudentByTelegramId').mockResolvedValue(null)
      vi.spyOn(ContactsRepo, 'registerStudentWithContact').mockResolvedValue({
        contactId: 'new-contact-uuid',
        studentId: 'new-student-uuid',
        publicId: 'STU-9999',
        conversationId: 'new-conv-uuid',
      })

      const result = await ContactsService.resolveTelegramContact({
        providerType: 'TELEGRAM',
        providerUserId: '11223344',
        firstName: 'Amina',
      })

      expect(ContactsRepo.registerStudentWithContact).toHaveBeenCalledWith({
        providerType: 'TELEGRAM',
        providerUserId: '11223344',
        firstName: 'Amina',
        lastName: undefined,
        username: undefined,
        publicId: expect.stringMatching(/^STU-\d{4}$/),
      })

      expect(result).toEqual({
        contactId: 'new-contact-uuid',
        studentId: 'new-student-uuid',
        publicId: 'STU-9999',
        conversationId: 'new-conv-uuid',
        isNewStudent: true,
      })
    })
  })

  describe('StudentsService Unit Tests', () => {
    it('should call StudentsRepo.updateStudentPreferences with correct parameters', async () => {
      vi.spyOn(StudentsRepo, 'updateStudentPreferences').mockResolvedValue({
        id: 'student-uuid-1',
        study_level: 'MASTERS',
        target_destinations: ['CANADA'],
      } as any)

      const result = await StudentsService.updateStudentPreferences('student-uuid-1', {
        studyLevel: 'MASTERS',
        targetDestinations: ['CANADA'],
      })

      expect(StudentsRepo.updateStudentPreferences).toHaveBeenCalledWith('student-uuid-1', {
        studyLevel: 'MASTERS',
        targetDestinations: ['CANADA'],
      })
      expect(result).toBeDefined()
    })

    it('should throw a 404 NOT_FOUND error if getStudentById cannot find the student', async () => {
      vi.spyOn(StudentsRepo, 'findStudentById').mockResolvedValue(null)

      await expect(StudentsService.getStudentById('non-existent-id')).rejects.toMatchObject({
        message: 'Student not found',
        statusCode: 404,
        code: 'NOT_FOUND',
      })
    })
  })
})
