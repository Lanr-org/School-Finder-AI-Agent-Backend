import type {
  ApplicationStatus,
  IntakeMonth,
} from '../../generated/prisma/index.js'

export interface CreateApplicationDTO {
  programId: string
  intakeMonth?: IntakeMonth | undefined
  intakeYear?: number | undefined
  externalReference?: string | undefined
  notes?: string | undefined
}

export interface UpdateApplicationDTO {
  intakeMonth?: IntakeMonth | null | undefined
  intakeYear?: number | null | undefined
  externalReference?: string | null | undefined
  notes?: string | null | undefined
}

export interface UpdateApplicationStatusDTO {
  status: ApplicationStatus
  note?: string | undefined
}

export interface ListApplicationsQueryDTO {
  status?: ApplicationStatus | undefined
  advisorId?: string | undefined
  search?: string | undefined
  page: number
  limit: number
}

export interface ListStudentApplicationsQueryDTO {
  status?: ApplicationStatus | undefined
  page: number
  limit: number
}

export interface ListApplicationsFilters {
  status?: ApplicationStatus | undefined
  advisorUserId?: string | undefined
  search?: string | undefined
  page: number
  limit: number
}
