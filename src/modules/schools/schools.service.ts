import { createError } from '../../common/errors/AppError'
import { createPublicSchoolId, withUniquePublicId } from '../../common/security/publicId'
import { SchoolsRepo } from './schools.repository'
import type { Schools } from '../../generated/prisma/index.js'
import type { CreateSchoolDTO, ListSchoolsQueryDTO, UpdateSchoolDTO } from './schools.types'

const toSchoolResponse = (school: Schools) => ({
  publicId: school.public_id,
  name: school.name,
  schoolType: school.school_type,
  recordStatus: school.record_status,
  description: school.description,

  website: school.website,
  admissionsEmail: school.admissions_email,
  phoneNumbers: school.phone_numbers,

  streetAddress: school.street_address,
  city: school.city,
  country: school.country,
  postalCode: school.postal_code,

  partnerStatus: school.partner_status,
  visaFriendlinessScore: school.visa_friendliness_score,
  visaFriendlinessNotes: school.visa_friendliness_notes,
  admissionFriendlinessScore: school.admission_friendliness_score,
  admissionFriendlinessNotes: school.admission_friendliness_notes,
  rankingReputationNotes: school.ranking_reputation_notes,

  createdAt: school.created_at,
  updatedAt: school.updated_at,
})

export class SchoolsService {
  // ── POST /schools ─────────────────────────────────────────────────────────
  static CreateSchool = async (data: CreateSchoolDTO) => {
    const school = await withUniquePublicId(createPublicSchoolId, (publicId) =>
      SchoolsRepo.createSchool(publicId, data),
    )
    return toSchoolResponse(school)
  }

  // ── GET /schools ──────────────────────────────────────────────────────────
  static ListSchools = async (query: ListSchoolsQueryDTO) => {
    const { schools, total } = await SchoolsRepo.listSchools(query)
    return {
      schools: schools.map(toSchoolResponse),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    }
  }

  // ── GET /schools/:schoolId ────────────────────────────────────────────────
  static GetSchool = async (schoolId: string) => {
    const school = await SchoolsRepo.findSchoolByPublicId(schoolId)

    if (!school) {
      throw createError('School not found', 404, {}, 'NOT_FOUND')
    }

    return toSchoolResponse(school)
  }

  // ── PATCH /schools/:schoolId ──────────────────────────────────────────────
  static UpdateSchool = async (schoolId: string, data: UpdateSchoolDTO) => {
    const school = await SchoolsRepo.findSchoolByPublicId(schoolId)

    if (!school) {
      throw createError('School not found', 404, {}, 'NOT_FOUND')
    }

    const updated = await SchoolsRepo.updateSchool(school.id, data)
    return toSchoolResponse(updated)
  }

  // ── DELETE /schools/:schoolId ─────────────────────────────────────────────
  static DeleteSchool = async (schoolId: string) => {
    const school = await SchoolsRepo.findSchoolByPublicId(schoolId)

    if (!school) {
      throw createError('School not found', 404, {}, 'NOT_FOUND')
    }

    if (school.record_status === 'INACTIVE') {
      throw createError('School is already inactive', 409, {}, 'CONFLICT')
    }

    const updated = await SchoolsRepo.softDeleteSchool(school.id)
    return toSchoolResponse(updated)
  }
}
