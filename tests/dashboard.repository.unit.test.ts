import './setup-env'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import prisma from '../src/database/prisma'
import { DashboardRepo } from '../src/modules/dashboard/dashboard.repository'

vi.mock('../src/database/prisma', () => ({
  default: {
    student: { count: vi.fn(async () => 0), groupBy: vi.fn(async () => []) },
    recommendationRun: { findMany: vi.fn(async () => []) },
  },
}))

const prismaMock = vi.mocked(prisma, true)

// Regression: the advisor scope used to be spread into each filter, so a
// filter that also sets assigned_advisor_id (e.g. "unassigned") silently
// replaced the scope and counted the whole organisation.
describe('DashboardRepo scoping', () => {
  beforeEach(() => vi.clearAllMocks())

  it('keeps the advisor scope on every lead count, including the unassigned one', async () => {
    const scope = { assigned_advisor_id: 'advisor-1' }

    await DashboardRepo.leadCounts(scope, new Date(), new Date())

    const wheres = prismaMock.student.count.mock.calls.map(
      ([args]) => (args as { where: unknown }).where,
    )
    expect(wheres).toHaveLength(7)
    // The plain total uses the scope directly; every other count ANDs it in.
    expect(wheres[0]).toEqual(scope)
    for (const where of wheres.slice(1)) {
      expect(where).toMatchObject({ AND: [scope, expect.any(Object)] })
    }
    expect(wheres).toContainEqual({
      AND: [scope, { assigned_advisor_id: null, status: expect.any(Object) }],
    })
  })

  it('asks for one run per student for recent recommendations', async () => {
    await DashboardRepo.recentRuns({}, 5)

    expect(prismaMock.recommendationRun.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        distinct: ['student_id'],
        orderBy: { created_at: 'desc' },
        take: 5,
      }),
    )
  })
})
