import prisma from '../../database/prisma.js'
import { StudentStatus, type Prisma } from '../../generated/prisma/index.js'

// Open = still in the pipeline (not COMPLETED/CLOSED), matching how advisor
// workload is counted in AdvisorsRepo.
const OPEN = { notIn: [StudentStatus.COMPLETED, StudentStatus.CLOSED] }

const studentName = {
  select: {
    public_id: true,
    contact: { select: { first_name: true, last_name: true } },
  },
} as const

// Combines the role scope with an extra filter. Always AND them — spreading
// ({ ...scope, assigned_advisor_id: null }) would silently replace the
// advisor scope's own assigned_advisor_id and count the whole organisation.
const within = (
  scope: Prisma.StudentWhereInput,
  extra: Prisma.StudentWhereInput,
): Prisma.StudentWhereInput => ({ AND: [scope, extra] })

// Read-only aggregates. `scope` narrows students to one advisor for ADVISOR.
export class DashboardRepo {
  static leadCounts = async (
    scope: Prisma.StudentWhereInput,
    dayStart: Date,
    weekStart: Date,
  ) => {
    const [
      total,
      newThisWeek,
      newToday,
      newTodayFromTelegram,
      unassigned,
      openTotal,
      openAssigned,
      byStatus,
    ] = await Promise.all([
      prisma.student.count({ where: scope }),
      prisma.student.count({
        where: within(scope, { created_at: { gte: weekStart } }),
      }),
      prisma.student.count({
        where: within(scope, { created_at: { gte: dayStart } }),
      }),
      prisma.student.count({
        where: within(scope, {
          created_at: { gte: dayStart },
          contact: { provider_type: 'TELEGRAM' },
        }),
      }),
      prisma.student.count({
        where: within(scope, { assigned_advisor_id: null, status: OPEN }),
      }),
      prisma.student.count({ where: within(scope, { status: OPEN }) }),
      prisma.student.count({
        where: within(scope, {
          status: OPEN,
          assigned_advisor_id: { not: null },
        }),
      }),
      prisma.student.groupBy({
        by: ['status'],
        where: scope,
        orderBy: { status: 'asc' },
        _count: { _all: true },
      }),
    ])

    return {
      total,
      newThisWeek,
      newToday,
      newTodayFromTelegram,
      unassigned,
      openTotal,
      openAssigned,
      byStatus,
    }
  }

  static conversationCounts = async (scope: Prisma.StudentWhereInput) => {
    const [active, escalated] = await Promise.all([
      prisma.conversations.count({
        where: { status: 'ACTIVE', student: scope },
      }),
      prisma.conversations.count({
        where: { status: 'ESCALATED', student: scope },
      }),
    ])
    return { active, escalated }
  }

  static destinations = async (scope: Prisma.StudentWhereInput) => {
    return prisma.student.findMany({
      where: scope,
      select: { target_destinations: true },
    })
  }

  // Soonest due first, so overdue follow-ups naturally lead the list.
  static pendingFollowUps = async (
    advisorUserId: string | undefined,
    limit: number,
  ) => {
    return prisma.followUp.findMany({
      where: {
        status: 'PENDING',
        ...(advisorUserId !== undefined && { advisor_id: advisorUserId }),
      },
      orderBy: { due_at: 'asc' },
      take: limit,
      include: { student: studentName },
    })
  }

  // Every active advisor account (with or without a capacity profile) — just
  // the caller for ADVISOR. Workload counts are added by the service.
  static activeAdvisors = async (advisorUserId: string | undefined) => {
    return prisma.users.findMany({
      where: {
        role: 'ADVISOR',
        status: 'ACTIVE',
        ...(advisorUserId !== undefined && { id: advisorUserId }),
      },
      select: {
        id: true,
        public_id: true,
        full_name: true,
        advisor_profile: { select: { max_capacity: true } },
      },
    })
  }

  // Each student's latest run (one row per student), newest first, with that
  // run's single top-scoring recommendation.
  static recentRuns = async (
    scope: Prisma.StudentWhereInput,
    limit: number,
  ) => {
    return prisma.recommendationRun.findMany({
      where: { student: scope },
      orderBy: { created_at: 'desc' },
      distinct: ['student_id'],
      take: limit,
      include: {
        student: studentName,
        recommendations: {
          // public_id breaks score ties so the shown program doesn't flip
          // between equally-scored programs from one load to the next.
          orderBy: [{ overall_score: 'desc' }, { public_id: 'asc' }],
          take: 1,
          include: {
            program: {
              select: {
                public_id: true,
                name: true,
                school: {
                  select: { public_id: true, name: true, country: true },
                },
              },
            },
          },
        },
      },
    })
  }
}
