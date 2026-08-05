import express, { type Router } from 'express'
import { TeamController } from './team.controller'
import { TeamSchemas } from './team.schemas'
import { validate } from '../../middleware/validate'
import { AuthenticateMiddleware } from '../../middleware/authenticate'

export const teamRouter: Router = express.Router()

// All team routes require authentication — middleware applied first on every route

// ── Invitations ──────────────────────────────────────────────────────────────
teamRouter.post(
  '/invitations',
  AuthenticateMiddleware,
  validate(TeamSchemas.invitationSchema),
  TeamController.Invitations,
)

teamRouter.post(
  '/invitations/:invitationId/resend',
  AuthenticateMiddleware,
  TeamController.ResendInvitations,
)

teamRouter.delete(
  '/invitations/:invitationId',
  AuthenticateMiddleware,
  TeamController.CancelInvitation,
)

// ── Team members ─────────────────────────────────────────────────────────────
teamRouter.get('/', AuthenticateMiddleware, TeamController.ListMembers)

teamRouter.get('/:userId', AuthenticateMiddleware, TeamController.GetMember)

teamRouter.patch(
  '/:userId',
  AuthenticateMiddleware,
  validate(TeamSchemas.updateMemberSchema),
  TeamController.UpdateMember,
)

teamRouter.patch(
  '/:userId/status',
  AuthenticateMiddleware,
  validate(TeamSchemas.updateStatusSchema),
  TeamController.UpdateMemberStatus,
)
