import express, { type Router } from 'express'
import { TeamController } from './team.controller'
import { TeamSchemas } from './team.schemas'
import { validate } from '../../middleware/validate'
import { AuthenticateMiddleware } from '../../middleware/authenticate'
import { requireRole } from '../../middleware/authorize'

export const teamRouter: Router = express.Router()

// All team routes require authentication and the ADMIN role.
teamRouter.use(AuthenticateMiddleware, requireRole('ADMIN'))

// ── Invitations ──────────────────────────────────────────────────────────────
teamRouter.post(
  '/invitations',
  validate(TeamSchemas.invitationSchema),
  TeamController.Invitations,
)

teamRouter.post(
  '/invitations/:invitationId/resend',
  TeamController.ResendInvitations,
)

teamRouter.delete(
  '/invitations/:invitationId',
  TeamController.CancelInvitation,
)

// ── Team members ─────────────────────────────────────────────────────────────
teamRouter.get('/', TeamController.ListMembers)

teamRouter.get('/:userId', TeamController.GetMember)

teamRouter.patch(
  '/:userId',
  validate(TeamSchemas.updateMemberSchema),
  TeamController.UpdateMember,
)

teamRouter.patch(
  '/:userId/status',
  validate(TeamSchemas.updateStatusSchema),
  TeamController.UpdateMemberStatus,
)
