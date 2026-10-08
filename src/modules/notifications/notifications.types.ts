import type { NotificationType } from '../../generated/prisma/index.js'

export interface ListNotificationsQueryDTO {
  page: number
  limit: number
  unreadOnly?: boolean | undefined
}

export interface NotifyInput {
  type: NotificationType
  title: string
  body: string
  link?: string | undefined
}
