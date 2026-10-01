import prisma from '../../database/prisma.js'
import type { NotificationType, Prisma } from '../../generated/prisma/index.js'

export class NotificationsRepo {
  static createMany = async (
    userIds: string[],
    data: {
      type: NotificationType
      title: string
      body: string
      link: string | null
    },
  ) => {
    return prisma.notification.createMany({
      data: userIds.map((userId) => ({ user_id: userId, ...data })),
    })
  }

  static list = async (
    userId: string,
    filters: { page: number; limit: number; unreadOnly?: boolean | undefined },
  ) => {
    const where: Prisma.NotificationWhereInput = {
      user_id: userId,
      ...(filters.unreadOnly === true && { read_at: null }),
    }

    const [notifications, total, unreadCount] = await prisma.$transaction([
      prisma.notification.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      prisma.notification.count({ where }),
      prisma.notification.count({ where: { user_id: userId, read_at: null } }),
    ])

    return { notifications, total, unreadCount }
  }

  static findOwned = async (userId: string, id: string) => {
    return prisma.notification.findFirst({ where: { id, user_id: userId } })
  }

  // Scoped by user_id so one user can never touch another's notification.
  static markRead = async (userId: string, id: string) => {
    return prisma.notification.updateMany({
      where: { id, user_id: userId, read_at: null },
      data: { read_at: new Date() },
    })
  }

  static markAllRead = async (userId: string) => {
    return prisma.notification.updateMany({
      where: { user_id: userId, read_at: null },
      data: { read_at: new Date() },
    })
  }

  static deleteAll = async (userId: string) => {
    return prisma.notification.deleteMany({ where: { user_id: userId } })
  }
}
