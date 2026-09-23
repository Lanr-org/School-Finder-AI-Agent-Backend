import type {
  FollowUpPriority,
  FollowUpStatus,
} from '../../generated/prisma/index.js'

export interface CreateFollowUpDTO {
  dueAt: Date
  priority?: FollowUpPriority | undefined
  description: string
}

export interface UpdateFollowUpDTO {
  dueAt?: Date | undefined
  priority?: FollowUpPriority | undefined
  description?: string | undefined
}

export interface ListFollowUpsQueryDTO {
  status?: FollowUpStatus | undefined
  page: number
  limit: number
}

export interface ListFollowUpsFilters {
  status?: FollowUpStatus | undefined
  page: number
  limit: number
}
