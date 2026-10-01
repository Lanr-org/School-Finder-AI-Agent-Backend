import { logger } from '../../config/logger.js'
import { createError } from '../../common/errors/AppError.js'
import { CentrifugoClient } from '../../integrations/centrifugo/services/centrifugo.client.js'
import type { Notification } from '../../generated/prisma/index.js'
import { NotificationsRepo } from './notifications.repository.js'
import type {
  ListNotificationsQueryDTO,
  NotifyInput,
} from './notifications.types.js'

const toNotificationResponse = (notification: Notification) => ({
  id: notification.id,
  type: notification.type,
  title: notification.title,
  body: notification.body,
  link: notification.link,
  readAt: notification.read_at,
  createdAt: notification.created_at,
})

export class NotificationsService {
  // Creates one notification per recipient. Never throws: a notification
  // failure must not fail the business action that triggered it.
  static notify = async (userIds: string[], input: NotifyInput) => {
    const recipients = [...new Set(userIds)]
    if (recipients.length === 0) return

    try {
      await NotificationsRepo.createMany(recipients, {
        type: input.type,
        title: input.title,
        body: input.body,
        link: input.link ?? null,
      })
    } catch (error) {
      logger.error(
        { error: (error as Error).message, type: input.type },
        'Failed to create notifications.',
      )
      return
    }

    // Best-effort live push; the staff app also polls, so a miss is harmless.
    await Promise.all(
      recipients.map((userId) =>
        CentrifugoClient.publish(`advisors#${userId}`, {
          event: 'advisor.notification',
          data: {
            type: input.type,
            title: input.title,
            body: input.body,
            link: input.link ?? null,
          },
          timestamp: new Date().toISOString(),
        }),
      ),
    )
  }

  // ── GET /notifications ───────────────────────────────────────────────────
  static List = async (userId: string, query: ListNotificationsQueryDTO) => {
    const { notifications, total, unreadCount } = await NotificationsRepo.list(
      userId,
      query,
    )

    return {
      notifications: notifications.map(toNotificationResponse),
      unreadCount,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    }
  }

  // ── PATCH /notifications/:notificationId/read ────────────────────────────
  static MarkRead = async (userId: string, notificationId: string) => {
    const existing = await NotificationsRepo.findOwned(userId, notificationId)
    if (!existing) {
      throw createError('Notification not found', 404, {}, 'NOT_FOUND')
    }
    await NotificationsRepo.markRead(userId, notificationId)
    return { id: notificationId }
  }

  // ── POST /notifications/read-all ─────────────────────────────────────────
  static MarkAllRead = async (userId: string) => {
    const result = await NotificationsRepo.markAllRead(userId)
    return { updated: result.count }
  }

  // ── DELETE /notifications ────────────────────────────────────────────────
  static Clear = async (userId: string) => {
    const result = await NotificationsRepo.deleteAll(userId)
    return { deleted: result.count }
  }
}
