import { logger } from '../../config/logger.js'
import { StudentStatus, type Contacts, type Student } from '../../generated/prisma/index.js'
import { createError } from '../../common/errors/AppError.js'
import { assertStudentOwnership } from '../../common/security/ownership.js'
import type { AccessTokenClaims } from '../auth/auth.types.js'
import TeamRepo from '../team/team.repository.js'
import { buildAdvisorLookup, type AdvisorRef } from '../team/advisor-lookup.js'
import { StudentsRepo } from './students.repository.js'
import type { AssignAdvisorToStudentDTO, ListStudentsQueryDTO, UpdateStudentPreferencesDTO } from './students.types.js'

type StudentWithContact = Student & { contact: Contacts }

const toStudentResponse = (student: StudentWithContact, advisorLookup: Map<string, AdvisorRef>) => ({
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
  assignedAdvisor: student.assigned_advisor_id ? (advisorLookup.get(student.assigned_advisor_id) ?? null) : null,
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
    const advisorLookup = await buildAdvisorLookup([student.assigned_advisor_id])
    return toStudentResponse(student, advisorLookup)
  }

  // ── GET /students ────────────────────────────────────────────────────────
  static ListStudents = async (query: ListStudentsQueryDTO, auth: AccessTokenClaims) => {
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

    const advisorLookup = await buildAdvisorLookup(students.map((student) => student.assigned_advisor_id))

    return {
      students: students.map((student) => toStudentResponse(student, advisorLookup)),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    }
  }

  // ── PATCH /students/:studentId/advisor ──────────────────────────────────
  static AssignAdvisor = async (publicId: string, dto: AssignAdvisorToStudentDTO) => {
    const student = await StudentsService.getStudentByPublicId(publicId)

    if (dto.advisorId === null) {
      logger.info({ studentId: student.id }, 'Unassigning advisor from student.')
      const updated = await StudentsRepo.unassignAdvisorFromStudent(student.id)
      return toStudentResponse({ ...updated, contact: student.contact }, new Map())
    }

    const advisor = await TeamRepo.findUserByPublicId(dto.advisorId)
    if (!advisor || advisor.role !== 'ADVISOR') {
      throw createError('Advisor not found', 404, {}, 'NOT_FOUND')
    }

    logger.info({ studentId: student.id, advisorId: advisor.id }, 'Assigning advisor to student.')
    const updated = await StudentsRepo.assignAdvisorToStudent(student.id, advisor.id)
    const advisorLookup = new Map([[advisor.id, { publicId: advisor.public_id, fullName: advisor.full_name }]])
    return toStudentResponse({ ...updated, contact: student.contact }, advisorLookup)
  }

  /**
   * Updates student onboarding preferences.
   */
  static updateStudentPreferences = async (studentId: string, dto: UpdateStudentPreferencesDTO) => {
    logger.info({ studentId }, 'Updating student onboarding preferences.')
    return StudentsRepo.updateStudentPreferences(studentId, dto)
  }

  /**
   * Updates student lifecycle status.
   */
  static updateStudentStatus = async (studentId: string, newStatus: StudentStatus) => {
    logger.info({ studentId, newStatus }, 'Updating student lifecycle status.')
    return StudentsRepo.updateStudentStatus(studentId, newStatus)
  }

}
