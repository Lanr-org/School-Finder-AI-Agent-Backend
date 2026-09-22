import { createError } from '../../common/errors/AppError.js'
import { assertAdvisorOwnership } from '../../common/security/ownership.js'
import type { AccessTokenClaims } from '../auth/auth.types.js'
import TeamRepo from '../team/team.repository.js'
import { buildAdvisorLookup } from '../team/advisor-lookup.js'
import { StudentsRepo } from '../students/students.repository.js'
import { toStudentResponse } from '../students/students.service.js'
import { FollowUpsService } from '../followUps/followUps.service.js'
import { FollowUpsRepo } from '../followUps/followUps.repository.js'
import type { ListFollowUpsQueryDTO } from '../followUps/followUps.types.js'
import { AdvisorsRepo } from './advisors.repository.js'
import type {
  CreateAdvisorProfileDTO,
  ListAdvisorStudentsQueryDTO,
  UpdateAdvisorProfileDTO,
  UpdateOwnAvailabilityDTO,
} from './advisors.types.js'
import type { AdvisorProfile } from '../../generated/prisma/index.js'

type ProfileUser = { public_id: string; full_name: string; email: string }
type WorkloadCounts = {
  activeStudentCount: number
  pendingFollowUpCount: number
}

const toProfileResponse = (
  profile: AdvisorProfile,
  user: ProfileUser,
  counts: WorkloadCounts,
) => ({
  advisorId: user.public_id,
  fullName: user.full_name,
  email: user.email,
  availability: profile.availability,
  maxCapacity: profile.max_capacity,
  activeStudentCount: counts.activeStudentCount,
  pendingFollowUpCount: counts.pendingFollowUpCount,
  createdAt: profile.created_at,
  updatedAt: profile.updated_at,
})

export class AdvisorsService {
  private static getAdvisorUserOrThrow = async (advisorPublicId: string) => {
    const user = await TeamRepo.findUserByPublicId(advisorPublicId)
    if (!user || user.role !== 'ADVISOR') {
      throw createError('Advisor not found', 404, {}, 'NOT_FOUND')
    }
    return user
  }

  private static getProfileOrThrow = async (userId: string) => {
    const profile = await AdvisorsRepo.findProfileByUserId(userId)
    if (!profile) {
      throw createError('Advisor profile not found', 404, {}, 'NOT_FOUND')
    }
    return profile
  }

  private static getWorkloadCounts = async (
    userId: string,
  ): Promise<WorkloadCounts> => {
    const [activeStudentCount, pendingFollowUpCount] = await Promise.all([
      AdvisorsRepo.countActiveStudentsForAdvisor(userId),
      FollowUpsRepo.countPendingForAdvisor(userId),
    ])
    return { activeStudentCount, pendingFollowUpCount }
  }

  // ── GET /advisors ────────────────────────────────────────────────────────
  static ListProfiles = async (auth: AccessTokenClaims) => {
    const profiles = await AdvisorsRepo.findAllProfiles()
    const visible =
      auth.role === 'ADVISOR'
        ? profiles.filter((profile) => profile.user_id === auth.sub)
        : profiles

    const userIds = visible.map((profile) => profile.user_id)
    const [users, activeCounts, pendingCounts] = await Promise.all([
      TeamRepo.findUsersByIds(userIds),
      AdvisorsRepo.countActiveStudentsForAdvisors(userIds),
      FollowUpsRepo.countPendingForAdvisors(userIds),
    ])
    const userLookup = new Map(users.map((user) => [user.id, user]))

    return visible
      .map((profile) => {
        const user = userLookup.get(profile.user_id)
        if (!user) return null
        return toProfileResponse(profile, user, {
          activeStudentCount: activeCounts.get(profile.user_id) ?? 0,
          pendingFollowUpCount: pendingCounts.get(profile.user_id) ?? 0,
        })
      })
      .filter(
        (profile): profile is NonNullable<typeof profile> => profile !== null,
      )
  }

  // ── GET /advisors/me ─────────────────────────────────────────────────────
  static GetOwnProfile = async (auth: AccessTokenClaims) => {
    const [user] = await TeamRepo.findUsersByIds([auth.sub])
    if (!user) {
      throw createError('Advisor not found', 404, {}, 'NOT_FOUND')
    }
    const profile = await AdvisorsService.getProfileOrThrow(auth.sub)
    const counts = await AdvisorsService.getWorkloadCounts(auth.sub)
    return toProfileResponse(profile, user, counts)
  }

  // ── GET /advisors/:advisorId ─────────────────────────────────────────────
  static GetProfile = async (
    advisorPublicId: string,
    auth: AccessTokenClaims,
  ) => {
    const user = await AdvisorsService.getAdvisorUserOrThrow(advisorPublicId)
    assertAdvisorOwnership(user.id, auth)
    const profile = await AdvisorsService.getProfileOrThrow(user.id)
    const counts = await AdvisorsService.getWorkloadCounts(user.id)
    return toProfileResponse(profile, user, counts)
  }

  // ── POST /advisors (ADMIN) ───────────────────────────────────────────────
  static CreateProfile = async (dto: CreateAdvisorProfileDTO) => {
    const user = await AdvisorsService.getAdvisorUserOrThrow(dto.userId)

    const existing = await AdvisorsRepo.findProfileByUserId(user.id)
    if (existing) {
      throw createError(
        'This advisor already has a profile',
        409,
        {},
        'CONFLICT',
      )
    }

    const profile = await AdvisorsRepo.createProfile(user.id, {
      availability: dto.availability,
      maxCapacity: dto.maxCapacity,
    })
    const counts = await AdvisorsService.getWorkloadCounts(user.id)
    return toProfileResponse(profile, user, counts)
  }

  // ── PATCH /advisors/:advisorId (ADMIN — availability + capacity) ────────
  static UpdateProfile = async (
    advisorPublicId: string,
    dto: UpdateAdvisorProfileDTO,
  ) => {
    const user = await AdvisorsService.getAdvisorUserOrThrow(advisorPublicId)
    await AdvisorsService.getProfileOrThrow(user.id)
    const updated = await AdvisorsRepo.updateProfile(user.id, dto)
    const counts = await AdvisorsService.getWorkloadCounts(user.id)
    return toProfileResponse(updated, user, counts)
  }

  // ── PATCH /advisors/me (ADVISOR — availability only) ─────────────────────
  static UpdateOwnAvailability = async (
    auth: AccessTokenClaims,
    dto: UpdateOwnAvailabilityDTO,
  ) => {
    await AdvisorsService.getProfileOrThrow(auth.sub)
    const updated = await AdvisorsRepo.updateProfile(auth.sub, {
      availability: dto.availability,
    })

    const [user] = await TeamRepo.findUsersByIds([auth.sub])
    if (!user) {
      throw createError('Advisor not found', 404, {}, 'NOT_FOUND')
    }
    const counts = await AdvisorsService.getWorkloadCounts(auth.sub)
    return toProfileResponse(updated, user, counts)
  }

  // ── GET /advisors/me/students ─────────────────────────────────────────────
  static ListOwnStudents = async (
    auth: AccessTokenClaims,
    query: ListAdvisorStudentsQueryDTO,
  ) => {
    const { students, total } = await StudentsRepo.listStudents({
      status: query.status,
      advisorUserId: auth.sub,
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

  // ── GET /advisors/:advisorId/students ─────────────────────────────────────
  static ListStudentsForAdvisor = async (
    advisorPublicId: string,
    query: ListAdvisorStudentsQueryDTO,
    auth: AccessTokenClaims,
  ) => {
    const user = await AdvisorsService.getAdvisorUserOrThrow(advisorPublicId)
    assertAdvisorOwnership(user.id, auth)
    return AdvisorsService.ListOwnStudents({ ...auth, sub: user.id }, query)
  }

  // ── GET /advisors/me/follow-ups ────────────────────────────────────────────
  static ListOwnFollowUps = async (
    auth: AccessTokenClaims,
    query: ListFollowUpsQueryDTO,
  ) => {
    return FollowUpsService.ListForAdvisor(auth.sub, query)
  }

  // ── GET /advisors/:advisorId/follow-ups ───────────────────────────────────
  static ListFollowUpsForAdvisor = async (
    advisorPublicId: string,
    query: ListFollowUpsQueryDTO,
    auth: AccessTokenClaims,
  ) => {
    const user = await AdvisorsService.getAdvisorUserOrThrow(advisorPublicId)
    assertAdvisorOwnership(user.id, auth)
    return FollowUpsService.ListForAdvisor(user.id, query)
  }
}
