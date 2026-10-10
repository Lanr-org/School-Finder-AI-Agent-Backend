import './setup-env'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import app from '../src/app'
import { generateAcessToken } from '../src/common/security/token'
import AuthRepo from '../src/modules/auth/auth.repository'
import { AuditRepo } from '../src/modules/audit/audit.repository'
import { ProgramsRepo } from '../src/modules/programs/programs.repository'
import {
  nextVerificationStatus,
  touchesVerifiedFacts,
} from '../src/modules/programs/programs.service'
import { Prisma } from '../src/generated/prisma/index.js'

vi.mock('../src/modules/auth/auth.repository', () => ({
  default: {
    findUser: vi.fn(),
    findAuthSessionById: vi.fn(),
  },
}))

vi.mock('../src/modules/schools/schools.repository', () => ({
  SchoolsRepo: { findSchoolByPublicId: vi.fn() },
}))

vi.mock('../src/modules/programs/programs.repository', () => ({
  ProgramsRepo: {
    findProgramByPublicId: vi.fn(),
    updateProgram: vi.fn(),
    markVerified: vi.fn(),
    createReport: vi.fn(),
    findReportById: vi.fn(),
    listReports: vi.fn(),
    resolveReport: vi.fn(),
  },
}))

const authRepoMock = vi.mocked(AuthRepo)
const programsRepoMock = vi.mocked(ProgramsRepo)
const auditRepoMock = vi.mocked(AuditRepo)

const USER_ID = 'user-uuid-0001'
const SESSION_ID = 'session-uuid-0001'
const REPORT_ID = '5f0c7a52-3a1b-4c39-9d7e-1f2a3b4c5d6e'

type ApiBody = {
  data: Record<string, unknown>
  error?: { details: Record<string, unknown> }
}
const body = (res: { body: unknown }) => res.body as ApiBody

type Role = 'ADMIN' | 'OPERATIONS' | 'ADVISOR'

const signInAs = (role: Role) => {
  authRepoMock.findUser.mockResolvedValue({
    id: USER_ID,
    public_id: 'USR-0001',
    full_name: 'Femi Ops',
    email: 'femi@example.com',
    phone: null,
    password_hash: '$argon2id$hash',
    role: role,
    status: 'ACTIVE',
    token_version: 0,
    last_login_at: null,
    password_changed_at: null,
    created_at: new Date('2024-01-01'),
    updated_at: new Date('2024-01-01'),
  } as never)
  authRepoMock.findAuthSessionById.mockResolvedValue({
    id: SESSION_ID,
    user_id: USER_ID,
    refresh_token_hash: 'hash',
    token_family: 'family-uuid',
    user_agent: null,
    ip_address: null,
    expires_at: new Date(Date.now() + 3_600_000),
    revoked_at: null,
    last_used_at: null,
    created_at: new Date(),
  })
  return `Bearer ${generateAcessToken(USER_ID, SESSION_ID, role, 0)}`
}

const makeProgram = (overrides: Record<string, unknown> = {}) => ({
  id: 'program-uuid-0001',
  public_id: 'PRG-2001',
  name: 'MSc Data Science',
  study_level: 'POSTGRADUATE' as const,
  qualification: 'MSc',
  category: 'Computer Science',
  duration: '1 year',
  school_id: 'school-uuid-0001',
  school: { public_id: 'SCH-1001', name: 'University of Manchester' },
  tuition_amount: new Prisma.Decimal(31000),
  tuition_currency: 'GBP',
  scholarship_availability: null,
  intakes: [],
  academic_requirements: null,
  english_requirements: null,
  operation_notes: null,
  source_url:
    'https://www.manchester.ac.uk/study/masters/courses/list/msc-data-science/' as
      | string
      | null,
  fees_academic_year: '2026/27',
  verification_status: 'UNVERIFIED' as
    | 'UNVERIFIED'
    | 'VERIFIED'
    | 'NEEDS_RECHECK',
  verified_at: null as Date | null,
  verified_by_id: null as string | null,
  verified_by: null as { public_id: string; full_name: string } | null,
  evidence: null,
  last_checked_at: null,
  created_at: new Date('2026-10-01'),
  updated_at: new Date('2026-10-01'),
  ...overrides,
})

const makeReport = (overrides: Record<string, unknown> = {}) => ({
  id: REPORT_ID,
  program_id: 'program-uuid-0001',
  reporter_id: USER_ID,
  message: 'Tuition is now £32,500 for 2027/28',
  status: 'OPEN' as 'OPEN' | 'RESOLVED',
  resolved_by_id: null,
  created_at: new Date('2026-10-09'),
  resolved_at: null as Date | null,
  program: {
    public_id: 'PRG-2001',
    name: 'MSc Data Science',
    school: { name: 'University of Manchester' },
  },
  reporter: { public_id: 'USR-0001', full_name: 'Femi Ops' },
  resolved_by: null as { public_id: string; full_name: string } | null,
  ...overrides,
})

beforeEach(() => vi.clearAllMocks())

describe('verification rules — unit', () => {
  it('treats fees, requirements, intakes and the source link as verified facts', () => {
    expect(touchesVerifiedFacts({ tuitionAmount: 32000 })).toBe(true)
    expect(touchesVerifiedFacts({ intakes: [] })).toBe(true)
    expect(
      touchesVerifiedFacts({ sourceUrl: 'https://example.ac.uk/course' }),
    ).toBe(true)
  })

  it('does not treat internal notes or the category label as facts', () => {
    expect(touchesVerifiedFacts({ operationNotes: 'Call admissions' })).toBe(
      false,
    )
    expect(touchesVerifiedFacts({ category: 'Data' })).toBe(false)
  })

  it('drops VERIFIED and NEEDS_RECHECK to UNVERIFIED on a fact edit, leaves the rest alone', () => {
    expect(nextVerificationStatus('VERIFIED', { tuitionAmount: 1 })).toBe(
      'UNVERIFIED',
    )
    expect(nextVerificationStatus('NEEDS_RECHECK', { tuitionAmount: 1 })).toBe(
      'UNVERIFIED',
    )
    expect(
      nextVerificationStatus('UNVERIFIED', { tuitionAmount: 1 }),
    ).toBeUndefined()
    expect(
      nextVerificationStatus('VERIFIED', { operationNotes: 'x' }),
    ).toBeUndefined()
  })
})

describe('PATCH /api/v1/programs/:programId — verification reset', () => {
  it('passes UNVERIFIED to the repo when a verified fee is edited', async () => {
    const auth = signInAs('OPERATIONS')
    programsRepoMock.findProgramByPublicId.mockResolvedValue(
      makeProgram({ verification_status: 'VERIFIED' }),
    )
    programsRepoMock.updateProgram.mockResolvedValue(
      makeProgram({ tuition_amount: new Prisma.Decimal(32500) }),
    )

    const res = await request(app)
      .patch('/api/v1/programs/PRG-2001')
      .set('Authorization', auth)
      .send({ tuitionAmount: 32500 })

    expect(res.status).toBe(200)
    expect(programsRepoMock.updateProgram).toHaveBeenCalledWith(
      'program-uuid-0001',
      undefined,
      expect.objectContaining({ tuitionAmount: 32500 }),
      'UNVERIFIED',
      expect.anything(),
    )
  })

  it('rejects a source link that is not https', async () => {
    const auth = signInAs('ADMIN')
    const res = await request(app)
      .patch('/api/v1/programs/PRG-2001')
      .set('Authorization', auth)
      .send({ sourceUrl: 'http://www.manchester.ac.uk/course' })

    expect(res.status).toBe(400)
    expect(programsRepoMock.updateProgram).not.toHaveBeenCalled()
  })
})

describe('POST /api/v1/programs/:programId/verify', () => {
  it('marks the program verified by the signed-in user and audits it', async () => {
    const auth = signInAs('OPERATIONS')
    programsRepoMock.findProgramByPublicId.mockResolvedValue(makeProgram())
    programsRepoMock.markVerified.mockResolvedValue(
      makeProgram({
        verification_status: 'VERIFIED',
        verified_at: new Date('2026-10-10'),
        verified_by_id: USER_ID,
        verified_by: { public_id: 'USR-0001', full_name: 'Femi Ops' },
      }),
    )

    const res = await request(app)
      .post('/api/v1/programs/PRG-2001/verify')
      .set('Authorization', auth)

    expect(res.status).toBe(200)
    expect(body(res).data).toMatchObject({
      verificationStatus: 'VERIFIED',
      verifiedBy: { publicId: 'USR-0001', fullName: 'Femi Ops' },
    })
    expect(programsRepoMock.markVerified).toHaveBeenCalledWith(
      'program-uuid-0001',
      USER_ID,
      expect.anything(),
    )
    expect(auditRepoMock.record.mock.calls[0]?.[1]).toMatchObject({
      action: 'program.verified',
      entity_id: 'PRG-2001',
    })
  })

  it('refuses to verify without an official source link', async () => {
    const auth = signInAs('ADMIN')
    programsRepoMock.findProgramByPublicId.mockResolvedValue(
      makeProgram({ source_url: null }),
    )

    const res = await request(app)
      .post('/api/v1/programs/PRG-2001/verify')
      .set('Authorization', auth)

    expect(res.status).toBe(400)
    expect(body(res).error?.details).toHaveProperty('sourceUrl')
    expect(programsRepoMock.markVerified).not.toHaveBeenCalled()
  })

  it('forbids advisors', async () => {
    const auth = signInAs('ADVISOR')
    const res = await request(app)
      .post('/api/v1/programs/PRG-2001/verify')
      .set('Authorization', auth)

    expect(res.status).toBe(403)
    expect(programsRepoMock.markVerified).not.toHaveBeenCalled()
  })
})

describe('POST /api/v1/programs/:programId/reports', () => {
  it('lets an advisor report outdated data and flags a verified program for re-check', async () => {
    const auth = signInAs('ADVISOR')
    programsRepoMock.findProgramByPublicId.mockResolvedValue(
      makeProgram({ verification_status: 'VERIFIED' }),
    )
    programsRepoMock.createReport.mockResolvedValue(makeReport())

    const res = await request(app)
      .post('/api/v1/programs/PRG-2001/reports')
      .set('Authorization', auth)
      .send({ message: 'Tuition is now £32,500 for 2027/28' })

    expect(res.status).toBe(201)
    expect(body(res).data).toMatchObject({
      status: 'OPEN',
      program: { publicId: 'PRG-2001' },
    })
    expect(programsRepoMock.createReport).toHaveBeenCalledWith(
      'program-uuid-0001',
      USER_ID,
      'Tuition is now £32,500 for 2027/28',
      true,
      expect.anything(),
    )
  })

  it('does not flag an unverified program', async () => {
    const auth = signInAs('ADVISOR')
    programsRepoMock.findProgramByPublicId.mockResolvedValue(makeProgram())
    programsRepoMock.createReport.mockResolvedValue(makeReport())

    await request(app)
      .post('/api/v1/programs/PRG-2001/reports')
      .set('Authorization', auth)
      .send({ message: 'Deadline looks wrong' })

    expect(programsRepoMock.createReport).toHaveBeenCalledWith(
      'program-uuid-0001',
      USER_ID,
      'Deadline looks wrong',
      false,
      expect.anything(),
    )
  })
})

describe('/api/v1/program-reports', () => {
  it('forbids advisors from listing reports', async () => {
    const auth = signInAs('ADVISOR')
    const res = await request(app)
      .get('/api/v1/program-reports')
      .set('Authorization', auth)
    expect(res.status).toBe(403)
  })

  it('lists open reports by default', async () => {
    const auth = signInAs('ADMIN')
    programsRepoMock.listReports.mockResolvedValue({
      reports: [makeReport()],
      total: 1,
    })

    const res = await request(app)
      .get('/api/v1/program-reports')
      .set('Authorization', auth)

    expect(res.status).toBe(200)
    expect(body(res).data['reports']).toHaveLength(1)
    expect(programsRepoMock.listReports).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'OPEN' }),
    )
  })

  it('resolves an open report', async () => {
    const auth = signInAs('OPERATIONS')
    programsRepoMock.findReportById.mockResolvedValue(makeReport())
    programsRepoMock.resolveReport.mockResolvedValue(
      makeReport({
        status: 'RESOLVED',
        resolved_at: new Date('2026-10-10'),
        resolved_by: { public_id: 'USR-0001', full_name: 'Femi Ops' },
      }),
    )

    const res = await request(app)
      .post(`/api/v1/program-reports/${REPORT_ID}/resolve`)
      .set('Authorization', auth)

    expect(res.status).toBe(200)
    expect(body(res).data['status']).toBe('RESOLVED')
    expect(auditRepoMock.record.mock.calls[0]?.[1]).toMatchObject({
      action: 'program.report_resolved',
    })
  })

  it('returns 409 for a report that is already resolved', async () => {
    const auth = signInAs('ADMIN')
    programsRepoMock.findReportById.mockResolvedValue(
      makeReport({ status: 'RESOLVED' }),
    )

    const res = await request(app)
      .post(`/api/v1/program-reports/${REPORT_ID}/resolve`)
      .set('Authorization', auth)

    expect(res.status).toBe(409)
    expect(programsRepoMock.resolveReport).not.toHaveBeenCalled()
  })
})
