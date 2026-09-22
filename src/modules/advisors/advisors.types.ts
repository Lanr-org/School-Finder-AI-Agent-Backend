import type {
  AdvisorAvailability,
  StudentStatus,
} from '../../generated/prisma/index.js'

export interface CreateAdvisorProfileDTO {
  userId: string
  availability?: AdvisorAvailability | undefined
  maxCapacity?: number | null | undefined
}

export interface UpdateAdvisorProfileDTO {
  availability?: AdvisorAvailability | undefined
  maxCapacity?: number | null | undefined
}

export interface UpdateOwnAvailabilityDTO {
  availability: AdvisorAvailability
}

export interface ListAdvisorStudentsQueryDTO {
  status?: StudentStatus | undefined
  search?: string | undefined
  page: number
  limit: number
}
