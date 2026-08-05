import type { NextFunction, Request, Response } from 'express'
import { TeamService } from './team.service'
import type {
  InvitationData,
  UpdateTeamMemberData,
  UpdateTeamMemberStatusData,
} from './team.types'
import type { AccessTokenClaims } from '../auth/auth.types'
import { successResponse } from '../../http/response'

export class TeamController {
  // ── POST /team/invitations ─────────────────────────────────────────────────
  static Invitations = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const result = await TeamService.Invitation(
        req.auth as AccessTokenClaims,
        req.body as InvitationData,
      )
      res.status(201).json(
        successResponse(true, 'Invitation sent successfully', result, {
          requestId: req.id,
        }),
      )
    } catch (error) {
      next(error)
    }
  }

  // ── POST /team/invitations/:invitationId/resend ────────────────────────────
  static ResendInvitations = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const invitationId = req.params['invitationId'] as string
      const result = await TeamService.ResendInvitation(
        req.auth as AccessTokenClaims,
        invitationId,
      )
      res.status(200).json(
        successResponse(true, 'Invitation resent successfully', result, {
          requestId: req.id,
        }),
      )
    } catch (error) {
      next(error)
    }
  }

  // ── DELETE /team/invitations/:invitationId ─────────────────────────────────
  static CancelInvitation = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const invitationId = req.params['invitationId'] as string
      await TeamService.CancelInvitation(
        req.auth as AccessTokenClaims,
        invitationId,
      )
      res.status(200).json(
        successResponse(true, 'Invitation canceled', undefined, {
          requestId: req.id,
        }),
      )
    } catch (error) {
      next(error)
    }
  }

  // ── GET /team ──────────────────────────────────────────────────────────────
  static ListMembers = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const result = await TeamService.ListMembers()
      res.status(200).json(
        successResponse(true, 'Team members retrieved', result, {
          requestId: req.id,
        }),
      )
    } catch (error) {
      next(error)
    }
  }

  // ── GET /team/:userId ──────────────────────────────────────────────────────
  static GetMember = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const userId = req.params['userId'] as string
      const result = await TeamService.GetMember(userId)
      res.status(200).json(
        successResponse(true, 'Team member retrieved', result, {
          requestId: req.id,
        }),
      )
    } catch (error) {
      next(error)
    }
  }

  // ── PATCH /team/:userId ────────────────────────────────────────────────────
  static UpdateMember = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const userId = req.params['userId'] as string
      const result = await TeamService.UpdateMember(
        userId,
        req.body as UpdateTeamMemberData,
      )
      res.status(200).json(
        successResponse(true, 'Team member updated', result, {
          requestId: req.id,
        }),
      )
    } catch (error) {
      next(error)
    }
  }

  // ── PATCH /team/:userId/status ─────────────────────────────────────────────
  static UpdateMemberStatus = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const userId = req.params['userId'] as string
      const result = await TeamService.UpdateMemberStatus(
        userId,
        req.body as UpdateTeamMemberStatusData,
      )
      res.status(200).json(
        successResponse(true, 'Team member status updated', result, {
          requestId: req.id,
        }),
      )
    } catch (error) {
      next(error)
    }
  }
}
