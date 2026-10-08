import type { NextFunction, Request, Response } from 'express'
import { successResponse } from '../../http/response.js'
import type { AccessTokenClaims } from '../auth/auth.types.js'
import { NotificationsService } from './notifications.service.js'
import type { ListNotificationsQueryDTO } from './notifications.types.js'

export class NotificationsController {
  // ── GET /notifications ───────────────────────────────────────────────────
  static List = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.auth as AccessTokenClaims
      const result = await NotificationsService.List(
        auth.sub,
        req.query as unknown as ListNotificationsQueryDTO,
      )
      res
        .status(200)
        .json(
          successResponse(
            true,
            'Notifications retrieved successfully',
            result,
            { requestId: req.id },
          ),
        )
    } catch (error) {
      next(error)
    }
  }

  // ── PATCH /notifications/:notificationId/read ────────────────────────────
  static MarkRead = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.auth as AccessTokenClaims
      const result = await NotificationsService.MarkRead(
        auth.sub,
        req.params['notificationId'] as string,
      )
      res
        .status(200)
        .json(
          successResponse(true, 'Notification marked as read', result, {
            requestId: req.id,
          }),
        )
    } catch (error) {
      next(error)
    }
  }

  // ── POST /notifications/read-all ─────────────────────────────────────────
  static MarkAllRead = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const auth = req.auth as AccessTokenClaims
      const result = await NotificationsService.MarkAllRead(auth.sub)
      res
        .status(200)
        .json(
          successResponse(true, 'Notifications marked as read', result, {
            requestId: req.id,
          }),
        )
    } catch (error) {
      next(error)
    }
  }

  // ── DELETE /notifications ────────────────────────────────────────────────
  static Clear = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.auth as AccessTokenClaims
      const result = await NotificationsService.Clear(auth.sub)
      res
        .status(200)
        .json(
          successResponse(true, 'Notifications cleared', result, {
            requestId: req.id,
          }),
        )
    } catch (error) {
      next(error)
    }
  }
}
