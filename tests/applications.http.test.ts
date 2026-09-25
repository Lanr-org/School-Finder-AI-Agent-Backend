import './setup-env'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import app from '../src/app'
import { generateAcessToken } from '../src/common/security/token'
import AuthRepo from '../src/modules/auth/auth.repository'
import { StudentsRepo } from '../src/modules/students/students.repository'
import { ProgramsRepo } from '../src/modules/programs/programs.repository'
import TeamRepo from '../src/modules/team/team.repository'
import { ApplicationsRepo } from '../src/modules/applications/applications.repository'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../src/modules/auth/auth.repository', () => ({
  default: {
    findUser: vi.fn(),
    findAuthSessionById: vi.fn(),
  },
}))

vi.mock('../src/modules/students/students.repository', () => ({
  StudentsRepo: {
    findStudentByPublicId: vi.fn(),
  },
}))

vi.mock('../src/modules/programs/programs.repository', () => ({
  ProgramsRepo: {
    findProgramByPublicId: vi.fn(),
  },
}))

vi.mock('../src/modules/team/team.repository', () => ({
  default: {
    findUserByPublicId: vi.fn(),
    findUsersByIds: vi.fn(),
  },
}))

vi.mock('../src/modules/applications/applications.repository', () => ({
  ApplicationsRepo: {
    findByPublicId: vi.fn(),
    findHistory: vi.fn(),
    findOpenForStudentProgram: vi.fn(),
    findProgramIntake: vi.fn(),
    listForStudent: vi.fn(),
    list: vi.fn(),
    createWithHistory: vi.fn(),
    updateStatus: vi.fn(),
    updateDetails: vi.fn(),
  },
}))

// ── Typed response helpers ────────────────────────────────────────────────────

type ApiBody<T = unknown> = {
  success: boolean
  message: string
  data: T
  error?: { code: string; message: string; details?: Record<string, unknown> }
}

function body<T = unknown>(res: { body: unknown }): ApiBody<T> {
  return res.body as ApiBody<T>
}

const authRepoMock = vi.mocked(AuthRepo)
const studentsRepoMock = vi.mocked(StudentsRepo)
const programsRepoMock = vi.mocked(ProgramsRepo)
const teamRepoMock = vi.mocked(TeamRepo)
const applicationsRepoMock = vi.mocked(ApplicationsRepo)

// ── Constants ─────────────────────────────────────────────────────────────────

const ADMIN_ID = 'admin-user-uuid-0001'
const ADVISOR_ID = 'advisor-user-uuid-0001'
const OTHER_ADVISOR_ID = 'advisor-user-uuid-0002'
const SESSION_ID = 'session-uuid-0001'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const makeUser = (overrides: Record<string, unknown> = {}) => ({
  id: ADMIN_ID,
  public_id: 'USR-0001',
  full_name: 'Alice Admin',
  email: 'alice@example.com',
  phone: null as string | null,
  password_hash: '$argon2id$hash' as string | null,
  role: 'ADMIN' as const,
  status: 'ACTIVE' as const,
  token_version: 0,
  last_login_at: null as Date | null,
  password_changed_at: null as Date | null,
  created_at: new Date('2024-01-01'),
  updated_at: new Date('2024-01-01'),
  ...overrides,
})

const makeSession = (overrides: Record<string, unknown> = {}) => ({
  id: SESSION_ID,
  user_id: ADMIN_ID,
  refresh_token_hash: 'hash',
  token_family: 'family-uuid',
  user_agent: null as string | null,
  ip_address: null as string | null,
  expires_at: new Date(Date.now() + 3_600_000),
  revoked_at: null as Date | null,
  last_used_at: null as Date | null,
  created_at: new Date(),
  ...overrides,
})

const makeStudent = (overrides: Record<string, unknown> = {}) => ({
  id: 'student-uuid-1',
  public_id: 'STU-8440',
  status: 'ASSIGNED' as const,
  assigned_advisor_id: ADVISOR_ID as string | null,
  contact: { first_name: 'Chinedu', last_name: 'Nwosu' },
  ...overrides,
})

const makeProgram = () => ({
  id: 'program-uuid-1',
  public_id: 'PRG-3108',
  name: 'MSc Data Science',
})

const makeApplication = (overrides: Record<string, unknown> = {}) => ({
  id: 'application-uuid-1',
  public_id: 'APP-1048',
  student_id: 'student-uuid-1',
  program_id: 'program-uuid-1',
  created_by: ADVISOR_ID,
  status: 'DRAFT',
  intake_month: 'SEPTEMBER' as string | null,
  intake_year: 2026 as number | null,
  external_reference: null as string | null,
  notes: null as string | null,
  created_at: new Date('2026-09-01'),
  updated_at: new Date('2026-09-01'),
  student: {
    public_id: 'STU-8440',
    assigned_advisor_id: ADVISOR_ID as string | null,
    contact: { first_name: 'Chinedu', last_name: 'Nwosu' },
  },
  program: {
    public_id: 'PRG-3108',
    name: 'MSc Data Science',
    study_level: 'POSTGRADUATE',
    school: {
      public_id: 'SCH-2048',
      name: 'Northbridge University',
      country: 'United Kingdom',
    },
    intakes: [
      {
        id: 'intake-uuid-1',
        program_id: 'program-uuid-1',
        month: 'SEPTEMBER',
        year: 2026,
        application_deadline: new Date('2026-06-30'),
      },
    ],
  },
  creator: { public_id: 'USR-946B7F71768D', full_name: 'Amina Advisor' },
  ...overrides,
})

const token = (role: 'ADMIN' | 'ADVISOR' | 'OPERATIONS', id = ADMIN_ID) =>
  generateAcessToken(id, SESSION_ID, role, 0)

const asAdmin = () => {
  authRepoMock.findUser.mockResolvedValue(
    makeUser({ id: ADMIN_ID, role: 'ADMIN' }) as any,
  )
  authRepoMock.findAuthSessionById.mockResolvedValue(
    makeSession({ user_id: ADMIN_ID }) as any,
  )
  return token('ADMIN', ADMIN_ID)
}

const asAdvisor = (id = ADVISOR_ID) => {
  authRepoMock.findUser.mockResolvedValue(
    makeUser({ id, role: 'ADVISOR' }) as any,
  )
  authRepoMock.findAuthSessionById.mockResolvedValue(
    makeSession({ user_id: id }) as any,
  )
  return token('ADVISOR', id)
}

// ── POST /students/:studentId/applications ────────────────────────────────────

describe('Applications API — POST /api/v1/students/:studentId/applications', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    studentsRepoMock.findStudentByPublicId.mockResolvedValue(
      makeStudent() as any,
    )
    programsRepoMock.findProgramByPublicId.mockResolvedValue(
      makeProgram() as any,
    )
    applicationsRepoMock.findOpenForStudentProgram.mockResolvedValue(null)
    applicationsRepoMock.findProgramIntake.mockResolvedValue({
      id: 'intake-uuid-1',
    } as any)
    applicationsRepoMock.createWithHistory.mockResolvedValue(
      makeApplication() as any,
    )
  })

  it('creates an application for the owning ADVISOR and returns the public shape', async () => {
    const authToken = asAdvisor()

    const res = await request(app)
      .post('/api/v1/students/STU-8440/applications')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        programId: 'PRG-3108',
        intakeMonth: 'SEPTEMBER',
        intakeYear: 2026,
      })

    expect(res.status).toBe(201)
    expect(applicationsRepoMock.createWithHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        studentId: 'student-uuid-1',
        programId: 'program-uuid-1',
        createdBy: ADVISOR_ID,
        intakeMonth: 'SEPTEMBER',
        intakeYear: 2026,
      }),
    )
    const data = body<Record<string, any>>(res).data
    expect(data['publicId']).toBe('APP-1048')
    expect(data['status']).toBe('DRAFT')
    // The deadline comes from the stored ProgramIntakes row.
    expect(data['intake']).toEqual({
      month: 'SEPTEMBER',
      year: 2026,
      applicationDeadline: '2026-06-30T00:00:00.000Z',
    })
    expect(data['school']['name']).toBe('Northbridge University')
    expect(JSON.stringify(data)).not.toContain('application-uuid-1')
  })

  it('returns 404 when the program does not exist', async () => {
    const authToken = asAdvisor()
    programsRepoMock.findProgramByPublicId.mockResolvedValue(null)

    const res = await request(app)
      .post('/api/v1/students/STU-8440/applications')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ programId: 'PRG-9999' })

    expect(res.status).toBe(404)
    expect(applicationsRepoMock.createWithHistory).not.toHaveBeenCalled()
  })

  it('returns 409 when the student already has an open application for the program', async () => {
    const authToken = asAdvisor()
    applicationsRepoMock.findOpenForStudentProgram.mockResolvedValue(
      makeApplication({ status: 'SUBMITTED' }) as any,
    )

    const res = await request(app)
      .post('/api/v1/students/STU-8440/applications')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ programId: 'PRG-3108' })

    expect(res.status).toBe(409)
    expect(body(res).error?.code).toBe('CONFLICT')
    expect(applicationsRepoMock.createWithHistory).not.toHaveBeenCalled()
  })

  it('returns 400 when the intake is not a listed intake for the program', async () => {
    const authToken = asAdvisor()
    applicationsRepoMock.findProgramIntake.mockResolvedValue(null)

    const res = await request(app)
      .post('/api/v1/students/STU-8440/applications')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ programId: 'PRG-3108', intakeMonth: 'MARCH', intakeYear: 2027 })

    expect(res.status).toBe(400)
    expect(body(res).error?.code).toBe('VALIDATION_ERROR')
    expect(applicationsRepoMock.createWithHistory).not.toHaveBeenCalled()
  })

  it('returns 400 when only one of intakeMonth/intakeYear is given', async () => {
    const authToken = asAdvisor()

    const res = await request(app)
      .post('/api/v1/students/STU-8440/applications')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ programId: 'PRG-3108', intakeMonth: 'SEPTEMBER' })

    expect(res.status).toBe(400)
    expect(body(res).error?.code).toBe('VALIDATION_ERROR')
  })

  it('returns 403 for an ADVISOR the student is not assigned to', async () => {
    const authToken = asAdvisor(OTHER_ADVISOR_ID)

    const res = await request(app)
      .post('/api/v1/students/STU-8440/applications')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ programId: 'PRG-3108' })

    expect(res.status).toBe(403)
    expect(applicationsRepoMock.createWithHistory).not.toHaveBeenCalled()
  })

  it('lets ADMIN create for any student', async () => {
    const authToken = asAdmin()

    const res = await request(app)
      .post('/api/v1/students/STU-8440/applications')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ programId: 'PRG-3108' })

    expect(res.status).toBe(201)
  })

  it('returns 403 for OPERATIONS (route requires ADMIN or ADVISOR)', async () => {
    authRepoMock.findUser.mockResolvedValue(
      makeUser({ id: 'ops-uuid', role: 'OPERATIONS' }) as any,
    )
    authRepoMock.findAuthSessionById.mockResolvedValue(
      makeSession({ user_id: 'ops-uuid' }) as any,
    )

    const res = await request(app)
      .post('/api/v1/students/STU-8440/applications')
      .set('Authorization', `Bearer ${token('OPERATIONS', 'ops-uuid')}`)
      .send({ programId: 'PRG-3108' })

    expect(res.status).toBe(403)
  })
})

// ── PATCH /applications/:applicationId/status ─────────────────────────────────

describe('Applications API — PATCH /api/v1/applications/:applicationId/status', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const patchStatus = (authToken: string, payload: Record<string, unknown>) =>
    request(app)
      .patch('/api/v1/applications/APP-1048/status')
      .set('Authorization', `Bearer ${authToken}`)
      .send(payload)

  it('moves forward, guarded on the current status, and records who did it', async () => {
    const authToken = asAdvisor()
    applicationsRepoMock.findByPublicId.mockResolvedValue(
      makeApplication({ status: 'DRAFT' }) as any,
    )
    applicationsRepoMock.updateStatus.mockResolvedValue(
      makeApplication({ status: 'DOCUMENTS_PENDING' }) as any,
    )

    const res = await patchStatus(authToken, {
      status: 'DOCUMENTS_PENDING',
      note: 'Transcript requested',
    })

    expect(res.status).toBe(200)
    expect(applicationsRepoMock.updateStatus).toHaveBeenCalledWith(
      'application-uuid-1',
      'DRAFT',
      'DOCUMENTS_PENDING',
      ADVISOR_ID,
      'Transcript requested',
    )
    expect(body<{ status: string }>(res).data.status).toBe('DOCUMENTS_PENDING')
  })

  it('allows skipping forward', async () => {
    const authToken = asAdvisor()
    applicationsRepoMock.findByPublicId.mockResolvedValue(
      makeApplication({ status: 'DRAFT' }) as any,
    )
    applicationsRepoMock.updateStatus.mockResolvedValue(
      makeApplication({ status: 'SUBMITTED' }) as any,
    )

    const res = await patchStatus(authToken, { status: 'SUBMITTED' })

    expect(res.status).toBe(200)
  })

  // `details` (incl. the allowed list) is only exposed when NODE_ENV=development
  // — see errorHandler — so only the code and message are asserted here.
  it('returns 409 when moving backwards', async () => {
    const authToken = asAdvisor()
    applicationsRepoMock.findByPublicId.mockResolvedValue(
      makeApplication({ status: 'OFFER_RECEIVED' }) as any,
    )

    const res = await patchStatus(authToken, { status: 'DRAFT' })

    expect(res.status).toBe(409)
    expect(body(res).error?.code).toBe('CONFLICT')
    expect(body(res).error?.message).toBe(
      'Cannot move an application from OFFER_RECEIVED to DRAFT',
    )
    expect(applicationsRepoMock.updateStatus).not.toHaveBeenCalled()
  })

  it('returns 409 when the application is already final', async () => {
    const authToken = asAdvisor()
    applicationsRepoMock.findByPublicId.mockResolvedValue(
      makeApplication({ status: 'WITHDRAWN' }) as any,
    )

    const res = await patchStatus(authToken, { status: 'SUBMITTED' })

    expect(res.status).toBe(409)
    expect(applicationsRepoMock.updateStatus).not.toHaveBeenCalled()
  })

  it('allows WITHDRAWN from an open status', async () => {
    const authToken = asAdvisor()
    applicationsRepoMock.findByPublicId.mockResolvedValue(
      makeApplication({ status: 'VISA_PROCESSING' }) as any,
    )
    applicationsRepoMock.updateStatus.mockResolvedValue(
      makeApplication({ status: 'WITHDRAWN' }) as any,
    )

    const res = await patchStatus(authToken, { status: 'WITHDRAWN' })

    expect(res.status).toBe(200)
  })

  it('returns 409 when a concurrent change moved the status first', async () => {
    const authToken = asAdvisor()
    applicationsRepoMock.findByPublicId.mockResolvedValue(
      makeApplication({ status: 'DRAFT' }) as any,
    )
    applicationsRepoMock.updateStatus.mockResolvedValue(null)

    const res = await patchStatus(authToken, { status: 'SUBMITTED' })

    expect(res.status).toBe(409)
    expect(body(res).error?.code).toBe('CONFLICT')
  })

  it('returns 403 for an ADVISOR the student is not assigned to', async () => {
    const authToken = asAdvisor(OTHER_ADVISOR_ID)
    applicationsRepoMock.findByPublicId.mockResolvedValue(
      makeApplication() as any,
    )

    const res = await patchStatus(authToken, { status: 'SUBMITTED' })

    expect(res.status).toBe(403)
    expect(applicationsRepoMock.updateStatus).not.toHaveBeenCalled()
  })

  it('returns 404 for an unknown application', async () => {
    const authToken = asAdmin()
    applicationsRepoMock.findByPublicId.mockResolvedValue(null)

    const res = await patchStatus(authToken, { status: 'SUBMITTED' })

    expect(res.status).toBe(404)
  })

  it('returns 400 for an invalid status value', async () => {
    const authToken = asAdmin()

    const res = await patchStatus(authToken, { status: 'ENROLLED' })

    expect(res.status).toBe(400)
    expect(body(res).error?.code).toBe('VALIDATION_ERROR')
  })
})

// ── PATCH /applications/:applicationId ────────────────────────────────────────

describe('Applications API — PATCH /api/v1/applications/:applicationId', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('updates details on an open application', async () => {
    const authToken = asAdvisor()
    applicationsRepoMock.findByPublicId.mockResolvedValue(
      makeApplication() as any,
    )
    applicationsRepoMock.updateDetails.mockResolvedValue(
      makeApplication({ external_reference: 'NBU-2026-0042' }) as any,
    )

    const res = await request(app)
      .patch('/api/v1/applications/APP-1048')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ externalReference: 'NBU-2026-0042' })

    expect(res.status).toBe(200)
    expect(
      body<{ externalReference: string }>(res).data.externalReference,
    ).toBe('NBU-2026-0042')
  })

  it('returns 409 when editing a final application', async () => {
    const authToken = asAdvisor()
    applicationsRepoMock.findByPublicId.mockResolvedValue(
      makeApplication({ status: 'COMPLETED' }) as any,
    )

    const res = await request(app)
      .patch('/api/v1/applications/APP-1048')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ notes: 'Late note' })

    expect(res.status).toBe(409)
    expect(applicationsRepoMock.updateDetails).not.toHaveBeenCalled()
  })

  it('returns 400 for an empty body', async () => {
    const authToken = asAdvisor()

    const res = await request(app)
      .patch('/api/v1/applications/APP-1048')
      .set('Authorization', `Bearer ${authToken}`)
      .send({})

    expect(res.status).toBe(400)
  })
})

// ── GET /applications/:applicationId ──────────────────────────────────────────

describe('Applications API — GET /api/v1/applications/:applicationId', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the application with its status history', async () => {
    const authToken = asAdvisor()
    applicationsRepoMock.findByPublicId.mockResolvedValue(
      makeApplication({ status: 'SUBMITTED' }) as any,
    )
    applicationsRepoMock.findHistory.mockResolvedValue([
      {
        id: 'h1',
        application_id: 'application-uuid-1',
        from_status: null,
        to_status: 'DRAFT',
        changed_by: ADVISOR_ID,
        note: null,
        created_at: new Date('2026-09-01'),
        changer: { public_id: 'USR-946B7F71768D', full_name: 'Amina Advisor' },
      },
      {
        id: 'h2',
        application_id: 'application-uuid-1',
        from_status: 'DRAFT',
        to_status: 'SUBMITTED',
        changed_by: ADVISOR_ID,
        note: 'Submitted via portal',
        created_at: new Date('2026-09-05'),
        changer: { public_id: 'USR-946B7F71768D', full_name: 'Amina Advisor' },
      },
    ] as any)

    const res = await request(app)
      .get('/api/v1/applications/APP-1048')
      .set('Authorization', `Bearer ${authToken}`)

    expect(res.status).toBe(200)
    const data = body<{ history: Record<string, unknown>[] }>(res).data
    expect(data.history).toHaveLength(2)
    expect(data.history[1]).toMatchObject({
      fromStatus: 'DRAFT',
      toStatus: 'SUBMITTED',
      note: 'Submitted via portal',
      changedBy: { publicId: 'USR-946B7F71768D', fullName: 'Amina Advisor' },
    })
  })
})

// ── GET /applications ─────────────────────────────────────────────────────────

describe('Applications API — GET /api/v1/applications', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    applicationsRepoMock.list.mockResolvedValue({
      applications: [makeApplication() as any],
      total: 1,
      summary: new Map([
        ['DRAFT', 1],
        ['SUBMITTED', 3],
      ]),
    } as any)
  })

  it('forces the advisor scope for an ADVISOR, ignoring any advisorId query param', async () => {
    const authToken = asAdvisor()

    const res = await request(app)
      .get('/api/v1/applications?advisorId=USR-FFFFFFFFFFFF')
      .set('Authorization', `Bearer ${authToken}`)

    expect(res.status).toBe(200)
    expect(applicationsRepoMock.list).toHaveBeenCalledWith(
      expect.objectContaining({ advisorUserId: ADVISOR_ID }),
    )
    expect(teamRepoMock.findUserByPublicId).not.toHaveBeenCalled()
  })

  it('resolves a public advisorId for ADMIN and returns a zero-filled summary', async () => {
    const authToken = asAdmin()
    teamRepoMock.findUserByPublicId.mockResolvedValue(
      makeUser({ id: ADVISOR_ID, role: 'ADVISOR' }) as any,
    )

    const res = await request(app)
      .get('/api/v1/applications?advisorId=USR-946B7F71768D&status=DRAFT')
      .set('Authorization', `Bearer ${authToken}`)

    expect(res.status).toBe(200)
    expect(applicationsRepoMock.list).toHaveBeenCalledWith(
      expect.objectContaining({ advisorUserId: ADVISOR_ID, status: 'DRAFT' }),
    )
    const data = body<{
      summary: Record<string, number>
      pagination: { total: number }
    }>(res).data
    expect(data.summary).toEqual({
      DRAFT: 1,
      DOCUMENTS_PENDING: 0,
      SUBMITTED: 3,
      OFFER_RECEIVED: 0,
      VISA_PROCESSING: 0,
      COMPLETED: 0,
      REJECTED: 0,
      WITHDRAWN: 0,
    })
    expect(data.pagination.total).toBe(1)
  })

  it('lets ADMIN list everything when no advisor filter is given', async () => {
    const authToken = asAdmin()

    const res = await request(app)
      .get('/api/v1/applications')
      .set('Authorization', `Bearer ${authToken}`)

    expect(res.status).toBe(200)
    expect(applicationsRepoMock.list).toHaveBeenCalledWith(
      expect.objectContaining({ advisorUserId: undefined }),
    )
  })
})

// ── GET /students/:studentId/applications ─────────────────────────────────────

describe('Applications API — GET /api/v1/students/:studentId/applications', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    studentsRepoMock.findStudentByPublicId.mockResolvedValue(
      makeStudent() as any,
    )
  })

  it('lists a student’s applications for the owning ADVISOR', async () => {
    const authToken = asAdvisor()
    applicationsRepoMock.listForStudent.mockResolvedValue({
      applications: [makeApplication() as any],
      total: 1,
    } as any)

    const res = await request(app)
      .get('/api/v1/students/STU-8440/applications')
      .set('Authorization', `Bearer ${authToken}`)

    expect(res.status).toBe(200)
    expect(applicationsRepoMock.listForStudent).toHaveBeenCalledWith(
      'student-uuid-1',
      expect.objectContaining({ page: 1, limit: 20 }),
    )
  })

  it('returns 403 for an ADVISOR the student is not assigned to', async () => {
    const authToken = asAdvisor(OTHER_ADVISOR_ID)

    const res = await request(app)
      .get('/api/v1/students/STU-8440/applications')
      .set('Authorization', `Bearer ${authToken}`)

    expect(res.status).toBe(403)
    expect(applicationsRepoMock.listForStudent).not.toHaveBeenCalled()
  })
})
