import prisma from '../../database/prisma.js'
import {
  StudentStatus,
  type FollowUpPriority,
  type Prisma,
} from '../../generated/prisma/index.js'
import type { ListFollowUpsFilters } from './followUps.types.js'
import { StudentStatusHistoryRepo } from '../students/statusHistory.repository.js'

export class FollowUpsRepo {
  static findByPublicId = async (studentId: string, followUpId: string) => {
    return prisma.followUp.findFirst({
      where: { public_id: followUpId, student_id: studentId },
    })
  }

  static listForStudent = async (
    studentId: string,
    filters: ListFollowUpsFilters,
  ) => {
    const where: Prisma.FollowUpWhereInput = {
      student_id: studentId,
      ...(filters.status !== undefined && { status: filters.status }),
    }

    const [followUps, total] = await prisma.$transaction([
      prisma.followUp.findMany({
        where,
        orderBy: { due_at: 'asc' },
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      prisma.followUp.count({ where }),
    ])

    return { followUps, total }
  }

  static listForAdvisor = async (
    advisorUserId: string,
    filters: ListFollowUpsFilters,
  ) => {
    const where: Prisma.FollowUpWhereInput = {
      advisor_id: advisorUserId,
      ...(filters.status !== undefined && { status: filters.status }),
    }

    const [followUps, total] = await prisma.$transaction([
      prisma.followUp.findMany({
        where,
        include: { student: { select: { public_id: true } } },
        orderBy: { due_at: 'asc' },
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      prisma.followUp.count({ where }),
    ])

    return { followUps, total }
  }

  /**
   * Creates the follow-up and, only if the student is currently ASSIGNED,
   * advances their status to FOLLOW_UP — never regresses a student who has
   * already moved further along (APPLICATION_STARTED/COMPLETED/CLOSED), and
   * never promotes from NEW/AWAITING_ASSIGNMENT since no advisor relationship
   * exists yet to follow up on.
   */
  static createFollowUpAndAdvanceStatus = async (data: {
    publicId: string
    studentId: string
    advisorId: string
    dueAt: Date
    priority: FollowUpPriority
    description: string
  }) => {
    return prisma.$transaction(async (tx) => {
      const followUp = await tx.followUp.create({
        data: {
          public_id: data.publicId,
          student_id: data.studentId,
          advisor_id: data.advisorId,
          due_at: data.dueAt,
          priority: data.priority,
          description: data.description,
        },
      })

      await StudentStatusHistoryRepo.transition(tx, {
        studentId: data.studentId,
        to: StudentStatus.FOLLOW_UP,
        allowedFrom: [StudentStatus.ASSIGNED],
        source: 'FOLLOW_UP_CREATED',
        changedBy: data.advisorId,
      })

      return followUp
    })
  }

  static updateFollowUp = async (
    id: string,
    data: {
      dueAt?: Date | undefined
      priority?: FollowUpPriority | undefined
      description?: string | undefined
    },
  ) => {
    return prisma.followUp.update({
      where: { id },
      data: {
        ...(data.dueAt !== undefined && { due_at: data.dueAt }),
        ...(data.priority !== undefined && { priority: data.priority }),
        ...(data.description !== undefined && {
          description: data.description,
        }),
      },
    })
  }

  static completeFollowUp = async (id: string) => {
    return prisma.followUp.update({
      where: { id },
      data: { status: 'COMPLETED', completed_at: new Date() },
    })
  }

  static cancelFollowUp = async (id: string) => {
    return prisma.followUp.update({
      where: { id },
      data: { status: 'CANCELED', canceled_at: new Date() },
    })
  }

  // "Due" count for a single advisor — PENDING already covers OVERDUE rows,
  // since OVERDUE is derived at read time from a past-due PENDING row, never stored.
  static countPendingForAdvisor = async (advisorUserId: string) => {
    return prisma.followUp.count({
      where: { advisor_id: advisorUserId, status: 'PENDING' },
    })
  }

  // Bulk version for list views — one grouped query instead of N per-advisor counts.
  static countPendingForAdvisors = async (
    advisorUserIds: string[],
  ): Promise<Map<string, number>> => {
    if (advisorUserIds.length === 0) return new Map()

    const grouped = await prisma.followUp.groupBy({
      by: ['advisor_id'],
      where: { advisor_id: { in: advisorUserIds }, status: 'PENDING' },
      _count: { _all: true },
    })

    return new Map(grouped.map((row) => [row.advisor_id, row._count._all]))
  }
}
