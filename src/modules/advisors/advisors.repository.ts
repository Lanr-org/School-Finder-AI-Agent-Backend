import prisma from '../../database/prisma.js'
import {
  StudentStatus,
  type AdvisorAvailability,
} from '../../generated/prisma/index.js'

export class AdvisorsRepo {
  static findProfileByUserId = async (userId: string) => {
    return prisma.advisorProfile.findUnique({ where: { user_id: userId } })
  }

  static findAllProfiles = async () => {
    return prisma.advisorProfile.findMany({ orderBy: { created_at: 'desc' } })
  }

  static createProfile = async (
    userId: string,
    data: {
      availability?: AdvisorAvailability | undefined
      maxCapacity?: number | null | undefined
    },
  ) => {
    return prisma.advisorProfile.create({
      data: {
        user_id: userId,
        ...(data.availability !== undefined && {
          availability: data.availability,
        }),
        ...(data.maxCapacity !== undefined && {
          max_capacity: data.maxCapacity,
        }),
      },
    })
  }

  static updateProfile = async (
    userId: string,
    data: {
      availability?: AdvisorAvailability | undefined
      maxCapacity?: number | null | undefined
    },
  ) => {
    return prisma.advisorProfile.update({
      where: { user_id: userId },
      data: {
        ...(data.availability !== undefined && {
          availability: data.availability,
        }),
        ...(data.maxCapacity !== undefined && {
          max_capacity: data.maxCapacity,
        }),
      },
    })
  }

  // "Active" workload — matches AGENTS.md: never store a redundant counter,
  // derive it from assigned non-closed students.
  static countActiveStudentsForAdvisor = async (advisorUserId: string) => {
    return prisma.student.count({
      where: {
        assigned_advisor_id: advisorUserId,
        status: { notIn: [StudentStatus.COMPLETED, StudentStatus.CLOSED] },
      },
    })
  }

  // Bulk version for list views — one grouped query instead of N per-advisor counts.
  static countActiveStudentsForAdvisors = async (
    advisorUserIds: string[],
  ): Promise<Map<string, number>> => {
    if (advisorUserIds.length === 0) return new Map()

    const grouped = await prisma.student.groupBy({
      by: ['assigned_advisor_id'],
      where: {
        assigned_advisor_id: { in: advisorUserIds },
        status: { notIn: [StudentStatus.COMPLETED, StudentStatus.CLOSED] },
      },
      _count: { _all: true },
    })

    return new Map(
      grouped
        .filter(
          (row): row is typeof row & { assigned_advisor_id: string } =>
            row.assigned_advisor_id !== null,
        )
        .map((row) => [row.assigned_advisor_id, row._count._all]),
    )
  }
}
