import './setup-env'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import app from '../src/app'
import { generateAcessToken } from '../src/common/security/token'
import AuthRepo from '../src/modules/auth/auth.repository'
import { StudentsRepo } from '../src/modules/students/students.repository'
import { NotesRepo } from '../src/modules/students/notes.repository'

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

vi.mock('../src/modules/students/notes.repository', () => ({
  NotesRepo: {
    createNote: vi.fn(),
    findByPublicId: vi.fn(),
    listForStudent: vi.fn(),
    updateNote: vi.fn(),
    softDeleteNote: vi.fn(),
  },
}))

// ── Typed response helpers ────────────────────────────────────────────────────

type ApiBody<T = unknown> = {
  success: boolean
  message: string
  data: T
  error?: { code: string; message: string }
}

function body<T = unknown>(res: { body: unknown }): ApiBody<T> {
  return res.body as ApiBody<T>
}

const authRepoMock = vi.mocked(AuthRepo)
const studentsRepoMock = vi.mocked(StudentsRepo)
const notesRepoMock = vi.mocked(NotesRepo)

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
  study_level: 'BACHELORS' as string | null,
  target_destinations: ['United Kingdom'],
  target_intake_month: 'SEPTEMBER' as string | null,
  target_intake_year: 2026 as number | null,
  budget_range: null as string | null,
  academic_background: null as string | null,
  english_test_score: null as string | null,
  created_at: new Date('2024-01-01'),
  updated_at: new Date('2024-01-01'),
  contact: {
    id: 'contact-uuid-1',
    provider_type: 'TELEGRAM' as const,
    provider_user_id: '2011329752',
    first_name: 'Chinedu',
    last_name: 'Nwosu',
    username: null as string | null,
    email: null as string | null,
    phone: null as string | null,
    created_at: new Date('2024-01-01'),
    updated_at: new Date('2024-01-01'),
  },
  ...overrides,
})

const makeNote = (overrides: Record<string, unknown> = {}) => ({
  id: 'note-uuid-1',
  public_id: 'NOTE-1001',
  student_id: 'student-uuid-1',
  advisor_id: ADVISOR_ID,
  body: 'Called the student, waiting on transcripts.',
  created_at: new Date('2024-01-01'),
  updated_at: new Date('2024-01-01'),
  deleted_at: null as Date | null,
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

// ── HTTP Test Suites ──────────────────────────────────────────────────────────

describe('Student Notes API — GET /api/v1/students/:studentId/notes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    studentsRepoMock.findStudentByPublicId.mockResolvedValue(
      makeStudent() as any,
    )
  })

  it('lists notes for the owning ADVISOR', async () => {
    const authToken = asAdvisor(ADVISOR_ID)
    notesRepoMock.listForStudent.mockResolvedValue({
      notes: [makeNote() as any],
      total: 1,
    })

    const res = await request(app)
      .get('/api/v1/students/STU-8440/notes')
      .set('Authorization', `Bearer ${authToken}`)

    expect(res.status).toBe(200)
    expect(body<{ notes: unknown[] }>(res).data.notes).toHaveLength(1)
  })

  it('returns 403 for an ADVISOR the student is not assigned to', async () => {
    const authToken = asAdvisor(OTHER_ADVISOR_ID)
    const res = await request(app)
      .get('/api/v1/students/STU-8440/notes')
      .set('Authorization', `Bearer ${authToken}`)
    expect(res.status).toBe(403)
  })

  it('returns 401 without a bearer token', async () => {
    const res = await request(app).get('/api/v1/students/STU-8440/notes')
    expect(res.status).toBe(401)
  })
})

describe('Student Notes API — POST /api/v1/students/:studentId/notes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    studentsRepoMock.findStudentByPublicId.mockResolvedValue(
      makeStudent() as any,
    )
  })

  it('creates a note for the owning ADVISOR', async () => {
    const authToken = asAdvisor(ADVISOR_ID)
    notesRepoMock.createNote.mockResolvedValue(makeNote() as any)

    const res = await request(app)
      .post('/api/v1/students/STU-8440/notes')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ body: 'Called the student, waiting on transcripts.' })

    expect(res.status).toBe(201)
    expect(notesRepoMock.createNote).toHaveBeenCalledWith(
      expect.objectContaining({
        studentId: 'student-uuid-1',
        advisorId: ADVISOR_ID,
      }),
    )
  })

  it('returns 400 for an empty body', async () => {
    const authToken = asAdvisor(ADVISOR_ID)
    const res = await request(app)
      .post('/api/v1/students/STU-8440/notes')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ body: '' })

    expect(res.status).toBe(400)
    expect(body(res).error?.code).toBe('VALIDATION_ERROR')
  })
})

describe('Student Notes API — PATCH & DELETE /api/v1/students/:studentId/notes/:noteId', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    studentsRepoMock.findStudentByPublicId.mockResolvedValue(
      makeStudent() as any,
    )
  })

  it('updates a note for the owning ADVISOR', async () => {
    const authToken = asAdvisor(ADVISOR_ID)
    notesRepoMock.findByPublicId.mockResolvedValue(makeNote() as any)
    notesRepoMock.updateNote.mockResolvedValue(
      makeNote({ body: 'Updated.' }) as any,
    )

    const res = await request(app)
      .patch('/api/v1/students/STU-8440/notes/NOTE-1001')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ body: 'Updated.' })

    expect(res.status).toBe(200)
  })

  it('returns 404 for a note that does not exist (or was soft-deleted)', async () => {
    const authToken = asAdvisor(ADVISOR_ID)
    notesRepoMock.findByPublicId.mockResolvedValue(null)

    const res = await request(app)
      .patch('/api/v1/students/STU-8440/notes/NOTE-9999')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ body: 'Updated.' })

    expect(res.status).toBe(404)
  })

  it('soft-deletes a note (does not hard-delete)', async () => {
    const authToken = asAdmin()
    notesRepoMock.findByPublicId.mockResolvedValue(makeNote() as any)
    notesRepoMock.softDeleteNote.mockResolvedValue(
      makeNote({ deleted_at: new Date() }) as any,
    )

    const res = await request(app)
      .delete('/api/v1/students/STU-8440/notes/NOTE-1001')
      .set('Authorization', `Bearer ${authToken}`)

    expect(res.status).toBe(200)
    expect(notesRepoMock.softDeleteNote).toHaveBeenCalledWith('note-uuid-1')
  })
})
