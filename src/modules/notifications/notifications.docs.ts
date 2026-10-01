import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi'
import { z } from 'zod'
import { NotificationsSchemas } from './notifications.schemas'
import {
  errorContent,
  paginationSchema,
  successEnvelope,
} from '../../docs/registry'

export const registerNotificationsDocs = (registry: OpenAPIRegistry) => {
  // Mirrors toNotificationResponse (notifications.service.ts).
  const notificationSchema = z.object({
    id: z.string().uuid(),
    type: z.enum([
      'ASSIGNMENT',
      'CONVERSATION',
      'FOLLOW_UP',
      'RECOMMENDATION',
      'TEAM',
      'SYSTEM',
    ]),
    title: z.string(),
    body: z.string(),
    link: z.string().nullable().openapi({
      description: 'Staff-app path to open, e.g. /conversations/CNV-1048.',
    }),
    readAt: z.date().nullable(),
    createdAt: z.date(),
  })

  const notificationListResponseSchema = registry.register(
    'NotificationListResponse',
    successEnvelope(
      z.object({
        notifications: z.array(notificationSchema),
        unreadCount: z.number().int(),
        pagination: paginationSchema,
      }),
    ),
  )
  const markReadResponseSchema = registry.register(
    'NotificationMarkReadResponse',
    successEnvelope(z.object({ id: z.string().uuid() })),
  )
  const markAllReadResponseSchema = registry.register(
    'NotificationMarkAllReadResponse',
    successEnvelope(z.object({ updated: z.number().int() })),
  )
  const clearResponseSchema = registry.register(
    'NotificationClearResponse',
    successEnvelope(z.object({ deleted: z.number().int() })),
  )

  const registeredIdParamsSchema = registry.register(
    'NotificationIdParams',
    NotificationsSchemas.notificationIdParamsSchema,
  )
  const registeredListQuerySchema = registry.register(
    'ListNotificationsQuery',
    NotificationsSchemas.listNotificationsQuerySchema,
  )

  const unauthorized = errorContent('Bearer token is missing or invalid.')
  const NOTE =
    'Requires a bearer access token. Any authenticated role; always scoped to the calling user’s own notifications.'

  registry.registerPath({
    method: 'get',
    path: '/api/v1/notifications',
    tags: ['Notifications'],
    security: [{ bearerAuth: [] }],
    summary: 'List my notifications',
    description: `${NOTE} Newest first; unreadCount covers all pages.`,
    request: { query: registeredListQuerySchema },
    responses: {
      200: {
        description: 'Notifications retrieved.',
        content: {
          'application/json': { schema: notificationListResponseSchema },
        },
      },
      400: errorContent('Query parameter validation failed.'),
      401: unauthorized,
    },
  })

  registry.registerPath({
    method: 'patch',
    path: '/api/v1/notifications/{notificationId}/read',
    tags: ['Notifications'],
    security: [{ bearerAuth: [] }],
    summary: 'Mark one notification as read',
    description: NOTE,
    request: { params: registeredIdParamsSchema },
    responses: {
      200: {
        description: 'Notification marked as read.',
        content: { 'application/json': { schema: markReadResponseSchema } },
      },
      400: errorContent('Path parameter validation failed.'),
      401: unauthorized,
      404: errorContent('Notification not found for this user.'),
    },
  })

  registry.registerPath({
    method: 'post',
    path: '/api/v1/notifications/read-all',
    tags: ['Notifications'],
    security: [{ bearerAuth: [] }],
    summary: 'Mark all my notifications as read',
    description: NOTE,
    responses: {
      200: {
        description: 'Notifications marked as read.',
        content: { 'application/json': { schema: markAllReadResponseSchema } },
      },
      401: unauthorized,
    },
  })

  registry.registerPath({
    method: 'delete',
    path: '/api/v1/notifications',
    tags: ['Notifications'],
    security: [{ bearerAuth: [] }],
    summary: 'Clear all my notifications',
    description: NOTE,
    responses: {
      200: {
        description: 'Notifications cleared.',
        content: { 'application/json': { schema: clearResponseSchema } },
      },
      401: unauthorized,
    },
  })
}
