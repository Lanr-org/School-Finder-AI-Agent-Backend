import './setup-env'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import app from '../src/app'
import { generateAcessToken } from '../src/common/security/token'
import AuthRepo from '../src/modules/auth/auth.repository'
import { AuditRepo } from '../src/modules/audit/audit.repository'
import { NotificationsService } from '../src/modules/notifications/notifications.service'
import TeamRepo from '../src/modules/team/team.repository'
import { ProgramsRepo } from '../src/modules/programs/programs.repository'
import {
  PageFetchError,
  fetchPageText,
} from '../src/integrations/web/fetchPage'
import type * as FetchPageModule from '../src/integrations/web/fetchPage'
import {
  ProgramSourceCheckService,
  checkQuotes,
  decideSourceCheck,
} from '../src/modules/programs/programSourceCheck'

vi.mock('../src/modules/auth/auth.repository', () => ({
  default: { findUser: vi.fn(), findAuthSessionById: vi.fn() },
}))
vi.mock('../src/modules/programs/programs.repository', () => ({
  ProgramsRepo: {
    findProgramByPublicId: vi.fn(),
    listVerifiedForSourceCheck: vi.fn(),
    setSourceCheck: vi.fn(),
  },
}))
vi.mock('../src/modules/team/team.repository', () => ({
  default: { findActiveUserIdsByRoles: vi.fn() },
}))
vi.mock('../src/modules/notifications/notifications.service', () => ({
  NotificationsService: { notify: vi.fn() },
}))
vi.mock('../src/integrations/web/fetchPage', async (importOriginal) => ({
  ...(await importOriginal<typeof FetchPageModule>()),
  fetchPageText: vi.fn(),
}))

const programsRepoMock = vi.mocked(ProgramsRepo)
const fetchMock = vi.mocked(fetchPageText)
const notifyMock = vi.mocked(NotificationsService.notify)
const auditRepoMock = vi.mocked(AuditRepo)

const PAGE = `Data Science and Computational Intelligence MSc
Duration: 1 year full-time
International
£19,500
Start dates: September 2026, January 2027`

const EVIDENCE = {
  duration: '1 year full-time',
  tuitionAmount: 'International\n£19,500',
  'intakes.0': 'September 2026',
}

const OCT_2026 = new Date('2026-10-11T05:00:00Z')

const state = (overrides: Record<string, unknown> = {}) => ({
  verified_at: new Date('2026-10-01T00:00:00Z'),
  fees_academic_year: '2026/27',
  evidence: EVIDENCE,
  source_check_failures: 0,
  ...overrides,
})

describe('checkQuotes', () => {
  it('finds every quote, ignoring spacing and curly quotes', () => {
    expect(
      checkQuotes({ a: 'International  £19,500', b: '1 year full‑time' }, PAGE),
    ).toEqual([])
  })

  it('names the quotes that are gone', () => {
    expect(
      checkQuotes(
        { ...EVIDENCE, englishRequirements: 'IELTS 6.5 overall' },
        PAGE,
      ),
    ).toEqual(['englishRequirements'])
  })
})

describe('decideSourceCheck', () => {
  it('passes when every quote is still on the page', () => {
    expect(
      decideSourceCheck(state(), { kind: 'read', text: PAGE }, OCT_2026),
    ).toEqual({
      needsRecheck: false,
      note: 'All 3 quotes still on the page',
      failures: 0,
    })
  })

  it('flags changed facts by name', () => {
    const page = PAGE.replace('£19,500', '£21,000').replace(
      'September 2026',
      'September 2027',
    )
    const decision = decideSourceCheck(
      state(),
      { kind: 'read', text: page },
      OCT_2026,
    )
    expect(decision.needsRecheck).toBe(true)
    expect(decision.note).toBe('Changed on the page: Tuition, Intake 1')
  })

  it('flags a page that no longer exists', () => {
    const decision = decideSourceCheck(
      state(),
      { kind: 'gone', message: 'x' },
      OCT_2026,
    )
    expect(decision).toMatchObject({
      needsRecheck: true,
      note: 'The course page no longer exists',
    })
  })

  it('never flags a site that blocks reading', () => {
    expect(
      decideSourceCheck(state(), { kind: 'blocked', message: 'x' }, OCT_2026),
    ).toEqual({
      needsRecheck: false,
      note: 'Site blocks automatic checks; recheck by hand',
      failures: 0,
    })
  })

  it('flags only on the third failed week in a row', () => {
    const failed = { kind: 'failed' as const, message: 'timeout' }
    expect(
      decideSourceCheck(state({ source_check_failures: 1 }), failed, OCT_2026),
    ).toEqual({
      needsRecheck: false,
      note: "Couldn't open the page (2 weeks running)",
      failures: 2,
    })
    expect(
      decideSourceCheck(state({ source_check_failures: 2 }), failed, OCT_2026),
    ).toMatchObject({
      needsRecheck: true,
      failures: 3,
    })
  })

  it('flags last year’s fees and old verifications, even on sites it cannot read', () => {
    const blocked = { kind: 'blocked' as const, message: 'x' }
    expect(
      decideSourceCheck(
        state({ fees_academic_year: '2025/26' }),
        blocked,
        OCT_2026,
      ),
    ).toMatchObject({
      needsRecheck: true,
      note: 'Fees are for 2025/26; check for newer fees',
    })
    expect(
      decideSourceCheck(
        state({ verified_at: new Date('2025-09-01T00:00:00Z') }),
        blocked,
        OCT_2026,
      ),
    ).toMatchObject({
      needsRecheck: true,
      note: 'Last verified over a year ago',
    })
  })
})

describe('ProgramSourceCheckService', () => {
  const program = (overrides: Record<string, unknown> = {}) => ({
    id: 'uuid-1',
    public_id: 'PRG-6658',
    name: 'Data Science and Computational Intelligence',
    school: { public_id: 'SCH-6577', name: 'Coventry University' },
    source_url: 'https://www.coventry.ac.uk/course/',
    verification_status: 'VERIFIED',
    ...state(),
    ...overrides,
  })

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(TeamRepo).findActiveUserIdsByRoles.mockResolvedValue([
      'admin-1',
      'ops-1',
    ])
  })

  it('flags a changed page, audits it and alerts admins and operations once', async () => {
    programsRepoMock.listVerifiedForSourceCheck.mockResolvedValue([
      program(),
    ] as never)
    fetchMock.mockResolvedValue({
      url: 'x',
      text: PAGE.replace('£19,500', '£21,000'),
    })

    const summary = await ProgramSourceCheckService.CheckAllVerified(
      async () => {},
    )

    expect(summary).toEqual({
      checked: 1,
      unchanged: 0,
      flagged: 1,
      blocked: 0,
      failed: 0,
    })
    expect(programsRepoMock.setSourceCheck).toHaveBeenCalledWith(
      'uuid-1',
      expect.objectContaining({
        status: 'NEEDS_RECHECK',
        note: 'Changed on the page: Tuition',
      }),
      expect.anything(),
    )
    expect(auditRepoMock.record).toHaveBeenCalledTimes(1)
    expect(notifyMock).toHaveBeenCalledWith(
      ['admin-1', 'ops-1'],
      expect.objectContaining({
        link: '/programs/PRG-6658',
        body: 'Changed on the page: Tuition',
      }),
    )
  })

  it('records the check without auditing or alerting when nothing changed', async () => {
    programsRepoMock.listVerifiedForSourceCheck.mockResolvedValue([
      program(),
    ] as never)
    fetchMock.mockResolvedValue({ url: 'x', text: PAGE })

    const summary = await ProgramSourceCheckService.CheckAllVerified(
      async () => {},
    )

    expect(summary.unchanged).toBe(1)
    expect(programsRepoMock.setSourceCheck).toHaveBeenCalledWith(
      'uuid-1',
      expect.objectContaining({
        status: undefined,
        note: 'All 3 quotes still on the page',
      }),
      expect.anything(),
    )
    expect(auditRepoMock.record).not.toHaveBeenCalled()
    expect(notifyMock).not.toHaveBeenCalled()
  })

  it('counts blocked sites and spaces out requests to the same site', async () => {
    programsRepoMock.listVerifiedForSourceCheck.mockResolvedValue([
      program(),
      program({ id: 'uuid-2', public_id: 'PRG-0002' }),
    ] as never)
    fetchMock.mockRejectedValue(new PageFetchError('blocked', 'blocked'))
    const sleep = vi.fn(async () => {})

    const summary = await ProgramSourceCheckService.CheckAllVerified(sleep)

    expect(summary).toMatchObject({ checked: 2, blocked: 2, flagged: 0 })
    expect(sleep).toHaveBeenCalledTimes(1)
  })

  it('does not alert again about a programme already waiting for a recheck', async () => {
    programsRepoMock.findProgramByPublicId.mockResolvedValue(
      program({ verification_status: 'NEEDS_RECHECK' }) as never,
    )
    fetchMock.mockResolvedValue({
      url: 'x',
      text: 'nothing relevant on this page any more',
    })

    const result = await ProgramSourceCheckService.CheckOne('PRG-6658')

    expect(result.flagged).toBe(false)
    expect(notifyMock).not.toHaveBeenCalled()
  })
})

describe('POST /api/v1/programs/:programId/source-check', () => {
  it('forbids advisors', async () => {
    vi.clearAllMocks()
    vi.mocked(AuthRepo).findUser.mockResolvedValue({
      id: 'u1',
      public_id: 'USR-0001',
      full_name: 'Ada Advisor',
      email: 'ada@example.com',
      phone: null,
      password_hash: 'x',
      role: 'ADVISOR',
      status: 'ACTIVE',
      token_version: 0,
      last_login_at: null,
      password_changed_at: null,
      created_at: new Date(),
      updated_at: new Date(),
    })
    vi.mocked(AuthRepo).findAuthSessionById.mockResolvedValue({
      id: 's1',
      user_id: 'u1',
      refresh_token_hash: 'h',
      token_family: 'f',
      user_agent: null,
      ip_address: null,
      expires_at: new Date(Date.now() + 3_600_000),
      revoked_at: null,
      last_used_at: null,
      created_at: new Date(),
    })

    const res = await request(app)
      .post('/api/v1/programs/PRG-6658/source-check')
      .set(
        'Authorization',
        `Bearer ${generateAcessToken('u1', 's1', 'ADVISOR', 0)}`,
      )

    expect(res.status).toBe(403)
    expect(programsRepoMock.findProgramByPublicId.mock.calls).toHaveLength(0)
  })
})
