import type { NextFunction, Request, Response } from 'express'
import { successResponse } from '../../http/response.js'
import type { AccessTokenClaims } from '../auth/auth.types.js'
import { BulletinsService } from './bulletins.service.js'
import type {
  CreateBulletinDTO,
  ListBulletinsQueryDTO,
  UpdateBulletinDTO,
} from './bulletins.types.js'

export class BulletinsController {
  // ── GET /bulletins ───────────────────────────────────────────────────────
  static List = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await BulletinsService.List(
        req.query as unknown as ListBulletinsQueryDTO,
      )
      res
        .status(200)
        .json(
          successResponse(true, 'Bulletins retrieved successfully', result, {
            requestId: req.id,
          }),
        )
    } catch (error) {
      next(error)
    }
  }

  // ── POST /bulletins ──────────────────────────────────────────────────────
  static Create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.auth as AccessTokenClaims
      const result = await BulletinsService.Create(
        req.body as CreateBulletinDTO,
        auth.sub,
      )
      res
        .status(201)
        .json(
          successResponse(true, 'Bulletin created successfully', result, {
            requestId: req.id,
          }),
        )
    } catch (error) {
      next(error)
    }
  }

  // ── PATCH /bulletins/:bulletinId ─────────────────────────────────────────
  static Update = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const bulletinId = req.params['bulletinId'] as string
      const result = await BulletinsService.Update(
        bulletinId,
        req.body as UpdateBulletinDTO,
      )
      res
        .status(200)
        .json(
          successResponse(true, 'Bulletin updated successfully', result, {
            requestId: req.id,
          }),
        )
    } catch (error) {
      next(error)
    }
  }

  // ── DELETE /bulletins/:bulletinId ────────────────────────────────────────
  static Delete = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const bulletinId = req.params['bulletinId'] as string
      await BulletinsService.Delete(bulletinId)
      res
        .status(200)
        .json(
          successResponse(true, 'Bulletin deleted successfully', undefined, {
            requestId: req.id,
          }),
        )
    } catch (error) {
      next(error)
    }
  }
}
