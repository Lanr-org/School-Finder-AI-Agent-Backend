import type { NextFunction, Request, Response } from 'express'
import { successResponse } from '../../http/response.js'
import type { AccessTokenClaims } from '../auth/auth.types.js'
import type { ListFollowUpsQueryDTO } from '../followUps/followUps.types.js'
import { AdvisorsService } from './advisors.service.js'
import type {
  CreateAdvisorProfileDTO,
  ListAdvisorStudentsQueryDTO,
  UpdateAdvisorProfileDTO,
  UpdateOwnAvailabilityDTO,
} from './advisors.types.js'

export class AdvisorsController {
  // ── GET /advisors ────────────────────────────────────────────────────────
  static ListProfiles = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const result = await AdvisorsService.ListProfiles(
        req.auth as AccessTokenClaims,
      )
      res
        .status(200)
        .json(
          successResponse(
            true,
            'Advisor profiles retrieved successfully',
            result,
            { requestId: req.id },
          ),
        )
    } catch (error) {
      next(error)
    }
  }

  // ── GET /advisors/me ─────────────────────────────────────────────────────
  static GetOwnProfile = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const result = await AdvisorsService.GetOwnProfile(
        req.auth as AccessTokenClaims,
      )
      res
        .status(200)
        .json(
          successResponse(
            true,
            'Advisor profile retrieved successfully',
            result,
            { requestId: req.id },
          ),
        )
    } catch (error) {
      next(error)
    }
  }

  // ── GET /advisors/:advisorId ─────────────────────────────────────────────
  static GetProfile = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const advisorId = req.params['advisorId'] as string
      const result = await AdvisorsService.GetProfile(
        advisorId,
        req.auth as AccessTokenClaims,
      )
      res
        .status(200)
        .json(
          successResponse(
            true,
            'Advisor profile retrieved successfully',
            result,
            { requestId: req.id },
          ),
        )
    } catch (error) {
      next(error)
    }
  }

  // ── POST /advisors ───────────────────────────────────────────────────────
  static CreateProfile = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const result = await AdvisorsService.CreateProfile(
        req.body as CreateAdvisorProfileDTO,
      )
      res
        .status(201)
        .json(
          successResponse(
            true,
            'Advisor profile created successfully',
            result,
            { requestId: req.id },
          ),
        )
    } catch (error) {
      next(error)
    }
  }

  // ── PATCH /advisors/:advisorId ───────────────────────────────────────────
  static UpdateProfile = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const advisorId = req.params['advisorId'] as string
      const result = await AdvisorsService.UpdateProfile(
        advisorId,
        req.body as UpdateAdvisorProfileDTO,
      )
      res
        .status(200)
        .json(
          successResponse(
            true,
            'Advisor profile updated successfully',
            result,
            { requestId: req.id },
          ),
        )
    } catch (error) {
      next(error)
    }
  }

  // ── PATCH /advisors/me ───────────────────────────────────────────────────
  static UpdateOwnAvailability = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const result = await AdvisorsService.UpdateOwnAvailability(
        req.auth as AccessTokenClaims,
        req.body as UpdateOwnAvailabilityDTO,
      )
      res
        .status(200)
        .json(
          successResponse(true, 'Availability updated successfully', result, {
            requestId: req.id,
          }),
        )
    } catch (error) {
      next(error)
    }
  }

  // ── GET /advisors/me/students ─────────────────────────────────────────────
  static ListOwnStudents = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const auth = req.auth as AccessTokenClaims
      const result = await AdvisorsService.ListOwnStudents(
        auth,
        req.query as unknown as ListAdvisorStudentsQueryDTO,
      )
      res
        .status(200)
        .json(
          successResponse(true, 'Students retrieved successfully', result, {
            requestId: req.id,
          }),
        )
    } catch (error) {
      next(error)
    }
  }

  // ── GET /advisors/:advisorId/students ─────────────────────────────────────
  static ListStudentsForAdvisor = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const advisorId = req.params['advisorId'] as string
      const auth = req.auth as AccessTokenClaims
      const result = await AdvisorsService.ListStudentsForAdvisor(
        advisorId,
        req.query as unknown as ListAdvisorStudentsQueryDTO,
        auth,
      )
      res
        .status(200)
        .json(
          successResponse(true, 'Students retrieved successfully', result, {
            requestId: req.id,
          }),
        )
    } catch (error) {
      next(error)
    }
  }

  // ── GET /advisors/me/follow-ups ────────────────────────────────────────────
  static ListOwnFollowUps = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const auth = req.auth as AccessTokenClaims
      const result = await AdvisorsService.ListOwnFollowUps(
        auth,
        req.query as unknown as ListFollowUpsQueryDTO,
      )
      res
        .status(200)
        .json(
          successResponse(true, 'Follow-ups retrieved successfully', result, {
            requestId: req.id,
          }),
        )
    } catch (error) {
      next(error)
    }
  }

  // ── GET /advisors/:advisorId/follow-ups ───────────────────────────────────
  static ListFollowUpsForAdvisor = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const advisorId = req.params['advisorId'] as string
      const auth = req.auth as AccessTokenClaims
      const result = await AdvisorsService.ListFollowUpsForAdvisor(
        advisorId,
        req.query as unknown as ListFollowUpsQueryDTO,
        auth,
      )
      res
        .status(200)
        .json(
          successResponse(true, 'Follow-ups retrieved successfully', result, {
            requestId: req.id,
          }),
        )
    } catch (error) {
      next(error)
    }
  }
}
