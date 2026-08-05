import { logger } from '../../config/logger.js'
import { StudentStatus } from '../../generated/prisma/index.js'
import { StudentsRepo } from './students.repository.js'
import { UpdateStudentPreferencesDTO } from './students.types.js'

export class StudentsService {
  /**
   * Retrieves student profile by UUID.
   */
  static getStudentById = async (studentId: string) => {
    const student = await StudentsRepo.findStudentById(studentId)
    if (!student) {
      throw new Error('Student profile not found')
    }
    return student
  }

  /**
   * Retrieves student profile by public display ID (e.g. STU-1048).
   */
  static getStudentByPublicId = async (publicId: string) => {
    const student = await StudentsRepo.findStudentByPublicId(publicId)
    if (!student) {
      throw new Error(`Student with public ID ${publicId} not found`)
    }
    return student
  }

  /**
   * Updates student onboarding preferences.
   */
  static updateStudentPreferences = async (studentId: string, dto: UpdateStudentPreferencesDTO) => {
    logger.info({ studentId }, 'Updating student onboarding preferences.')
    return StudentsRepo.updateStudentPreferences(studentId, dto)
  }

  /**
   * Updates student lifecycle status.
   */
  static updateStudentStatus = async (studentId: string, newStatus: StudentStatus) => {
    logger.info({ studentId, newStatus }, 'Updating student lifecycle status.')
    return StudentsRepo.updateStudentStatus(studentId, newStatus)
  }

  /**
   * Assigns an advisor to a student.
   */
  static assignAdvisorToStudent = async (studentId: string, advisorId: string) => {
    logger.info({ studentId, advisorId }, 'Assigning advisor to student.')
    return StudentsRepo.assignAdvisorToStudent(studentId, advisorId)
  }
}
