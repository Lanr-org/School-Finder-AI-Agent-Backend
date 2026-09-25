import { logger } from '../../config/logger.js'
import { createError } from '../../common/errors/AppError.js'
import { assertStudentOwnership } from '../../common/security/ownership.js'
import {
  createPublicApplicationId,
  withUniquePublicId,
} from '../../common/security/publicId.js'
import type {
  ApplicationStatus,
  IntakeMonth,
} from '../../generated/prisma/index.js'
import type { AccessTokenClaims } from '../auth/auth.types.js'
import { ProgramsRepo } from '../programs/programs.repository.js'
import { StudentsService } from '../students/students.service.js'
import TeamRepo from '../team/team.repository.js'
import {
  ApplicationsRepo,
  type ApplicationWithRelations,
} from './applications.repository.js'
import {
  allowedNextStatuses,
  APPLICATION_FLOW,
  canTransition,
  isTerminal,
} from './applications.transitions.js'
import type {
  CreateApplicationDTO,
  ListApplicationsQueryDTO,
  ListStudentApplicationsQueryDTO,
  UpdateApplicationDTO,
  UpdateApplicationStatusDTO,
} from './applications.types.js'

const ALL_STATUSES: ApplicationStatus[] = [
  ...APPLICATION_FLOW,
  'REJECTED',
  'WITHDRAWN',
]

const toApplicationResponse = (application: ApplicationWithRelations) => {
  const { intake_month: month, intake_year: year } = application
  const intake =
    month !== null && year !== null
      ? {
          month,
          year,
          // Deadline comes from the stored ProgramIntakes row, never guessed.
          applicationDeadline:
            application.program.intakes.find(
              (row) => row.month === month && row.year === year,
            )?.application_deadline ?? null,
        }
      : null

  return {
    publicId: application.public_id,
    status: application.status,
    student: {
      publicId: application.student.public_id,
      firstName: application.student.contact.first_name,
      lastName: application.student.contact.last_name,
    },
    program: {
      publicId: application.program.public_id,
      name: application.program.name,
      studyLevel: application.program.study_level,
    },
    school: {
      publicId: application.program.school.public_id,
      name: application.program.school.name,
      country: application.program.school.country,
    },
    intake,
    externalReference: application.external_reference,
    notes: application.notes,
    createdBy: {
      publicId: application.creator.public_id,
      fullName: application.creator.full_name,
    },
    createdAt: application.created_at,
    updatedAt: application.updated_at,
  }
}

export class ApplicationsService {
  // Ownership always goes through the application's student — never a client-sent id.
  private static getOwnedApplication = async (
    publicId: string,
    auth: AccessTokenClaims,
  ) => {
    const application = await ApplicationsRepo.findByPublicId(publicId)
    if (!application) {
      throw createError('Application not found', 404, {}, 'NOT_FOUND')
    }
    assertStudentOwnership(application.student.assigned_advisor_id, auth)
    return application
  }

  private static getOwnedStudent = async (
    studentPublicId: string,
    auth: AccessTokenClaims,
  ) => {
    const student = await StudentsService.getStudentByPublicId(studentPublicId)
    assertStudentOwnership(student.assigned_advisor_id, auth)
    return student
  }

  // Intakes must match a stored ProgramIntakes row — never an invented date.
  private static assertIntakeExists = async (
    programId: string,
    month: IntakeMonth | null | undefined,
    year: number | null | undefined,
  ) => {
    if (month == null || year == null) return
    const intake = await ApplicationsRepo.findProgramIntake(
      programId,
      month,
      year,
    )
    if (!intake) {
      throw createError(
        'This program has no intake for the selected month and year',
        400,
        {
          intake: [`${month} ${year} is not a listed intake for this program`],
        },
        'VALIDATION_ERROR',
      )
    }
  }

  // ── GET /students/:studentId/applications ───────────────────────────────
  static ListForStudent = async (
    studentPublicId: string,
    query: ListStudentApplicationsQueryDTO,
    auth: AccessTokenClaims,
  ) => {
    const student = await ApplicationsService.getOwnedStudent(
      studentPublicId,
      auth,
    )
    const { applications, total } = await ApplicationsRepo.listForStudent(
      student.id,
      query,
    )

    return {
      applications: applications.map(toApplicationResponse),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    }
  }

  // ── POST /students/:studentId/applications ──────────────────────────────
  static CreateForStudent = async (
    studentPublicId: string,
    dto: CreateApplicationDTO,
    auth: AccessTokenClaims,
  ) => {
    const student = await ApplicationsService.getOwnedStudent(
      studentPublicId,
      auth,
    )

    const program = await ProgramsRepo.findProgramByPublicId(dto.programId)
    if (!program) {
      throw createError('Program not found', 404, {}, 'NOT_FOUND')
    }

    const existing = await ApplicationsRepo.findOpenForStudentProgram(
      student.id,
      program.id,
    )
    if (existing) {
      throw createError(
        'This student already has an open application for this program',
        409,
        { programId: dto.programId, applicationId: existing.public_id },
        'CONFLICT',
      )
    }

    await ApplicationsService.assertIntakeExists(
      program.id,
      dto.intakeMonth,
      dto.intakeYear,
    )

    logger.info(
      { studentId: student.id, programId: program.id },
      'Creating student application.',
    )
    const application = await withUniquePublicId(
      createPublicApplicationId,
      (publicId) =>
        ApplicationsRepo.createWithHistory({
          publicId,
          studentId: student.id,
          programId: program.id,
          createdBy: auth.sub,
          intakeMonth: dto.intakeMonth,
          intakeYear: dto.intakeYear,
          externalReference: dto.externalReference,
          notes: dto.notes,
        }),
    )

    return toApplicationResponse(application)
  }

  // ── GET /applications ────────────────────────────────────────────────────
  static List = async (
    query: ListApplicationsQueryDTO,
    auth: AccessTokenClaims,
  ) => {
    // Advisors only ever see their own students' applications — the client's
    // advisorId filter is ignored for them, never trusted.
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

    const { applications, total, summary } = await ApplicationsRepo.list({
      status: query.status,
      advisorUserId,
      search: query.search,
      page: query.page,
      limit: query.limit,
    })

    return {
      applications: applications.map(toApplicationResponse),
      summary: Object.fromEntries(
        ALL_STATUSES.map((status) => [status, summary.get(status) ?? 0]),
      ) as Record<ApplicationStatus, number>,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    }
  }

  // ── GET /applications/:applicationId ────────────────────────────────────
  static Get = async (publicId: string, auth: AccessTokenClaims) => {
    const application = await ApplicationsService.getOwnedApplication(
      publicId,
      auth,
    )
    const history = await ApplicationsRepo.findHistory(application.id)

    return {
      ...toApplicationResponse(application),
      history: history.map((entry) => ({
        fromStatus: entry.from_status,
        toStatus: entry.to_status,
        note: entry.note,
        changedBy: entry.changer
          ? {
              publicId: entry.changer.public_id,
              fullName: entry.changer.full_name,
            }
          : null,
        changedAt: entry.created_at,
      })),
    }
  }

  // ── PATCH /applications/:applicationId ──────────────────────────────────
  static Update = async (
    publicId: string,
    dto: UpdateApplicationDTO,
    auth: AccessTokenClaims,
  ) => {
    const application = await ApplicationsService.getOwnedApplication(
      publicId,
      auth,
    )
    if (isTerminal(application.status)) {
      throw createError(
        `A ${application.status} application can no longer be edited`,
        409,
        {},
        'CONFLICT',
      )
    }

    await ApplicationsService.assertIntakeExists(
      application.program_id,
      dto.intakeMonth,
      dto.intakeYear,
    )

    const updated = await ApplicationsRepo.updateDetails(application.id, dto)
    return toApplicationResponse(updated)
  }

  // ── PATCH /applications/:applicationId/status ───────────────────────────
  static UpdateStatus = async (
    publicId: string,
    dto: UpdateApplicationStatusDTO,
    auth: AccessTokenClaims,
  ) => {
    const application = await ApplicationsService.getOwnedApplication(
      publicId,
      auth,
    )

    if (!canTransition(application.status, dto.status)) {
      throw createError(
        `Cannot move an application from ${application.status} to ${dto.status}`,
        409,
        {
          from: application.status,
          to: dto.status,
          allowed: allowedNextStatuses(application.status),
        },
        'CONFLICT',
      )
    }

    logger.info(
      {
        applicationId: application.id,
        from: application.status,
        to: dto.status,
      },
      'Updating application status.',
    )
    const updated = await ApplicationsRepo.updateStatus(
      application.id,
      application.status,
      dto.status,
      auth.sub,
      dto.note,
    )
    if (!updated) {
      throw createError(
        'Application status changed since it was loaded — refresh and retry',
        409,
        {},
        'CONFLICT',
      )
    }

    return toApplicationResponse(updated)
  }
}
