import type { Prisma, StudentStatus } from '../../generated/prisma/index.js'
import type { AccessTokenClaims } from '../auth/auth.types.js'
import { AdvisorsRepo } from '../advisors/advisors.repository.js'
import { FollowUpsRepo } from '../followUps/followUps.repository.js'
import { normalizeCountry } from '../matching/matching.normalizers.js'
import { DashboardRepo } from './dashboard.repository.js'
import {
  DASHBOARD_TIMEZONE,
  lagosDayStart,
  lagosWeekStart,
} from './dashboard.time.js'

const STUDENT_STATUSES: StudentStatus[] = [
  'NEW',
  'AWAITING_ASSIGNMENT',
  'ASSIGNED',
  'FOLLOW_UP',
  'APPLICATION_STARTED',
  'COMPLETED',
  'CLOSED',
]

const LIST_LIMIT = 5

const percentOf = (part: number, whole: number) =>
  whole ? Math.round((part / whole) * 100) : 0

const fullName = (contact: { first_name: string; last_name: string | null }) =>
  [contact.first_name, contact.last_name].filter(Boolean).join(' ')

// Telegram's destination buttons store upper-case values ("CANADA",
// "IRELAND"); show those in title case so they read like the rest.
const displayCountry = (raw: string) => {
  const name = normalizeCountry(raw.trim())
  return name === name.toUpperCase()
    ? name.toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase())
    : name
}

// Merges aliases (UK / United Kingdom) via the matching module's
// normalizeCountry and casing differences (CANADA / Canada), counts each
// student once per country, and returns the top N with their share of all
// leads in scope.
export const topDestinations = (
  rows: { target_destinations: string[] }[],
  totalLeads: number,
  limit: number,
) => {
  const counts = new Map<string, { country: string; leads: number }>()
  for (const row of rows) {
    const countries = new Set(
      row.target_destinations.filter((raw) => raw.trim()).map(displayCountry),
    )
    for (const country of countries) {
      const key = country.toLowerCase()
      const entry = counts.get(key) ?? { country, leads: 0 }
      entry.leads += 1
      counts.set(key, entry)
    }
  }
  return [...counts.values()]
    .sort((a, b) => b.leads - a.leads || a.country.localeCompare(b.country))
    .slice(0, limit)
    .map(({ country, leads }) => ({
      country,
      leads,
      percent: percentOf(leads, totalLeads),
    }))
}

export class DashboardService {
  // One row per active advisor — everyone for ADMIN/OPERATIONS, just the
  // caller for ADVISOR — including advisors without a capacity profile
  // (maxCapacity null = unlimited). Same grouped counters as GET /advisors.
  private static workload = async (advisorUserId: string | undefined) => {
    const advisors = await DashboardRepo.activeAdvisors(advisorUserId)
    const userIds = advisors.map((advisor) => advisor.id)
    const [activeCounts, pendingCounts] = await Promise.all([
      AdvisorsRepo.countActiveStudentsForAdvisors(userIds),
      FollowUpsRepo.countPendingForAdvisors(userIds),
    ])

    return advisors
      .map((advisor) => ({
        advisorId: advisor.public_id,
        fullName: advisor.full_name,
        activeStudents: activeCounts.get(advisor.id) ?? 0,
        pendingFollowUps: pendingCounts.get(advisor.id) ?? 0,
        maxCapacity: advisor.advisor_profile?.max_capacity ?? null,
      }))
      .sort(
        (a, b) =>
          b.activeStudents - a.activeStudents ||
          a.fullName.localeCompare(b.fullName),
      )
  }

  // ── GET /dashboard/summary ──────────────────────────────────────────────
  static Summary = async (auth: AccessTokenClaims, now: Date = new Date()) => {
    const isAdvisor = auth.role === 'ADVISOR'
    // OPERATIONS can't open student records, so they get counts and charts
    // but no student-level lists (names, follow-up notes).
    const canSeeLists = auth.role !== 'OPERATIONS'
    // Scope comes from the verified token only — never from the client.
    const advisorUserId = isAdvisor ? auth.sub : undefined
    const scope: Prisma.StudentWhereInput = isAdvisor
      ? { assigned_advisor_id: auth.sub }
      : {}

    const [leads, conversations, destinationRows, workload, followUps, runs] =
      await Promise.all([
        DashboardRepo.leadCounts(
          scope,
          lagosDayStart(now),
          lagosWeekStart(now),
        ),
        DashboardRepo.conversationCounts(scope),
        DashboardRepo.destinations(scope),
        DashboardService.workload(advisorUserId),
        canSeeLists
          ? DashboardRepo.pendingFollowUps(advisorUserId, LIST_LIMIT)
          : null,
        canSeeLists ? DashboardRepo.recentRuns(scope, LIST_LIMIT) : null,
      ])

    const statusCounts = new Map(
      leads.byStatus.map((row) => [
        row.status,
        typeof row._count === 'object' ? (row._count._all ?? 0) : 0,
      ]),
    )

    return {
      scope: isAdvisor ? ('OWN' as const) : ('ALL' as const),
      generatedAt: now,
      timezone: DASHBOARD_TIMEZONE,
      leads: {
        total: leads.total,
        newThisWeek: leads.newThisWeek,
        newToday: leads.newToday,
        newTodayFromTelegram: leads.newTodayFromTelegram,
        unassigned: leads.unassigned,
        byStatus: Object.fromEntries(
          STUDENT_STATUSES.map((status) => [
            status,
            statusCounts.get(status) ?? 0,
          ]),
        ) as Record<StudentStatus, number>,
        assignedShareOfOpen: percentOf(leads.openAssigned, leads.openTotal),
      },
      conversations,
      topDestinations: topDestinations(
        destinationRows,
        leads.total,
        LIST_LIMIT,
      ),
      advisorWorkload: workload,
      pendingFollowUps:
        followUps &&
        followUps.map((followUp) => ({
          publicId: followUp.public_id,
          studentId: followUp.student.public_id,
          studentName: fullName(followUp.student.contact),
          description: followUp.description,
          dueAt: followUp.due_at,
          priority: followUp.priority,
          overdue: followUp.due_at.getTime() < now.getTime(),
        })),
      recentRecommendations:
        runs &&
        runs.flatMap((run) => {
          const top = run.recommendations[0]
          if (!top) return []
          return [
            {
              studentId: run.student.public_id,
              studentName: fullName(run.student.contact),
              program: {
                publicId: top.program.public_id,
                name: top.program.name,
              },
              school: {
                publicId: top.program.school.public_id,
                name: top.program.school.name,
              },
              country: top.program.school.country,
              overallScore: Number(top.overall_score),
              createdAt: run.created_at,
            },
          ]
        }),
    }
  }
}
