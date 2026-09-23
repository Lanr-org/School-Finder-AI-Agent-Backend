import { createError } from '../../common/errors/AppError.js'
import { assertStudentOwnership } from '../../common/security/ownership.js'
import {
  createPublicFollowUpId,
  withUniquePublicId,
} from '../../common/security/publicId.js'
import type { AccessTokenClaims } from '../auth/auth.types.js'
import { StudentsService } from '../students/students.service.js'
import { FollowUpsRepo } from './followUps.repository.js'
import type {
  CreateFollowUpDTO,
  ListFollowUpsQueryDTO,
  UpdateFollowUpDTO,
} from './followUps.types.js'
import type { FollowUp, FollowUpStatus } from '../../generated/prisma/index.js'

const deriveStatus = (followUp: FollowUp): FollowUpStatus => {
  if (followUp.status === 'PENDING' && followUp.due_at.getTime() < Date.now()) {
    return 'OVERDUE'
  }
  return followUp.status
}

const toFollowUpResponse = (followUp: FollowUp, studentPublicId?: string) => ({
  publicId: followUp.public_id,
  ...(studentPublicId !== undefined && { studentId: studentPublicId }),
  dueAt: followUp.due_at,
  priority: followUp.priority,
  status: deriveStatus(followUp),
  description: followUp.description,
  completedAt: followUp.completed_at,
  canceledAt: followUp.canceled_at,
  createdAt: followUp.created_at,
  updatedAt: followUp.updated_at,
})

export class FollowUpsService {
  private static getOwnedStudent = async (
    studentPublicId: string,
    auth: AccessTokenClaims,
  ) => {
    const student = await StudentsService.getStudentByPublicId(studentPublicId)
    assertStudentOwnership(student.assigned_advisor_id, auth)
    return student
  }

  private static getOwnedFollowUp = async (
    studentPublicId: string,
    followUpId: string,
    auth: AccessTokenClaims,
  ) => {
    const student = await FollowUpsService.getOwnedStudent(
      studentPublicId,
      auth,
    )
    const followUp = await FollowUpsRepo.findByPublicId(student.id, followUpId)
    if (!followUp) {
      throw createError('Follow-up not found', 404, {}, 'NOT_FOUND')
    }
    return followUp
  }

  // ── GET /students/:studentId/follow-ups ─────────────────────────────────
  static ListForStudent = async (
    studentPublicId: string,
    query: ListFollowUpsQueryDTO,
    auth: AccessTokenClaims,
  ) => {
    const student = await FollowUpsService.getOwnedStudent(
      studentPublicId,
      auth,
    )
    const { followUps, total } = await FollowUpsRepo.listForStudent(
      student.id,
      query,
    )

    return {
      followUps: followUps.map((followUp) => toFollowUpResponse(followUp)),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    }
  }

  // ── POST /students/:studentId/follow-ups ────────────────────────────────
  static CreateForStudent = async (
    studentPublicId: string,
    dto: CreateFollowUpDTO,
    auth: AccessTokenClaims,
  ) => {
    const student = await FollowUpsService.getOwnedStudent(
      studentPublicId,
      auth,
    )

    const followUp = await withUniquePublicId(
      createPublicFollowUpId,
      (publicId) =>
        FollowUpsRepo.createFollowUpAndAdvanceStatus({
          publicId,
          studentId: student.id,
          advisorId: auth.sub,
          dueAt: dto.dueAt,
          priority: dto.priority ?? 'NORMAL',
          description: dto.description,
        }),
    )

    return toFollowUpResponse(followUp)
  }

  // ── PATCH /students/:studentId/follow-ups/:followUpId ───────────────────
  static Update = async (
    studentPublicId: string,
    followUpId: string,
    dto: UpdateFollowUpDTO,
    auth: AccessTokenClaims,
  ) => {
    const followUp = await FollowUpsService.getOwnedFollowUp(
      studentPublicId,
      followUpId,
      auth,
    )
    const updated = await FollowUpsRepo.updateFollowUp(followUp.id, dto)
    return toFollowUpResponse(updated)
  }

  // ── POST /students/:studentId/follow-ups/:followUpId/complete ───────────
  static Complete = async (
    studentPublicId: string,
    followUpId: string,
    auth: AccessTokenClaims,
  ) => {
    const followUp = await FollowUpsService.getOwnedFollowUp(
      studentPublicId,
      followUpId,
      auth,
    )

    if (followUp.status === 'COMPLETED') {
      throw createError(
        'This follow-up is already completed',
        409,
        {},
        'CONFLICT',
      )
    }
    if (followUp.status === 'CANCELED') {
      throw createError(
        'Cannot complete a canceled follow-up',
        409,
        {},
        'CONFLICT',
      )
    }

    const updated = await FollowUpsRepo.completeFollowUp(followUp.id)
    return toFollowUpResponse(updated)
  }

  // ── POST /students/:studentId/follow-ups/:followUpId/cancel ─────────────
  static Cancel = async (
    studentPublicId: string,
    followUpId: string,
    auth: AccessTokenClaims,
  ) => {
    const followUp = await FollowUpsService.getOwnedFollowUp(
      studentPublicId,
      followUpId,
      auth,
    )

    if (followUp.status === 'COMPLETED') {
      throw createError(
        'Cannot cancel a completed follow-up',
        409,
        {},
        'CONFLICT',
      )
    }
    if (followUp.status === 'CANCELED') {
      throw createError(
        'This follow-up is already canceled',
        409,
        {},
        'CONFLICT',
      )
    }

    const updated = await FollowUpsRepo.cancelFollowUp(followUp.id)
    return toFollowUpResponse(updated)
  }

  // ── Called from AdvisorsService for GET /advisors/:advisorId/follow-ups ─
  static ListForAdvisor = async (
    advisorUserId: string,
    query: ListFollowUpsQueryDTO,
  ) => {
    const { followUps, total } = await FollowUpsRepo.listForAdvisor(
      advisorUserId,
      query,
    )

    return {
      followUps: followUps.map((followUp) =>
        toFollowUpResponse(followUp, followUp.student.public_id),
      ),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    }
  }
}
