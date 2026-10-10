import prisma from '../../database/prisma.js'
import {
  Prisma,
  type ProgramDataReportStatus,
  type ProgramVerificationStatus,
} from '../../generated/prisma/index.js'
import { withTx, type Db, type Tx } from '../../database/transaction.js'
import type { CreateProgramDTO, ListProgramsFilters, UpdateProgramDTO } from './programs.types.js'

const withSchool = {
  include: {
    school: { select: { public_id: true, name: true } },
    intakes: true,
    verified_by: { select: { public_id: true, full_name: true } },
  },
} as const

const withReportPeople = {
  include: {
    program: { select: { public_id: true, name: true, school: { select: { name: true } } } },
    reporter: { select: { public_id: true, full_name: true } },
    resolved_by: { select: { public_id: true, full_name: true } },
  },
} as const

// Prisma wants Prisma.DbNull, not null, to clear a Json column.
const toJson = (evidence: Record<string, string> | null) =>
  evidence === null ? Prisma.DbNull : evidence

export class ProgramsRepo {
  static createProgram = async (
    publicId: string,
    schoolId: string,
    data: CreateProgramDTO,
    db: Db = prisma,
  ) => {
    return db.programs.create({
      ...withSchool,
      data: {
        public_id: publicId,
        name: data.name,
        study_level: data.studyLevel,
        qualification: data.qualification,
        category: data.category,
        duration: data.duration,
        school_id: schoolId,

        tuition_amount: data.tuitionAmount,
        tuition_currency: data.tuitionCurrency,
        scholarship_availability: data.scholarshipAvailability ?? null,

        intakes: {
          create: (data.intakes ?? []).map((intake) => ({
            month: intake.month,
            year: intake.year,
            application_deadline: intake.applicationDeadline ?? null,
          })),
        },

        academic_requirements: data.academicRequirements ?? null,
        english_requirements: data.englishRequirements ?? null,
        operation_notes: data.operationNotes ?? null,

        source_url: data.sourceUrl ?? null,
        fees_academic_year: data.feesAcademicYear ?? null,
        ...(data.evidence != null && { evidence: data.evidence }),
      },
    })
  }

  static findProgramByPublicId = async (publicId: string) => {
    return prisma.programs.findUnique({ where: { public_id: publicId }, ...withSchool })
  }

  static listPrograms = async (filters: ListProgramsFilters) => {
    const where: Prisma.ProgramsWhereInput = {
      ...(filters.schoolId !== undefined && { school_id: filters.schoolId }),
      ...(filters.verificationStatus !== undefined && {
        verification_status: filters.verificationStatus,
      }),
      ...(filters.studyLevel !== undefined && { study_level: filters.studyLevel }),
      ...(filters.category !== undefined && { category: filters.category }),
      ...(filters.search !== undefined && {
        name: { contains: filters.search, mode: 'insensitive' },
      }),
    }

    const [programs, total] = await prisma.$transaction([
      prisma.programs.findMany({
        where,
        ...withSchool,
        orderBy: { created_at: 'desc' },
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      prisma.programs.count({ where }),
    ])

    return { programs, total }
  }

  // verificationStatus is decided by the service (a fact edit drops a VERIFIED programme back to UNVERIFIED).
  static updateProgram = async (
    id: string,
    schoolId: string | undefined,
    data: UpdateProgramDTO,
    verificationStatus: ProgramVerificationStatus | undefined,
    db: Db = prisma,
  ) => {
    return db.programs.update({
      where: { id },
      ...withSchool,
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.studyLevel !== undefined && { study_level: data.studyLevel }),
        ...(data.qualification !== undefined && { qualification: data.qualification }),
        ...(data.category !== undefined && { category: data.category }),
        ...(data.duration !== undefined && { duration: data.duration }),
        ...(schoolId !== undefined && { school_id: schoolId }),

        ...(data.tuitionAmount !== undefined && { tuition_amount: data.tuitionAmount }),
        ...(data.tuitionCurrency !== undefined && { tuition_currency: data.tuitionCurrency }),
        ...(data.scholarshipAvailability !== undefined && {
          scholarship_availability: data.scholarshipAvailability,
        }),

        ...(data.intakes !== undefined && {
          intakes: {
            deleteMany: {},
            create: data.intakes.map((intake) => ({
              month: intake.month,
              year: intake.year,
              application_deadline: intake.applicationDeadline ?? null,
            })),
          },
        }),

        ...(data.academicRequirements !== undefined && { academic_requirements: data.academicRequirements }),
        ...(data.englishRequirements !== undefined && { english_requirements: data.englishRequirements }),
        ...(data.operationNotes !== undefined && { operation_notes: data.operationNotes }),

        ...(data.sourceUrl !== undefined && { source_url: data.sourceUrl }),
        ...(data.feesAcademicYear !== undefined && { fees_academic_year: data.feesAcademicYear }),
        ...(data.evidence !== undefined && { evidence: toJson(data.evidence) }),
        ...(verificationStatus !== undefined && { verification_status: verificationStatus }),
      },
    })
  }

  static markVerified = async (id: string, verifiedById: string, db: Db = prisma) => {
    return db.programs.update({
      where: { id },
      ...withSchool,
      data: {
        verification_status: 'VERIFIED',
        verified_at: new Date(),
        verified_by_id: verifiedById,
      },
    })
  }

  // ── Outdated-data reports ────────────────────────────────────────────────

  // Filing a report puts a VERIFIED programme back to NEEDS_RECHECK in the same transaction.
  static createReport = async (
    programId: string,
    reporterId: string,
    message: string,
    flagForRecheck: boolean,
    outerTx?: Tx,
  ) => {
    return withTx(outerTx, async (tx) => {
      if (flagForRecheck) {
        await tx.programs.update({
          where: { id: programId },
          data: { verification_status: 'NEEDS_RECHECK' },
        })
      }
      return tx.programDataReport.create({
        ...withReportPeople,
        data: { program_id: programId, reporter_id: reporterId, message },
      })
    })
  }

  static findReportById = async (id: string) => {
    return prisma.programDataReport.findUnique({ where: { id }, ...withReportPeople })
  }

  static listReports = async (filters: {
    status: ProgramDataReportStatus
    programId?: string | undefined
    page: number
    limit: number
  }) => {
    const where: Prisma.ProgramDataReportWhereInput = {
      status: filters.status,
      ...(filters.programId !== undefined && { program_id: filters.programId }),
    }
    const [reports, total] = await prisma.$transaction([
      prisma.programDataReport.findMany({
        where,
        ...withReportPeople,
        orderBy: { created_at: 'desc' },
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      prisma.programDataReport.count({ where }),
    ])
    return { reports, total }
  }

  static resolveReport = async (id: string, resolvedById: string, db: Db = prisma) => {
    return db.programDataReport.update({
      where: { id },
      ...withReportPeople,
      data: { status: 'RESOLVED', resolved_by_id: resolvedById, resolved_at: new Date() },
    })
  }
}
