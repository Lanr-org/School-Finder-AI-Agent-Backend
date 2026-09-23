import type { IntakeMonth, StudyLevel } from '../../generated/prisma/index.js'

export interface ProgramIntakeDTO {
  month: IntakeMonth
  year: number
  applicationDeadline?: Date | null
}

export interface CreateProgramDTO {
  name: string
  studyLevel: StudyLevel
  qualification: string
  category: string
  duration: string
  schoolId: string // public school ID, e.g. SCH-1001
  tuitionAmount: number
  tuitionCurrency: string
  scholarshipAvailability?: string | null
  intakes?: ProgramIntakeDTO[]
  academicRequirements?: string | null
  englishRequirements?: string | null
  operationNotes?: string | null
}

export interface UpdateProgramDTO {
  name?: string
  studyLevel?: StudyLevel
  qualification?: string
  category?: string
  duration?: string
  schoolId?: string // public school ID, e.g. SCH-1001
  tuitionAmount?: number
  tuitionCurrency?: string
  scholarshipAvailability?: string | null
  intakes?: ProgramIntakeDTO[]
  academicRequirements?: string | null
  englishRequirements?: string | null
  operationNotes?: string | null
}

export interface ListProgramsQueryDTO {
  schoolId?: string // public school ID filter, e.g. SCH-1001
  studyLevel?: StudyLevel
  category?: string
  search?: string
  page: number
  limit: number
}

// Repository-level filters use the resolved internal school UUID rather than the public ID.
export interface ListProgramsFilters {
  schoolId?: string | undefined
  studyLevel?: StudyLevel | undefined
  category?: string | undefined
  search?: string | undefined
  page: number
  limit: number
}
