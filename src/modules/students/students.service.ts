import { logger } from '../../config/logger.js'
import type {
  StudentStatus,
  Contacts,
  Student,
} from '../../generated/prisma/index.js'
import { createError } from '../../common/errors/AppError.js'
import { assertStudentOwnership } from '../../common/security/ownership.js'
import type { AccessTokenClaims } from '../auth/auth.types.js'
import TeamRepo from '../team/team.repository.js'
import { buildAdvisorLookup, type AdvisorRef } from '../team/advisor-lookup.js'
import { AdvisorsRepo } from '../advisors/advisors.repository.js'
import { StudentsRepo } from './students.repository.js'
import { StudentStatusHistoryRepo } from './statusHistory.repository.js'
import { AuditService } from '../audit/audit.service.js'
import { AUDIT_ACTIONS } from '../audit/audit.actions.js'
import type {
  AssignAdvisorToStudentDTO,
  ListStudentsQueryDTO,
  UpdateStudentPreferencesDTO,
} from './students.types.js'

type StudentWithContact = Student & { contact: Contacts }

// Exported so the advisors module can build the identical student shape for
// GET /advisors/:advisorId/students and GET /advisors/me/students.
export const toStudentResponse = (
  student: StudentWithContact,
  advisorLookup: Map<string, AdvisorRef>,
) => ({
  publicId: student.public_id,
  status: student.status,
  contact: {
    firstName: student.contact.first_name,
    lastName: student.contact.last_name,
    email: student.contact.email,
    phone: student.contact.phone,
    source: student.contact.provider_type,
  },
  studyLevel: student.study_level,
  targetDestinations: student.target_destinations,
  targetIntakeMonth: student.target_intake_month,
  targetIntakeYear: student.target_intake_year,
  budgetRange: student.budget_range,
  academicBackground: student.academic_background,
  englishTestScore: student.english_test_score,
  assignedAdvisor: student.assigned_advisor_id
    ? (advisorLookup.get(student.assigned_advisor_id) ?? null)
    : null,
  createdAt: student.created_at,
  updatedAt: student.updated_at,
})

export class StudentsService {
  /**
   * Retrieves student profile by UUID.
   */
  static getStudentById = async (studentId: string) => {
    const student = await StudentsRepo.findStudentById(studentId)
    if (!student) {
      throw createError('Student not found', 404, {}, 'NOT_FOUND')
    }
    return student
  }

  /**
   * Retrieves student profile by public display ID (e.g. STU-1048).
   */
  static getStudentByPublicId = async (publicId: string) => {
    const student = await StudentsRepo.findStudentByPublicId(publicId)
    if (!student) {
      throw createError('Student not found', 404, {}, 'NOT_FOUND')
    }
    return student
  }

  // ── GET /students/:studentId ────────────────────────────────────────────
  static GetStudent = async (publicId: string, auth: AccessTokenClaims) => {
    const student = await StudentsService.getStudentByPublicId(publicId)
    assertStudentOwnership(student.assigned_advisor_id, auth)
    const advisorLookup = await buildAdvisorLookup([
      student.assigned_advisor_id,
    ])
    return toStudentResponse(student, advisorLookup)
  }

  // ── GET /students ────────────────────────────────────────────────────────
  static ListStudents = async (
    query: ListStudentsQueryDTO,
    auth: AccessTokenClaims,
  ) => {
    // Advisors only ever see their own assigned students — the client's advisorId filter
    // is ignored for them, never trusted as a way to browse other advisors' students.
    let advisorUserId: string | undefined
    if (auth.role === 'ADVISOR') {
      advisorUserId = auth.sub
    } else if (query.advisorId !== undefined) {
      const advisor = await TeamRepo.findUserByPublicId(query.advisorId)
      if (!advisor) {
        throw createError('Advisor not found', 404, {}, 'NOT_FOUND')
      }
      advisorUserId = advisor.id
    }

    const { students, total } = await StudentsRepo.listStudents({
      status: query.status,
      advisorUserId,
      search: query.search,
      page: query.page,
      limit: query.limit,
    })

    const advisorLookup = await buildAdvisorLookup(
      students.map((student) => student.assigned_advisor_id),
    )

    return {
      students: students.map((student) =>
        toStudentResponse(student, advisorLookup),
      ),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    }
  }

  // ── PATCH /students/:studentId/advisor ──────────────────────────────────
  static AssignAdvisor = async (
    publicId: string,
    dto: AssignAdvisorToStudentDTO,
    auth: AccessTokenClaims,
  ) => {
    const student = await StudentsService.getStudentByPublicId(publicId)
    const previousAdvisor = student.assigned_advisor_id
      ? ((await buildAdvisorLookup([student.assigned_advisor_id])).get(
          student.assigned_advisor_id,
        ) ?? null)
      : null
    const before = { status: student.status, advisor: previousAdvisor }

    if (dto.advisorId === null) {
      logger.info(
        { studentId: student.id },
        'Unassigning advisor from student.',
      )
      const updated = await AuditService.withAudit(
        (tx) =>
          StudentsRepo.unassignAdvisorFromStudent(student.id, auth.sub, tx),
        (after) => ({
          action: AUDIT_ACTIONS.ADVISOR_UNASSIGNED,
          entityType: 'student',
          entityId: student.public_id,
          before,
          after: { status: after.status, advisor: null },
        }),
      )
      return toStudentResponse(
        { ...updated, contact: student.contact },
        new Map(),
      )
    }

    const advisor = await TeamRepo.findUserByPublicId(dto.advisorId)
    if (!advisor || advisor.role !== 'ADVISOR') {
      throw createError('Advisor not found', 404, {}, 'NOT_FOUND')
    }

    // No profile yet means unlimited capacity — advisor profiles are opt-in,
    // don't break assignment for advisors created before this feature shipped.
    const profile = await AdvisorsRepo.findProfileByUserId(advisor.id)
    if (profile?.max_capacity != null) {
      const activeCount = await AdvisorsRepo.countActiveStudentsForAdvisor(
        advisor.id,
      )
      if (activeCount >= profile.max_capacity) {
        throw createError(
          'Advisor is at capacity',
          409,
          { advisorId: advisor.public_id, maxCapacity: profile.max_capacity },
          'CONFLICT',
        )
      }
    }

    logger.info(
      { studentId: student.id, advisorId: advisor.id },
      'Assigning advisor to student.',
    )
    const advisorRef = {
      publicId: advisor.public_id,
      fullName: advisor.full_name,
    }
    const updated = await AuditService.withAudit(
      (tx) =>
        StudentsRepo.assignAdvisorToStudent(
          student.id,
          advisor.id,
          auth.sub,
          tx,
        ),
      (after) => ({
        action: AUDIT_ACTIONS.ADVISOR_ASSIGNED,
        entityType: 'student',
        entityId: student.public_id,
        before,
        after: { status: after.status, advisor: advisorRef },
      }),
    )
    const advisorLookup = new Map([[advisor.id, advisorRef]])
    return toStudentResponse(
      { ...updated, contact: student.contact },
      advisorLookup,
    )
  }

  /**
   * Updates student onboarding preferences.
   */
  static updateStudentPreferences = async (
    studentId: string,
    dto: UpdateStudentPreferencesDTO,
  ) => {
    logger.info({ studentId }, 'Updating student onboarding preferences.')
    return StudentsRepo.updateStudentPreferences(studentId, dto)
  }

  // ── PATCH /students/:studentId/status ───────────────────────────────────
  static UpdateStatus = async (
    publicId: string,
    newStatus: StudentStatus,
    auth: AccessTokenClaims,
    note?: string,
  ) => {
    const student = await StudentsService.getStudentByPublicId(publicId)
    assertStudentOwnership(student.assigned_advisor_id, auth)

    logger.info(
      { studentId: student.id, newStatus },
      'Updating student lifecycle status.',
    )
    // Same-status requests are a no-op (no history row), so nothing to audit.
    const updated =
      student.status === newStatus
        ? await StudentsRepo.updateStudentStatus(
            student.id,
            newStatus,
            auth.sub,
            note,
          )
        : await AuditService.withAudit(
            (tx) =>
              StudentsRepo.updateStudentStatus(
                student.id,
                newStatus,
                auth.sub,
                note,
                tx,
              ),
            (after) => ({
              action: AUDIT_ACTIONS.STUDENT_STATUS_CHANGED,
              entityType: 'student',
              entityId: student.public_id,
              before: { status: student.status },
              after: { status: after.status },
              ...(note !== undefined && { metadata: { note } }),
            }),
          )
    const advisorLookup = await buildAdvisorLookup([
      updated.assigned_advisor_id,
    ])
    return toStudentResponse(
      { ...updated, contact: student.contact },
      advisorLookup,
    )
  }

  // ── GET /students/:studentId/status-history ─────────────────────────────
  static GetStatusHistory = async (
    publicId: string,
    auth: AccessTokenClaims,
  ) => {
    const student = await StudentsService.getStudentByPublicId(publicId)
    assertStudentOwnership(student.assigned_advisor_id, auth)

    const history = await StudentStatusHistoryRepo.listForStudent(student.id)
    return history.map((entry) => ({
      fromStatus: entry.from_status,
      toStatus: entry.to_status,
      source: entry.source,
      note: entry.note,
      changedBy: entry.changer
        ? {
            publicId: entry.changer.public_id,
            fullName: entry.changer.full_name,
          }
        : null,
      changedAt: entry.created_at,
    }))
  }
}
