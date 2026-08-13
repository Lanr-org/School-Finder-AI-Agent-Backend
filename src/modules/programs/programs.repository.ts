import prisma from '../../database/prisma.js'
import type { Prisma } from '../../generated/prisma/index.js'
import type { CreateProgramDTO, ListProgramsFilters, UpdateProgramDTO } from './programs.types.js'

const withSchool = {
  include: { school: { select: { public_id: true, name: true } } },
} as const

export class ProgramsRepo {
  static createProgram = async (publicId: string, schoolId: string, data: CreateProgramDTO) => {
    return prisma.programs.create({
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

        intake_periods: data.intakePeriods ?? [],
        application_deadline: data.applicationDeadline ?? null,
        primary_intake_year: data.primaryIntakeYear ?? null,

        academic_requirements: data.academicRequirements ?? null,
        english_requirements: data.englishRequirements ?? null,
        operation_notes: data.operationNotes ?? null,
      },
    })
  }

  static findProgramByPublicId = async (publicId: string) => {
    return prisma.programs.findUnique({ where: { public_id: publicId }, ...withSchool })
  }

  static listPrograms = async (filters: ListProgramsFilters) => {
    const where: Prisma.ProgramsWhereInput = {
      ...(filters.schoolId !== undefined && { school_id: filters.schoolId }),
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

  static updateProgram = async (id: string, schoolId: string | undefined, data: UpdateProgramDTO) => {
    return prisma.programs.update({
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

        ...(data.intakePeriods !== undefined && { intake_periods: data.intakePeriods }),
        ...(data.applicationDeadline !== undefined && { application_deadline: data.applicationDeadline }),
        ...(data.primaryIntakeYear !== undefined && { primary_intake_year: data.primaryIntakeYear }),

        ...(data.academicRequirements !== undefined && { academic_requirements: data.academicRequirements }),
        ...(data.englishRequirements !== undefined && { english_requirements: data.englishRequirements }),
        ...(data.operationNotes !== undefined && { operation_notes: data.operationNotes }),
      },
    })
  }
}
