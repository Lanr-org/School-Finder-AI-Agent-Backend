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
    it('should return existing student context if contact already exists in database', async () => {
      const mockExistingContact = {
        id: 'contact-uuid-1',
        provider_type: 'TELEGRAM',
        provider_user_id: '987654321',
        first_name: 'Chinedu',
        student: {
          id: 'student-uuid-1',
          public_id: 'STU-1048',
          conversations: [
            {
              id: 'conv-uuid-1',
              status: 'ACTIVE',
              mode: 'AI_BOT',
            },
          ],
        },
      }

      vi.spyOn(ContactsRepo, 'findContactWithActiveStudent').mockResolvedValue(mockExistingContact as any)

      const result = await ContactsService.resolveTelegramContact({
        providerType: 'TELEGRAM',
        providerUserId: '987654321',
        firstName: 'Chinedu',
      })

      expect(ContactsRepo.findContactWithActiveStudent).toHaveBeenCalledWith('TELEGRAM', '987654321')
      expect(result).toEqual({
        contactId: 'contact-uuid-1',
        studentId: 'student-uuid-1',
        publicId: 'STU-1048',
        conversationId: 'conv-uuid-1',
        isNewStudent: false,
      })
    })

    it('should register a new student when contact does not exist', async () => {
      vi.spyOn(ContactsRepo, 'findContactWithActiveStudent').mockResolvedValue(null)
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

    it('should throw an error if getStudentById cannot find the student', async () => {
      vi.spyOn(StudentsRepo, 'findStudentById').mockResolvedValue(null)

      await expect(StudentsService.getStudentById('non-existent-id')).rejects.toThrow(
        'Student profile not found'
      )
    })
  })
})
