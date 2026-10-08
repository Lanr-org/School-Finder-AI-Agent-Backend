import express, { type Router } from 'express'
import { NotificationsController } from './notifications.controller.js'
import { NotificationsSchemas } from './notifications.schemas.js'
import { validateParams, validateQuery } from '../../middleware/validate.js'
import { AuthenticateMiddleware } from '../../middleware/authenticate.js'

export const notificationsRouter: Router = express.Router()

// Every route is scoped to the authenticated user's own notifications.
notificationsRouter.use(AuthenticateMiddleware)

notificationsRouter.get(
  '/',
  validateQuery(NotificationsSchemas.listNotificationsQuerySchema),
  NotificationsController.List,
)

notificationsRouter.post('/read-all', NotificationsController.MarkAllRead)

notificationsRouter.patch(
  '/:notificationId/read',
  validateParams(NotificationsSchemas.notificationIdParamsSchema),
  NotificationsController.MarkRead,
)

notificationsRouter.delete('/', NotificationsController.Clear)
