import { createError } from '../../common/errors/AppError'
import { createPublicProgramId, withUniquePublicId } from '../../common/security/publicId'
import { SchoolsRepo } from '../schools/schools.repository'
import { ProgramsRepo } from './programs.repository'
import type { Programs, ProgramIntakes } from '../../generated/prisma/index.js'
import type { CreateProgramDTO, ListProgramsQueryDTO, UpdateProgramDTO } from './programs.types'

type ProgramWithSchool = Programs & {
  school: { public_id: string; name: string }
  intakes: ProgramIntakes[]
}

const toProgramResponse = (program: ProgramWithSchool) => ({
  publicId: program.public_id,
  name: program.name,
  studyLevel: program.study_level,
  qualification: program.qualification,
  category: program.category,
  duration: program.duration,
  school: { publicId: program.school.public_id, name: program.school.name },

  tuitionAmount: program.tuition_amount,
  tuitionCurrency: program.tuition_currency,
  scholarshipAvailability: program.scholarship_availability,

  intakes: program.intakes.map((intake) => ({
    month: intake.month,
    year: intake.year,
    applicationDeadline: intake.application_deadline,
  })),

  academicRequirements: program.academic_requirements,
  englishRequirements: program.english_requirements,
  operationNotes: program.operation_notes,

  createdAt: program.created_at,
  updatedAt: program.updated_at,
})

const paginate = (total: number, page: number, limit: number) => ({
  page,
  limit,
  total,
  totalPages: Math.ceil(total / limit),
})

export class ProgramsService {
  // ── POST /programs ───────────────────────────────────────────────────────
  static CreateProgram = async (data: CreateProgramDTO) => {
    const school = await SchoolsRepo.findSchoolByPublicId(data.schoolId)

    if (!school) {
      throw createError('School not found', 404, {}, 'NOT_FOUND')
    }

    const program = await withUniquePublicId(createPublicProgramId, (publicId) =>
      ProgramsRepo.createProgram(publicId, school.id, data),
    )
    return toProgramResponse(program)
  }

  // ── GET /programs ────────────────────────────────────────────────────────
  static ListPrograms = async (query: ListProgramsQueryDTO) => {
    let schoolId: string | undefined

    if (query.schoolId !== undefined) {
      const school = await SchoolsRepo.findSchoolByPublicId(query.schoolId)

      if (!school) {
        throw createError('School not found', 404, {}, 'NOT_FOUND')
      }

      schoolId = school.id
    }

    const { programs, total } = await ProgramsRepo.listPrograms({
      schoolId,
      studyLevel: query.studyLevel,
      category: query.category,
      search: query.search,
      page: query.page,
      limit: query.limit,
    })

    return {
      programs: programs.map(toProgramResponse),
      pagination: paginate(total, query.page, query.limit),
    }
  }

  // ── GET /programs/:programId ────────────────────────────────────────────
  static GetProgram = async (programId: string) => {
    const program = await ProgramsRepo.findProgramByPublicId(programId)

    if (!program) {
      throw createError('Program not found', 404, {}, 'NOT_FOUND')
    }

    return toProgramResponse(program)
  }

  // ── PATCH /programs/:programId ──────────────────────────────────────────
  static UpdateProgram = async (programId: string, data: UpdateProgramDTO) => {
    const program = await ProgramsRepo.findProgramByPublicId(programId)

    if (!program) {
      throw createError('Program not found', 404, {}, 'NOT_FOUND')
    }

    let schoolId: string | undefined

    if (data.schoolId !== undefined) {
      const school = await SchoolsRepo.findSchoolByPublicId(data.schoolId)

      if (!school) {
        throw createError('School not found', 404, {}, 'NOT_FOUND')
      }

      schoolId = school.id
    }

    const updated = await ProgramsRepo.updateProgram(program.id, schoolId, data)
    return toProgramResponse(updated)
  }

  // ── GET /schools/:schoolId/programs ─────────────────────────────────────
  static ListProgramsForSchool = async (
    schoolPublicId: string,
    query: Omit<ListProgramsQueryDTO, 'schoolId'>,
  ) => {
    const school = await SchoolsRepo.findSchoolByPublicId(schoolPublicId)

    if (!school) {
      throw createError('School not found', 404, {}, 'NOT_FOUND')
    }

    const { programs, total } = await ProgramsRepo.listPrograms({
      schoolId: school.id,
      studyLevel: query.studyLevel,
      category: query.category,
      search: query.search,
      page: query.page,
      limit: query.limit,
    })

    return {
      programs: programs.map(toProgramResponse),
      pagination: paginate(total, query.page, query.limit),
    }
  }
}
