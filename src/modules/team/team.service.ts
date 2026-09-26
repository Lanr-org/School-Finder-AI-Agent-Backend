import { createError } from '../../common/errors/AppError'
import {
  generateOpaqueToken,
  hashOpaqueToken,
} from '../../common/security/opaqueToken'
import AuthRepo from '../auth/auth.repository'
import TeamRepo from './team.repository'
import type { AccessTokenClaims } from '../auth/auth.types'
import type {
  CreateAndInviteData,
  InvitationData,
  UpdateInvitationData,
  UpdateTeamMemberData,
  UpdateTeamMemberStatusData,
} from './team.types'
import { createPublicUserId } from '../../common/security/publicId'
import { buildInviteEmail } from '../../integrations/email/email.templates'
import env from '../../config/env'
import EmailProvider from '../../integrations/email/email.provider'
import { logger } from '../../config/logger'
import { AuditService } from '../audit/audit.service'
import { AUDIT_ACTIONS } from '../audit/audit.actions'

const INVITATION_TTL_MINUTES = 60

// Allowlisted audit snapshot of a team member — never password/token fields.
const snapshotMember = (user: {
  public_id: string
  full_name: string
  email: string
  phone: string | null
  role: string
  status: string
}) => ({
  publicId: user.public_id,
  fullName: user.full_name,
  email: user.email,
  phone: user.phone,
  role: user.role,
  status: user.status,
})

export class TeamService {
  // ── POST /team/invitations ─────────────────────────────────────────────────
  static Invitation = async (
    auth: AccessTokenClaims,
    invitationData: InvitationData,
  ) => {
    const email = invitationData.email.trim().toLowerCase()

    // Duplicate-email guard — gives a clean CONFLICT instead of a raw Prisma error
    const existingUser = await AuthRepo.findUser({ email })
    if (existingUser) {
      throw createError(
        'A user with this email address already exists',
        409,
        { email },
        'CONFLICT',
      )
    }

    const data: CreateAndInviteData = {
      publicId: createPublicUserId(),
      fullName: invitationData.fullName,
      email,
      phone: invitationData.phone ?? null,
      role: invitationData.role,
      status: 'INVITED',
      adminId: auth.sub,
      token_hash: hashOpaqueToken(generateOpaqueToken()),
      expiresAt: new Date(Date.now() + INVITATION_TTL_MINUTES * 60 * 1000),
      sent_at: new Date(),
      last_sent_at: new Date(),
    }

    // Generate a fresh token for the email link (data.token_hash holds the hash)
    const rawToken = generateOpaqueToken()
    data.token_hash = hashOpaqueToken(rawToken)

    const { user, invite } = await AuditService.withAudit(
      (tx) => TeamRepo.CreateInviteUser(data, tx),
      (created) => ({
        action: AUDIT_ACTIONS.INVITATION_CREATED,
        entityType: 'invitation',
        entityId: created.user.public_id,
        after: {
          ...snapshotMember(created.user),
          expiresAt: created.invite.expires_at,
        },
      }),
    )

    const setUrl = new URL(`/set-password/${rawToken}`, env.frontendUrl).href

    // Fetch the inviter's name from the DB (auth.sub is already validated by AuthenticateMiddleware)
    const admin = await AuthRepo.findUser({ id: auth.sub })

    try {
      await EmailProvider.send(
        buildInviteEmail({
          fullName: invitationData.fullName,
          inviterName: admin?.full_name ?? 'A team member',
          inviteUrl: setUrl,
          role: invitationData.role,
          to: email,
          expiresInMinutes: INVITATION_TTL_MINUTES,
        }),
      )
    } catch (error) {
      logger.error(
        {
          err: error,
          userId: auth.sub,
          invitationExpiresAt: invite.expires_at,
        },
        'Failed to send invitation email',
      )
    }

    // Always return the result regardless of whether the email succeeded
    return {
      publicId: user.public_id,
      fullName: user.full_name,
      email: user.email,
      role: user.role,
      status: user.status,
      expiresAt: invite.expires_at,
      sentAt: invite.sent_at,
    }
  }

  // ── POST /team/invitations/:invitationId/resend ────────────────────────────
  static ResendInvitation = async (
    auth: AccessTokenClaims,
    invitationId: string,
  ) => {
    const invitation = await TeamRepo.findInvitationById(invitationId)

    if (!invitation) {
      throw createError('Invitation not found', 404, {}, 'NOT_FOUND')
    }

    if (invitation.accepted_at) {
      throw createError(
        'This invitation has already been accepted',
        409,
        {},
        'INVITATION_ALREADY_ACCEPTED',
      )
    }

    if (invitation.canceled_at) {
      throw createError(
        'This invitation has been canceled',
        409,
        {},
        'INVITATION_CANCELED',
      )
    }

    const rawToken = generateOpaqueToken()
    const hashToken = hashOpaqueToken(rawToken)
    const expiresAt = new Date(Date.now() + INVITATION_TTL_MINUTES * 60 * 1000)
    const lastSentAt = new Date()

    const updateData: UpdateInvitationData = {
      id: invitation.id,
      hashToken,
      expiresAt,
      lastSentAt,
      count: invitation.send_count + 1,
    }

    const updated = await AuditService.withAudit(
      (tx) => TeamRepo.UpdateTeamInvitation(updateData, tx),
      (resent) => ({
        action: AUDIT_ACTIONS.INVITATION_RESENT,
        entityType: 'invitation',
        entityId: invitation.user.public_id,
        metadata: {
          sendCount: updateData.count,
          expiresAt: resent.expires_at,
        },
      }),
    )
    const setUrl = new URL(`/set-password/${rawToken}`, env.frontendUrl).href
    const admin = await AuthRepo.findUser({ id: auth.sub })

    try {
      await EmailProvider.send(
        buildInviteEmail({
          fullName: invitation.user.full_name,
          inviterName: admin?.full_name ?? 'A team member',
          inviteUrl: setUrl,
          role: invitation.user.role,
          to: invitation.user.email,
          expiresInMinutes: INVITATION_TTL_MINUTES,
        }),
      )
    } catch (error) {
      logger.error(
        {
          err: error,
          userId: auth.sub,
          invitationExpiresAt: updated.expires_at,
        },
        'Failed to send resend invitation email',
      )
    }

    return {
      publicId: invitation.user.public_id,
      status: invitation.user.status,
      expiresAt: updated.expires_at,
      sentAt: updated.last_sent_at,
      sendCount: updateData.count,
    }
  }

  // ── DELETE /team/invitations/:invitationId ─────────────────────────────────
  static CancelInvitation = async (
    _auth: AccessTokenClaims,
    invitationId: string,
  ) => {
    const invitation = await TeamRepo.findInvitationById(invitationId)

    if (!invitation) {
      throw createError('Invitation not found', 404, {}, 'NOT_FOUND')
    }

    if (invitation.accepted_at) {
      throw createError(
        'Cannot cancel an invitation that has already been accepted',
        409,
        {},
        'INVITATION_ALREADY_ACCEPTED',
      )
    }

    if (invitation.canceled_at) {
      throw createError(
        'Invitation is already canceled',
        409,
        {},
        'INVITATION_ALREADY_CANCELED',
      )
    }

    // Canceling hard-deletes the invited user, so the snapshot is taken from the
    // row loaded above — the audit record is the only trace left of the invitee.
    const invitee = snapshotMember(invitation.user)
    await AuditService.withAudit(
      (tx) =>
        TeamRepo.CancelInvitation(invitation.id, invitation.user_id, tx),
      () => ({
        action: AUDIT_ACTIONS.INVITATION_CANCELED,
        entityType: 'invitation',
        entityId: invitee.publicId,
        before: invitee,
      }),
    )
  }

  // ── GET /team ──────────────────────────────────────────────────────────────
  static ListMembers = async () => {
    const users = await TeamRepo.findAllUsers()
    return users.map((u) => ({
      publicId: u.public_id,
      fullName: u.full_name,
      email: u.email,
      role: u.role,
      status: u.status,
      phone: u.phone ?? null,
      createdAt: u.created_at,
    }))
  }

  // ── GET /team/:userId ──────────────────────────────────────────────────────
  static GetMember = async (userId: string) => {
    const user = await TeamRepo.findUserByPublicId(userId)

    if (!user) {
      throw createError('Team member not found', 404, {}, 'NOT_FOUND')
    }

    return {
      publicId: user.public_id,
      fullName: user.full_name,
      email: user.email,
      role: user.role,
      status: user.status,
      phone: user.phone ?? null,
      createdAt: user.created_at,
    }
  }

  // ── PATCH /team/:userId ────────────────────────────────────────────────────
  static UpdateMember = async (userId: string, data: UpdateTeamMemberData) => {
    const user = await TeamRepo.findUserByPublicId(userId)

    if (!user) {
      throw createError('Team member not found', 404, {}, 'NOT_FOUND')
    }

    if (user.status === 'ACTIVE' && data.email !== undefined) {
      throw createError(`Can't edit an active user's email`, 400, {}, 'VALIDATION_ERROR')
    }

    const updated = await AuditService.withAudit(
      (tx) => TeamRepo.updateUser(user.id, data, tx),
      (after) => ({
        action: AUDIT_ACTIONS.MEMBER_UPDATED,
        entityType: 'user',
        entityId: user.public_id,
        before: snapshotMember(user),
        after: snapshotMember(after),
      }),
    )

    return {
      publicId: updated.public_id,
      fullName: updated.full_name,
      email: updated.email,
      role: updated.role,
      status: updated.status,
      phone: updated.phone ?? null,
    }
  }

  // ── PATCH /team/:userId/status ─────────────────────────────────────────────
  static UpdateMemberStatus = async (
    userId: string,
    data: UpdateTeamMemberStatusData,
  ) => {
    const user = await TeamRepo.findUserByPublicId(userId)

    if (!user) {
      throw createError('Team member not found', 404, {}, 'NOT_FOUND')
    }

    if (user.status === data.status) {
      throw createError(
        `User status is already ${data.status.toLowerCase()}`,
        409,
        {},
        'CONFLICT',
      )
    }

    const updated = await AuditService.withAudit(
      (tx) => TeamRepo.updateUserStatus(user.id, data.status, tx),
      (after) => ({
        action: AUDIT_ACTIONS.MEMBER_STATUS_CHANGED,
        entityType: 'user',
        entityId: user.public_id,
        before: { status: user.status },
        after: { status: after.status },
      }),
    )

    return {
      publicId: updated.public_id,
      status: updated.status,
    }
  }
}
