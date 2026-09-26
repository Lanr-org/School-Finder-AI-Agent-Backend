import './setup-env'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { StudentStatusHistoryRepo } from '../src/modules/students/statusHistory.repository'
import { StudentsRepo } from '../src/modules/students/students.repository'

// ── In-memory fake transaction ───────────────────────────────────────────────
// One student row + an append-only history array, enough to exercise the
// transition rules without a live database.

type Row = { id: string; status: string; assigned_advisor_id: string | null }

const state: { student: Row; history: Record<string, unknown>[] } = {
  student: { id: 'student-uuid-1', status: 'NEW', assigned_advisor_id: null },
  history: [],
}

const fakeTx = {
  student: {
    findUnique: vi.fn(async () => ({ status: state.student.status })),
    findUniqueOrThrow: vi.fn(async () => ({ ...state.student })),
    update: vi.fn(async ({ data }: { data: Partial<Row> }) => {
      Object.assign(state.student, data)
      return { ...state.student }
    }),
    updateMany: vi.fn(
      async ({
        where,
        data,
      }: {
        where: { status: string }
        data: Partial<Row>
      }) => {
        if (state.student.status !== where.status) return { count: 0 }
        Object.assign(state.student, data)
        return { count: 1 }
      },
    ),
  },
  studentStatusHistory: {
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      state.history.push(data)
      return data
    }),
  },
}

vi.mock('../src/database/prisma', () => ({
  default: {
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(fakeTx)),
  },
}))

const setStudent = (status: string, advisor: string | null = null) => {
  state.student = { id: 'student-uuid-1', status, assigned_advisor_id: advisor }
  state.history = []
}

describe('StudentStatusHistoryRepo.transition', () => {
  beforeEach(() => vi.clearAllMocks())

  it('updates the status and appends a history row with the previous status', async () => {
    setStudent('ASSIGNED')

    const changed = await StudentStatusHistoryRepo.transition(fakeTx as any, {
      studentId: 'student-uuid-1',
      to: 'FOLLOW_UP',
      source: 'FOLLOW_UP_CREATED',
      changedBy: 'advisor-1',
    })

    expect(changed).toBe(true)
    expect(state.student.status).toBe('FOLLOW_UP')
    expect(state.history).toEqual([
      {
        student_id: 'student-uuid-1',
        from_status: 'ASSIGNED',
        to_status: 'FOLLOW_UP',
        source: 'FOLLOW_UP_CREATED',
        changed_by: 'advisor-1',
        note: null,
      },
    ])
  })

  it('is a no-op when the status would not change', async () => {
    setStudent('FOLLOW_UP')

    const changed = await StudentStatusHistoryRepo.transition(fakeTx as any, {
      studentId: 'student-uuid-1',
      to: 'FOLLOW_UP',
      source: 'MANUAL',
      changedBy: 'advisor-1',
    })

    expect(changed).toBe(false)
    expect(state.history).toHaveLength(0)
    expect(fakeTx.student.updateMany).not.toHaveBeenCalled()
  })

  it('does not move a student whose status is outside allowedFrom', async () => {
    setStudent('APPLICATION_STARTED')

    const changed = await StudentStatusHistoryRepo.transition(fakeTx as any, {
      studentId: 'student-uuid-1',
      to: 'FOLLOW_UP',
      allowedFrom: ['ASSIGNED'],
      source: 'FOLLOW_UP_CREATED',
      changedBy: 'advisor-1',
    })

    expect(changed).toBe(false)
    expect(state.student.status).toBe('APPLICATION_STARTED')
    expect(state.history).toHaveLength(0)
  })

  it('writes no history when a concurrent change already moved the student', async () => {
    setStudent('ASSIGNED')
    // Status read as ASSIGNED, but another transaction changes it before the guarded update.
    fakeTx.student.findUnique.mockResolvedValueOnce({ status: 'ASSIGNED' })
    state.student.status = 'CLOSED'

    const changed = await StudentStatusHistoryRepo.transition(fakeTx as any, {
      studentId: 'student-uuid-1',
      to: 'FOLLOW_UP',
      source: 'FOLLOW_UP_CREATED',
      changedBy: 'advisor-1',
    })

    expect(changed).toBe(false)
    expect(state.student.status).toBe('CLOSED')
    expect(state.history).toHaveLength(0)
  })
})

describe('StudentsRepo advisor assignment — status rules', () => {
  beforeEach(() => vi.clearAllMocks())

  it('assigning moves an AWAITING_ASSIGNMENT student to ASSIGNED and records who did it', async () => {
    setStudent('AWAITING_ASSIGNMENT')

    const updated = await StudentsRepo.assignAdvisorToStudent(
      'student-uuid-1',
      'advisor-1',
      'admin-1',
    )

    expect(updated.status).toBe('ASSIGNED')
    expect(updated.assigned_advisor_id).toBe('advisor-1')
    expect(state.history[0]).toMatchObject({
      from_status: 'AWAITING_ASSIGNMENT',
      to_status: 'ASSIGNED',
      source: 'ADVISOR_ASSIGNED',
      changed_by: 'admin-1',
    })
  })

  it('reassigning a student in APPLICATION_STARTED keeps their status (regression fix)', async () => {
    setStudent('APPLICATION_STARTED', 'advisor-1')

    const updated = await StudentsRepo.assignAdvisorToStudent(
      'student-uuid-1',
      'advisor-2',
      'admin-1',
    )

    expect(updated.assigned_advisor_id).toBe('advisor-2')
    expect(updated.status).toBe('APPLICATION_STARTED')
    expect(state.history).toHaveLength(0)
  })

  it('unassigning an active student moves them to AWAITING_ASSIGNMENT', async () => {
    setStudent('FOLLOW_UP', 'advisor-1')

    const updated = await StudentsRepo.unassignAdvisorFromStudent(
      'student-uuid-1',
      'admin-1',
    )

    expect(updated.assigned_advisor_id).toBeNull()
    expect(updated.status).toBe('AWAITING_ASSIGNMENT')
    expect(state.history[0]).toMatchObject({
      from_status: 'FOLLOW_UP',
      to_status: 'AWAITING_ASSIGNMENT',
      source: 'ADVISOR_UNASSIGNED',
    })
  })

  it.each(['CLOSED', 'COMPLETED'])(
    'unassigning a %s student does not reopen them',
    async (status) => {
      setStudent(status, 'advisor-1')

      const updated = await StudentsRepo.unassignAdvisorFromStudent(
        'student-uuid-1',
        'admin-1',
      )

      expect(updated.assigned_advisor_id).toBeNull()
      expect(updated.status).toBe(status)
      expect(state.history).toHaveLength(0)
    },
  )

  it('a manual status change stores the note on the history row', async () => {
    setStudent('FOLLOW_UP', 'advisor-1')

    await StudentsRepo.updateStudentStatus(
      'student-uuid-1',
      'CLOSED',
      'advisor-1',
      'Student chose a local university.',
    )

    expect(state.history[0]).toMatchObject({
      from_status: 'FOLLOW_UP',
      to_status: 'CLOSED',
      source: 'MANUAL',
      changed_by: 'advisor-1',
      note: 'Student chose a local university.',
    })
  })

  it('automatic changes store a null note', async () => {
    setStudent('AWAITING_ASSIGNMENT')

    await StudentsRepo.assignAdvisorToStudent(
      'student-uuid-1',
      'advisor-1',
      'admin-1',
    )

    expect(state.history[0]).toMatchObject({
      source: 'ADVISOR_ASSIGNED',
      note: null,
    })
  })

  it('a same-status change with a note still writes nothing', async () => {
    setStudent('ASSIGNED', 'advisor-1')

    await StudentsRepo.updateStudentStatus(
      'student-uuid-1',
      'ASSIGNED',
      'advisor-1',
      'ignored',
    )

    expect(state.history).toHaveLength(0)
  })

  it('a manual status change to the same status writes nothing', async () => {
    setStudent('ASSIGNED', 'advisor-1')

    await StudentsRepo.updateStudentStatus(
      'student-uuid-1',
      'ASSIGNED',
      'advisor-1',
    )

    expect(state.history).toHaveLength(0)
  })
})
