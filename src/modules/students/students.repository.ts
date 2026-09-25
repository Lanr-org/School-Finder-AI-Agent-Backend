import prisma from '../../database/prisma.js'
import { StudentStatus, type Prisma } from '../../generated/prisma/index.js'
import { ListStudentsFilters, UpdateStudentPreferencesDTO } from './students.types.js'
import { StudentStatusHistoryRepo } from './statusHistory.repository.js'

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
   * Manually sets student lifecycle status and records it in status history.
   * Setting the current status again is a no-op (no history row).
   */
  static updateStudentStatus = async (studentId: string, status: StudentStatus, changedBy: string) => {
    return prisma.$transaction(async (tx) => {
      await StudentStatusHistoryRepo.transition(tx, { studentId, to: status, source: 'MANUAL', changedBy })
      return tx.student.findUniqueOrThrow({ where: { id: studentId } })
    })
  }

  /**
   * Assigns an advisor. Only advances status from NEW/AWAITING_ASSIGNMENT —
   * reassigning a student already in FOLLOW_UP/APPLICATION_STARTED keeps their
   * status (previously this always reset them to ASSIGNED).
   */
  static assignAdvisorToStudent = async (studentId: string, advisorId: string, changedBy: string) => {
    return prisma.$transaction(async (tx) => {
      await tx.student.update({ where: { id: studentId }, data: { assigned_advisor_id: advisorId } })
      await StudentStatusHistoryRepo.transition(tx, {
        studentId,
        to: StudentStatus.ASSIGNED,
        allowedFrom: [StudentStatus.NEW, StudentStatus.AWAITING_ASSIGNMENT],
        source: 'ADVISOR_ASSIGNED',
        changedBy,
      })
      return tx.student.findUniqueOrThrow({ where: { id: studentId } })
    })
  }

  /**
   * Clears a student's advisor assignment and moves them back to AWAITING_ASSIGNMENT —
   * except COMPLETED/CLOSED students, which keep their status (unassigning must not reopen them).
   */
  static unassignAdvisorFromStudent = async (studentId: string, changedBy: string) => {
    return prisma.$transaction(async (tx) => {
      await tx.student.update({ where: { id: studentId }, data: { assigned_advisor_id: null } })
      await StudentStatusHistoryRepo.transition(tx, {
        studentId,
        to: StudentStatus.AWAITING_ASSIGNMENT,
        allowedFrom: [
          StudentStatus.NEW,
          StudentStatus.ASSIGNED,
          StudentStatus.FOLLOW_UP,
          StudentStatus.APPLICATION_STARTED,
        ],
        source: 'ADVISOR_UNASSIGNED',
        changedBy,
      })
      return tx.student.findUniqueOrThrow({ where: { id: studentId } })
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
