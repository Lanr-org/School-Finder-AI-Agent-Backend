import { ConversationStatus } from '../../generated/prisma/index.js'

export interface ListConversationsQueryDTO {
  status?: ConversationStatus | undefined
  advisorId?: string | undefined
  unassigned?: boolean | undefined
  search?: string | undefined
  page: number
  limit: number
}

export interface ListConversationsFilters {
  status?: ConversationStatus | undefined
  advisorUserId?: string | undefined
  unassigned?: boolean | undefined
  search?: string | undefined
  page: number
  limit: number
}

export interface CreateReplyDTO {
  content: string
}
