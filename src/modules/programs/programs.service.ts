import { createError } from '../../common/errors/AppError'
import { createPublicProgramId, withUniquePublicId } from '../../common/security/publicId'
import { SchoolsRepo } from '../schools/schools.repository'
import { ProgramsRepo } from './programs.repository'
import { AuditService } from '../audit/audit.service'
import { AUDIT_ACTIONS } from '../audit/audit.actions'
import type {
  ProgramDataReport,
  Programs,
  ProgramIntakes,
  ProgramVerificationStatus,
} from '../../generated/prisma/index.js'
import type {
  CreateProgramDTO,
  ListProgramsQueryDTO,
  ListReportsQueryDTO,
  UpdateProgramDTO,
} from './programs.types'

type PersonRef = { public_id: string; full_name: string }

type ProgramWithSchool = Programs & {
  school: { public_id: string; name: string }
  intakes: ProgramIntakes[]
  verified_by: PersonRef | null
}

type ReportWithPeople = ProgramDataReport & {
  program: { public_id: string; name: string; school: { name: string } }
  reporter: PersonRef
  resolved_by: PersonRef | null
}

const toPersonRef = (person: PersonRef | null) =>
  person ? { publicId: person.public_id, fullName: person.full_name } : null

// Fields a person confirmed against the official page. Changing any of them means the
// confirmation no longer holds. Internal notes and the category label are not facts.
const VERIFIED_FACT_FIELDS = [
  'name',
  'studyLevel',
  'qualification',
  'duration',
  'schoolId',
  'tuitionAmount',
  'tuitionCurrency',
  'scholarshipAvailability',
  'intakes',
  'academicRequirements',
  'englishRequirements',
  'sourceUrl',
  'feesAcademicYear',
] as const satisfies readonly (keyof UpdateProgramDTO)[]

export const touchesVerifiedFacts = (data: UpdateProgramDTO): boolean =>
  VERIFIED_FACT_FIELDS.some((field) => data[field] !== undefined)

// undefined means leave the status as it is.
export const nextVerificationStatus = (
  current: ProgramVerificationStatus,
  data: UpdateProgramDTO,
): ProgramVerificationStatus | undefined =>
  current !== 'UNVERIFIED' && touchesVerifiedFacts(data) ? 'UNVERIFIED' : undefined

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

  sourceUrl: program.source_url,
  feesAcademicYear: program.fees_academic_year,
  verificationStatus: program.verification_status,
  verifiedAt: program.verified_at,
  verifiedBy: toPersonRef(program.verified_by),
  evidence: (program.evidence ?? null) as Record<string, string> | null,
  lastCheckedAt: program.last_checked_at,

  createdAt: program.created_at,
  updatedAt: program.updated_at,
})

const toReportResponse = (report: ReportWithPeople) => ({
  id: report.id,
  program: {
    publicId: report.program.public_id,
    name: report.program.name,
    schoolName: report.program.school.name,
  },
  message: report.message,
  status: report.status,
  reportedBy: toPersonRef(report.reporter),
  resolvedBy: toPersonRef(report.resolved_by),
  createdAt: report.created_at,
  resolvedAt: report.resolved_at,
})

const findProgramOrThrow = async (programId: string) => {
  const program = await ProgramsRepo.findProgramByPublicId(programId)
  if (!program) {
    throw createError('Program not found', 404, {}, 'NOT_FOUND')
  }
  return program
}

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

    // withAudit inside the retry: a public-ID collision aborts the transaction.
    const program = await withUniquePublicId(createPublicProgramId, (publicId) =>
      AuditService.withAudit(
        (tx) => ProgramsRepo.createProgram(publicId, school.id, data, tx),
        (created) => ({
          action: AUDIT_ACTIONS.PROGRAM_CREATED,
          entityType: 'program',
          entityId: created.public_id,
          after: toProgramResponse(created),
        }),
      ),
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
      verificationStatus: query.verificationStatus,
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

    const verificationStatus = nextVerificationStatus(program.verification_status, data)

    const updated = await AuditService.withAudit(
      (tx) => ProgramsRepo.updateProgram(program.id, schoolId, data, verificationStatus, tx),
      (after) => ({
        action: AUDIT_ACTIONS.PROGRAM_UPDATED,
        entityType: 'program',
        entityId: program.public_id,
        before: toProgramResponse(program),
        after: toProgramResponse(after),
      }),
    )
    return toProgramResponse(updated)
  }

  // ── POST /programs/:programId/verify ────────────────────────────────────
  // A person confirms every fact matches the official page, today.
  static VerifyProgram = async (programId: string, verifiedById: string) => {
    const program = await findProgramOrThrow(programId)

    if (!program.source_url) {
      throw createError(
        'Add the official course page link before marking this programme verified',
        400,
        { sourceUrl: ['Required before verifying'] },
        'VALIDATION_ERROR',
      )
    }

    const verified = await AuditService.withAudit(
      (tx) => ProgramsRepo.markVerified(program.id, verifiedById, tx),
      (after) => ({
        action: AUDIT_ACTIONS.PROGRAM_VERIFIED,
        entityType: 'program',
        entityId: program.public_id,
        before: toProgramResponse(program),
        after: toProgramResponse(after),
      }),
    )
    return toProgramResponse(verified)
  }

  // ── POST /programs/:programId/reports ───────────────────────────────────
  // Any staff member can flag outdated data; a VERIFIED programme drops to NEEDS_RECHECK.
  static ReportOutdated = async (programId: string, reporterId: string, message: string) => {
    const program = await findProgramOrThrow(programId)
    const flagForRecheck = program.verification_status === 'VERIFIED'

    const report = await AuditService.withAudit(
      (tx) => ProgramsRepo.createReport(program.id, reporterId, message, flagForRecheck, tx),
      (created) => ({
        action: AUDIT_ACTIONS.PROGRAM_DATA_REPORTED,
        entityType: 'program',
        entityId: program.public_id,
        after: toReportResponse(created),
      }),
    )
    return toReportResponse(report)
  }

  // ── GET /program-reports ─────────────────────────────────────────────────
  static ListReports = async (query: ListReportsQueryDTO) => {
    const { reports, total } = await ProgramsRepo.listReports(query)
    return {
      reports: reports.map(toReportResponse),
      pagination: paginate(total, query.page, query.limit),
    }
  }

  // ── POST /program-reports/:reportId/resolve ──────────────────────────────
  static ResolveReport = async (reportId: string, resolvedById: string) => {
    const report = await ProgramsRepo.findReportById(reportId)

    if (!report) {
      throw createError('Report not found', 404, {}, 'NOT_FOUND')
    }
    if (report.status === 'RESOLVED') {
      throw createError('This report is already resolved', 409, {}, 'CONFLICT')
    }

    const resolved = await AuditService.withAudit(
      (tx) => ProgramsRepo.resolveReport(report.id, resolvedById, tx),
      (after) => ({
        action: AUDIT_ACTIONS.PROGRAM_REPORT_RESOLVED,
        entityType: 'program',
        entityId: report.program.public_id,
        before: toReportResponse(report),
        after: toReportResponse(after),
      }),
    )
    return toReportResponse(resolved)
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
