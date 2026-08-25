import prisma from '../../database/prisma.js'
import { StudentStatus } from '../../generated/prisma/index.js'
import { UpdateStudentPreferencesDTO } from './students.types.js'

export class StudentsRepo {
  /**
   * Finds student profile by database primary key UUID.
   */
  static findStudentById = async (studentId: string) => {
    return prisma.student.findUnique({
      where: { id: studentId },
      include: {
        contact: true,
        conversations: {
          take: 1,
          orderBy: { created_at: 'desc' },
        },
      },
    })
  }

  /**
   * Finds student profile by public display ID (e.g. STU-1048).
   */
  static findStudentByPublicId = async (publicId: string) => {
    return prisma.student.findUnique({
      where: { public_id: publicId },
      include: {
        contact: true,
        conversations: {
          take: 1,
          orderBy: { created_at: 'desc' },
        },
      },
    })
  }

  /**
   * Updates student onboarding preferences (study_level, target_destinations, budget_range, etc.).
   */
  static updateStudentPreferences = async (studentId: string, data: UpdateStudentPreferencesDTO) => {
    return prisma.student.update({
      where: { id: studentId },
      data: {
        ...(data.studyLevel !== undefined && { study_level: data.studyLevel }),
        ...(data.targetDestinations !== undefined && { target_destinations: data.targetDestinations }),
        ...(data.targetIntakeMonth !== undefined && { target_intake_month: data.targetIntakeMonth }),
        ...(data.targetIntakeYear !== undefined && { target_intake_year: data.targetIntakeYear }),
        ...(data.budgetRange !== undefined && { budget_range: data.budgetRange }),
        ...(data.academicBackground !== undefined && { academic_background: data.academicBackground }),
        ...(data.englishTestScore !== undefined && { english_test_score: data.englishTestScore }),
      },
    })
  }

  /**
   * Updates student lifecycle status (e.g. NEW -> AWAITING_ASSIGNMENT -> ASSIGNED -> COMPLETED).
   */
  static updateStudentStatus = async (studentId: string, status: StudentStatus) => {
    return prisma.student.update({
      where: { id: studentId },
      data: { status },
    })
  }

  /**
   * Assigns an advisor to a student profile and updates status to ASSIGNED.
   */
  static assignAdvisorToStudent = async (studentId: string, advisorId: string) => {
    return prisma.student.update({
      where: { id: studentId },
      data: {
        assigned_advisor_id: advisorId,
        status: StudentStatus.ASSIGNED,
      },
    })
  }
}
