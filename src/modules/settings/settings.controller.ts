import type { NextFunction, Request, Response } from 'express'
import { successResponse } from '../../http/response.js'
import { SettingsService } from './settings.service.js'
import type {
  CreateSettingValueDTO,
  UpdateSettingValueDTO,
} from './settings.types.js'

export class SettingsController {
  // ── GET /settings ────────────────────────────────────────────────────────
  static ListGroups = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const result = await SettingsService.ListGroups()
      res
        .status(200)
        .json(
          successResponse(true, 'Settings retrieved successfully', result, {
            requestId: req.id,
          }),
        )
    } catch (error) {
      next(error)
    }
  }

  // ── GET /settings/:groupKey ──────────────────────────────────────────────
  static GetGroup = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const groupKey = req.params['groupKey'] as string
      const result = await SettingsService.GetGroup(groupKey)
      res
        .status(200)
        .json(
          successResponse(
            true,
            'Setting group retrieved successfully',
            result,
            { requestId: req.id },
          ),
        )
    } catch (error) {
      next(error)
    }
  }

  // ── POST /settings/:groupKey/values ──────────────────────────────────────
  static CreateValue = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const groupKey = req.params['groupKey'] as string
      const result = await SettingsService.CreateValue(
        groupKey,
        req.body as CreateSettingValueDTO,
      )
      res
        .status(201)
        .json(
          successResponse(true, 'Setting value created successfully', result, {
            requestId: req.id,
          }),
        )
    } catch (error) {
      next(error)
    }
  }

  // ── PATCH /settings/:groupKey/values/:valueId ────────────────────────────
  static UpdateValue = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const groupKey = req.params['groupKey'] as string
      const valueId = req.params['valueId'] as string
      const result = await SettingsService.UpdateValue(
        groupKey,
        valueId,
        req.body as UpdateSettingValueDTO,
      )
      res
        .status(200)
        .json(
          successResponse(true, 'Setting value updated successfully', result, {
            requestId: req.id,
          }),
        )
    } catch (error) {
      next(error)
    }
  }

  // ── DELETE /settings/:groupKey/values/:valueId ───────────────────────────
  static DeleteValue = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const groupKey = req.params['groupKey'] as string
      const valueId = req.params['valueId'] as string
      await SettingsService.DeleteValue(groupKey, valueId)
      res
        .status(200)
        .json(
          successResponse(
            true,
            'Setting value deleted successfully',
            undefined,
            { requestId: req.id },
          ),
        )
    } catch (error) {
      next(error)
    }
  }
}
