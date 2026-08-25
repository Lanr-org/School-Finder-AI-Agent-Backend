import prisma from '../../database/prisma.js'
import { StudentStatus, type Prisma } from '../../generated/prisma/index.js'
import { ListStudentsFilters, UpdateStudentPreferencesDTO } from './students.types.js'

const withContact = { include: { contact: true } } as const

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

  /**
   * Clears a student's advisor assignment and reverts status to AWAITING_ASSIGNMENT.
   */
  static unassignAdvisorFromStudent = async (studentId: string) => {
    return prisma.student.update({
      where: { id: studentId },
      data: {
        assigned_advisor_id: null,
        status: StudentStatus.AWAITING_ASSIGNMENT,
      },
    })
  }

  /**
   * Lists students with optional status/advisor/search filters, newest first.
   */
  static listStudents = async (filters: ListStudentsFilters) => {
    const where: Prisma.StudentWhereInput = {
      ...(filters.status !== undefined && { status: filters.status }),
      ...(filters.advisorUserId !== undefined && { assigned_advisor_id: filters.advisorUserId }),
      ...(filters.search !== undefined && {
        OR: [
          { public_id: { contains: filters.search, mode: 'insensitive' } },
          { contact: { first_name: { contains: filters.search, mode: 'insensitive' } } },
          { contact: { last_name: { contains: filters.search, mode: 'insensitive' } } },
          { contact: { email: { contains: filters.search, mode: 'insensitive' } } },
        ],
      }),
    }

    const [students, total] = await prisma.$transaction([
      prisma.student.findMany({
        where,
        ...withContact,
        orderBy: { created_at: 'desc' },
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      prisma.student.count({ where }),
    ])

    return { students, total }
  }
}
