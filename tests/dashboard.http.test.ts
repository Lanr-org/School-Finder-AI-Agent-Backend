import './setup-env'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import app from '../src/app'
import { generateAcessToken } from '../src/common/security/token'
import AuthRepo from '../src/modules/auth/auth.repository'
import { AdvisorsRepo } from '../src/modules/advisors/advisors.repository'
import { FollowUpsRepo } from '../src/modules/followUps/followUps.repository'
import { DashboardRepo } from '../src/modules/dashboard/dashboard.repository'
import { topDestinations } from '../src/modules/dashboard/dashboard.service'

vi.mock('../src/modules/auth/auth.repository', () => ({
  default: { findUser: vi.fn(), findAuthSessionById: vi.fn() },
}))
vi.mock('../src/modules/advisors/advisors.repository', () => ({
  AdvisorsRepo: {
    countActiveStudentsForAdvisors: vi.fn(),
  },
}))
vi.mock('../src/modules/followUps/followUps.repository', () => ({
  FollowUpsRepo: { countPendingForAdvisors: vi.fn() },
}))
vi.mock('../src/modules/dashboard/dashboard.repository', () => ({
  DashboardRepo: {
    leadCounts: vi.fn(),
    conversationCounts: vi.fn(),
    destinations: vi.fn(),
    pendingFollowUps: vi.fn(),
    recentRuns: vi.fn(),
    activeAdvisors: vi.fn(),
  },
}))

const authRepoMock = vi.mocked(AuthRepo)
const advisorsRepoMock = vi.mocked(AdvisorsRepo)
const followUpsRepoMock = vi.mocked(FollowUpsRepo)
const dashboardRepoMock = vi.mocked(DashboardRepo)

const ADMIN_ID = 'admin-user-uuid-0001'
const ADVISOR_ID = 'advisor-user-uuid-0001'
const OTHER_ADVISOR_ID = 'advisor-user-uuid-0002'
const SESSION_ID = 'session-uuid-0001'

const signIn = (role: 'ADMIN' | 'ADVISOR' | 'OPERATIONS', id: string) => {
  authRepoMock.findUser.mockResolvedValue({
    id,
    public_id: 'USR-0001',
    full_name: 'Someone',
    email: 'someone@example.com',
    role,
    status: 'ACTIVE',
    token_version: 0,
  } as any)
  authRepoMock.findAuthSessionById.mockResolvedValue({
    id: SESSION_ID,
    user_id: id,
    revoked_at: null,
    expires_at: new Date(Date.now() + 3_600_000),
  } as any)
  return generateAcessToken(id, SESSION_ID, role, 0)
}

type Summary = {
  scope: string
  leads: {
    total: number
    byStatus: Record<string, number>
    assignedShareOfOpen: number
  }
  topDestinations: { country: string; leads: number; percent: number }[]
  advisorWorkload: { advisorId: string; activeStudents: number }[]
  pendingFollowUps: unknown[] | null
  recentRecommendations: unknown[] | null
}

const summaryOf = (res: { body: unknown }) =>
  (res.body as { data: Summary }).data

describe('Dashboard API — GET /api/v1/dashboard/summary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dashboardRepoMock.leadCounts.mockResolvedValue({
      total: 10,
      newThisWeek: 4,
      newToday: 2,
      newTodayFromTelegram: 1,
      unassigned: 3,
      openTotal: 8,
      openAssigned: 6,
      byStatus: [
        { status: 'NEW', _count: { _all: 2 } },
        { status: 'ASSIGNED', _count: { _all: 5 } },
      ],
    } as any)
    dashboardRepoMock.conversationCounts.mockResolvedValue({
      active: 7,
      escalated: 2,
    })
    dashboardRepoMock.destinations.mockResolvedValue([
      { target_destinations: ['UK', 'Canada'] },
      { target_destinations: ['United Kingdom'] },
      { target_destinations: [] },
    ])
    dashboardRepoMock.pendingFollowUps.mockResolvedValue([
      {
        public_id: 'FUP-1001',
        description: 'Chase IELTS result',
        due_at: new Date('2020-01-01T00:00:00.000Z'),
        priority: 'HIGH',
        student: {
          public_id: 'STU-1927',
          contact: { first_name: 'QA', last_name: 'Applicant' },
        },
      },
    ] as any)
    dashboardRepoMock.recentRuns.mockResolvedValue([
      {
        created_at: new Date('2026-09-25T10:00:00.000Z'),
        student: {
          public_id: 'STU-1927',
          contact: { first_name: 'QA', last_name: null },
        },
        recommendations: [
          {
            overall_score: '88.50',
            program: {
              public_id: 'PRG-5658',
              name: 'MSc Data Science',
              school: {
                public_id: 'SCH-2048',
                name: 'Northbridge',
                country: 'United Kingdom',
              },
            },
          },
        ],
      },
      // A run with no scored programs is skipped, not rendered as a blank row.
      {
        created_at: new Date(),
        student: {
          public_id: 'STU-1',
          contact: { first_name: 'X', last_name: null },
        },
        recommendations: [],
      },
    ] as any)
    // Honours the advisor filter like the real query does. Bayo has no
    // capacity profile — he must still appear (maxCapacity null).
    const advisors = [
      {
        id: ADVISOR_ID,
        public_id: 'USR-AAAAAAAAAAAA',
        full_name: 'Amina Advisor',
        advisor_profile: { max_capacity: 20 },
      },
      {
        id: OTHER_ADVISOR_ID,
        public_id: 'USR-BBBBBBBBBBBB',
        full_name: 'Bayo Advisor',
        advisor_profile: null,
      },
    ]
    dashboardRepoMock.activeAdvisors.mockImplementation(
      async (advisorUserId?: string) =>
        advisors.filter(
          (advisor) =>
            advisorUserId === undefined || advisor.id === advisorUserId,
        ) as any,
    )
    advisorsRepoMock.countActiveStudentsForAdvisors.mockResolvedValue(
      new Map([
        [ADVISOR_ID, 6],
        [OTHER_ADVISOR_ID, 9],
      ]),
    )
    followUpsRepoMock.countPendingForAdvisors.mockResolvedValue(
      new Map([[ADVISOR_ID, 2]]),
    )
  })

  it('gives ADMIN an unscoped summary with every section', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/summary')
      .set('Authorization', `Bearer ${signIn('ADMIN', ADMIN_ID)}`)

    expect(res.status).toBe(200)
    expect(dashboardRepoMock.leadCounts).toHaveBeenCalledWith(
      {},
      expect.any(Date),
      expect.any(Date),
    )
    expect(dashboardRepoMock.pendingFollowUps).toHaveBeenCalledWith(
      undefined,
      5,
    )
    const summary = summaryOf(res)
    expect(summary.scope).toBe('ALL')
    expect(summary.leads.total).toBe(10)
    // Every status present, zero-filled.
    expect(summary.leads.byStatus).toEqual({
      NEW: 2,
      AWAITING_ASSIGNMENT: 0,
      ASSIGNED: 5,
      FOLLOW_UP: 0,
      APPLICATION_STARTED: 0,
      COMPLETED: 0,
      CLOSED: 0,
    })
    expect(summary.leads.assignedShareOfOpen).toBe(75)
    // Busiest advisor first; all advisors with a profile for ADMIN.
    expect(summary.advisorWorkload.map((row) => row.advisorId)).toEqual([
      'USR-BBBBBBBBBBBB',
      'USR-AAAAAAAAAAAA',
    ])
    // An advisor with no capacity profile is still listed, as unlimited.
    expect(summary.advisorWorkload[0]).toMatchObject({
      advisorId: 'USR-BBBBBBBBBBBB',
      activeStudents: 9,
      maxCapacity: null,
    })
    expect(dashboardRepoMock.activeAdvisors).toHaveBeenCalledWith(undefined)
    expect(summary.pendingFollowUps).toEqual([
      expect.objectContaining({
        studentId: 'STU-1927',
        studentName: 'QA Applicant',
        overdue: true,
      }),
    ])
    expect(summary.recentRecommendations).toHaveLength(1)
    expect(summary.recentRecommendations?.[0]).toMatchObject({
      overallScore: 88.5,
      country: 'United Kingdom',
    })
  })

  it('scopes ADVISOR to their own students, follow-ups, and workload row', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/summary?advisorId=USR-BBBBBBBBBBBB')
      .set('Authorization', `Bearer ${signIn('ADVISOR', ADVISOR_ID)}`)

    expect(res.status).toBe(200)
    const ownScope = { assigned_advisor_id: ADVISOR_ID }
    expect(dashboardRepoMock.leadCounts).toHaveBeenCalledWith(
      ownScope,
      expect.any(Date),
      expect.any(Date),
    )
    expect(dashboardRepoMock.conversationCounts).toHaveBeenCalledWith(ownScope)
    expect(dashboardRepoMock.recentRuns).toHaveBeenCalledWith(ownScope, 5)
    expect(dashboardRepoMock.pendingFollowUps).toHaveBeenCalledWith(
      ADVISOR_ID,
      5,
    )
    const summary = summaryOf(res)
    expect(summary.scope).toBe('OWN')
    // Only their own row, whatever the client asks for.
    expect(summary.advisorWorkload.map((row) => row.advisorId)).toEqual([
      'USR-AAAAAAAAAAAA',
    ])
  })

  it('gives OPERATIONS counts and charts but no student-level lists', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/summary')
      .set('Authorization', `Bearer ${signIn('OPERATIONS', 'ops-uuid')}`)

    expect(res.status).toBe(200)
    const summary = summaryOf(res)
    expect(summary.leads.total).toBe(10)
    expect(summary.pendingFollowUps).toBeNull()
    expect(summary.recentRecommendations).toBeNull()
    expect(dashboardRepoMock.pendingFollowUps).not.toHaveBeenCalled()
    expect(dashboardRepoMock.recentRuns).not.toHaveBeenCalled()
  })

  it('returns 401 without a bearer token', async () => {
    const res = await request(app).get('/api/v1/dashboard/summary')
    expect(res.status).toBe(401)
  })
})

describe('topDestinations', () => {
  it('merges aliases, counts each student once per country, and ranks by leads', () => {
    expect(
      topDestinations(
        [
          { target_destinations: ['UK', 'Canada'] },
          { target_destinations: ['United Kingdom', 'UK'] },
          { target_destinations: [] },
        ],
        4,
        5,
      ),
    ).toEqual([
      { country: 'United Kingdom', leads: 2, percent: 50 },
      { country: 'Canada', leads: 1, percent: 25 },
    ])
  })

  it('merges Telegram upper-case values with other casings and shows them in title case', () => {
    expect(
      topDestinations(
        [
          { target_destinations: ['CANADA'] },
          { target_destinations: ['Canada'] },
          { target_destinations: ['IRELAND', 'USA'] },
        ],
        3,
        5,
      ),
    ).toEqual([
      { country: 'Canada', leads: 2, percent: 67 },
      { country: 'Ireland', leads: 1, percent: 33 },
      { country: 'United States', leads: 1, percent: 33 },
    ])
  })

  it('returns 0% rather than dividing by zero when there are no leads', () => {
    expect(
      topDestinations([{ target_destinations: ['Canada'] }], 0, 5),
    ).toEqual([{ country: 'Canada', leads: 1, percent: 0 }])
  })
})
