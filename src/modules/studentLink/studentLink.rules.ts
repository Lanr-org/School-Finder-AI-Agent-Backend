import type { Prisma } from '../../generated/prisma/index.js'

// Pure merge rules (no database access), so they can be unit-tested directly.

export const mergeSideInclude = {
  contact: true,
  identities: true,
  _count: { select: { applications: true, notes: true, follow_ups: true, recommendation_runs: true } },
} as const satisfies Prisma.StudentInclude

export type MergeSide = Prisma.StudentGetPayload<{ include: typeof mergeSideInclude }>

export const hasStaffWork = (s: MergeSide) =>
  s.assigned_advisor_id !== null ||
  s._count.applications + s._count.notes + s._count.follow_ups + s._count.recommendation_runs > 0

// The student staff have worked on survives; otherwise the older one (the original lead).
// null = both have staff work, so don't merge automatically.
export const pickSurvivor = (a: MergeSide, b: MergeSide): [MergeSide, MergeSide] | null => {
  const aWork = hasStaffWork(a)
  const bWork = hasStaffWork(b)
  if (aWork && bWork) return null
  if (aWork !== bWork) return aWork ? [a, b] : [b, a]
  return a.created_at <= b.created_at ? [a, b] : [b, a]
}

// e.g. both sides already linked to *different* Google accounts.
export const identitiesClash = (a: MergeSide, b: MergeSide) =>
  a.identities.some((x) => b.identities.some((y) => y.provider === x.provider && y.subject !== x.subject))

// Survivor's values win; blanks are filled from the absorbed student.
export const fillBlanks = (survivor: MergeSide, absorbed: MergeSide) => ({
  study_level: survivor.study_level ?? absorbed.study_level,
  target_destinations: survivor.target_destinations.length
    ? survivor.target_destinations
    : absorbed.target_destinations,
  ...(survivor.target_intake_month && survivor.target_intake_year
    ? {}
    : { target_intake_month: absorbed.target_intake_month, target_intake_year: absorbed.target_intake_year }),
  budget_range: survivor.budget_range ?? absorbed.budget_range,
  academic_background: survivor.academic_background ?? absorbed.academic_background,
  english_test_score: survivor.english_test_score ?? absorbed.english_test_score,
  chosen_program_id: survivor.chosen_program_id ?? absorbed.chosen_program_id,
  study_plan_shared_at: survivor.study_plan_shared_at ?? absorbed.study_plan_shared_at,
})
