import { IntakeMonth, StudentStatus } from '../../generated/prisma/index.js'

export interface UpdateStudentPreferencesDTO {
  studyLevel?: string | undefined
  targetDestinations?: string[] | undefined
  targetIntakeMonth?: IntakeMonth | undefined
  targetIntakeYear?: number | undefined
  budgetRange?: string | undefined
  academicBackground?: string | undefined
  englishTestScore?: string | undefined
}

export interface UpdateStudentStatusDTO {
  status: StudentStatus
  note?: string | undefined
}

export interface AssignAdvisorToStudentDTO {
  advisorId: string | null
}

export interface ListStudentsQueryDTO {
  status?: StudentStatus | undefined
  advisorId?: string | undefined
  search?: string | undefined
  page: number
  limit: number
}

export interface ListStudentsFilters {
  status?: StudentStatus | undefined
  advisorUserId?: string | undefined
  search?: string | undefined
  page: number
  limit: number
}
