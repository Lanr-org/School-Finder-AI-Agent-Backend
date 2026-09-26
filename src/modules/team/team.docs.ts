import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi'
import { z } from 'zod'
import { TeamSchemas } from './team.schemas'
import {
  emptySuccessResponseSchema,
  errorContent,
  successEnvelope,
} from '../../docs/registry'

const roleEnum = z.enum(['ADMIN', 'ADVISOR', 'OPERATIONS'])
const statusEnum = z.enum(['INVITED', 'ACTIVE', 'DISABLED'])

const ADMIN_ONLY = 'Requires a bearer access token. Allowed roles: ADMIN only.'

export const registerTeamDocs = (registry: OpenAPIRegistry) => {
  const invitationDataSchema = z.object({
    publicId: z.string(),
    fullName: z.string(),
    email: z.string().email(),
    role: roleEnum,
    status: statusEnum,
    expiresAt: z.date(),
    sentAt: z.date(),
  })

  const resendDataSchema = z.object({
    publicId: z.string(),
    status: statusEnum,
    expiresAt: z.date(),
    sentAt: z.date(),
    sendCount: z.number(),
  })

  const memberDataSchema = z.object({
    publicId: z.string(),
    fullName: z.string(),
    email: z.string().email(),
    role: roleEnum,
    status: statusEnum,
    phone: z.string().nullable(),
    createdAt: z.date(),
  })

  const invitationResponseSchema = registry.register(
    'InvitationResponse',
    successEnvelope(invitationDataSchema),
  )
  const resendInvitationResponseSchema = registry.register(
    'ResendInvitationResponse',
    successEnvelope(resendDataSchema),
  )
  const memberResponseSchema = registry.register(
    'TeamMemberResponse',
    successEnvelope(memberDataSchema),
  )
  const memberListResponseSchema = registry.register(
    'TeamMemberListResponse',
    successEnvelope(z.array(memberDataSchema)),
  )
  const updatedMemberResponseSchema = registry.register(
    'UpdatedTeamMemberResponse',
    successEnvelope(memberDataSchema.omit({ createdAt: true })),
  )
  const memberStatusResponseSchema = registry.register(
    'TeamMemberStatusResponse',
    successEnvelope(z.object({ publicId: z.string(), status: statusEnum })),
  )

  const registeredInvitationSchema = registry.register(
    'SendInvitationRequest',
    TeamSchemas.invitationSchema,
  )
  const registeredUpdateMemberSchema = registry.register(
    'UpdateTeamMemberRequest',
    TeamSchemas.updateMemberSchema,
  )
  const registeredUpdateStatusSchema = registry.register(
    'UpdateTeamMemberStatusRequest',
    TeamSchemas.updateStatusSchema,
  )

  // team.routes.ts has no runtime param schemas, so these are docs-only.
  const userIdParams = registry.register(
    'TeamUserIdParams',
    z.object({
      userId: z.string().openapi({
        example: 'USR-946B7F71768D',
        description: "The team member's public ID.",
      }),
    }),
  )
  const invitationIdParams = registry.register(
    'InvitationIdParams',
    z.object({
      invitationId: z
        .string()
        .uuid()
        .openapi({ description: 'Internal invitation ID.' }),
    }),
  )

  const unauthorized = errorContent('Bearer token is missing or invalid.')
  const forbidden = errorContent('Only ADMIN may manage the team.')

  registry.registerPath({
    method: 'post',
    path: '/api/v1/team/invitations',
    tags: ['Team'],
    security: [{ bearerAuth: [] }],
    summary: 'Invite a team member',
    description: `${ADMIN_ONLY} Creates the user as INVITED and emails a one-time set-password link that expires in 60 minutes. The link token is never returned. Audited as team.invitation_created.`,
    request: {
      body: {
        required: true,
        content: { 'application/json': { schema: registeredInvitationSchema } },
      },
    },
    responses: {
      201: {
        description: 'Invitation created and email sent.',
        content: { 'application/json': { schema: invitationResponseSchema } },
      },
      400: errorContent('Request validation failed.'),
      401: unauthorized,
      403: forbidden,
      409: errorContent('A user with this email address already exists.'),
    },
  })

  registry.registerPath({
    method: 'post',
    path: '/api/v1/team/invitations/{invitationId}/resend',
    tags: ['Team'],
    security: [{ bearerAuth: [] }],
    summary: 'Resend an invitation',
    description: `${ADMIN_ONLY} Issues a fresh link (the previous one stops working), resets the 60-minute expiry, and increments the send count. Audited as team.invitation_resent.`,
    request: { params: invitationIdParams },
    responses: {
      200: {
        description: 'Invitation resent.',
        content: {
          'application/json': { schema: resendInvitationResponseSchema },
        },
      },
      401: unauthorized,
      403: forbidden,
      404: errorContent('Invitation not found.'),
      409: errorContent('The invitation was already accepted or canceled.'),
    },
  })

  registry.registerPath({
    method: 'delete',
    path: '/api/v1/team/invitations/{invitationId}',
    tags: ['Team'],
    security: [{ bearerAuth: [] }],
    summary: 'Cancel an invitation',
    description: `${ADMIN_ONLY} Cancels a pending invitation and deletes the invited (never-activated) account. Audited as team.invitation_canceled, with a snapshot of the invitee.`,
    request: { params: invitationIdParams },
    responses: {
      200: {
        description: 'Invitation canceled.',
        content: {
          'application/json': { schema: emptySuccessResponseSchema },
        },
      },
      401: unauthorized,
      403: forbidden,
      404: errorContent('Invitation not found.'),
      409: errorContent('The invitation was already accepted or canceled.'),
    },
  })

  registry.registerPath({
    method: 'get',
    path: '/api/v1/team',
    tags: ['Team'],
    security: [{ bearerAuth: [] }],
    summary: 'List team members',
    description: `${ADMIN_ONLY} Returns every staff account (including INVITED and DISABLED), newest first.`,
    responses: {
      200: {
        description: 'Team members retrieved.',
        content: { 'application/json': { schema: memberListResponseSchema } },
      },
      401: unauthorized,
      403: forbidden,
    },
  })

  registry.registerPath({
    method: 'get',
    path: '/api/v1/team/{userId}',
    tags: ['Team'],
    security: [{ bearerAuth: [] }],
    summary: 'Get a team member',
    description: `${ADMIN_ONLY} Looks up a staff account by public ID. Internal IDs, password hashes, and token metadata are never returned.`,
    request: { params: userIdParams },
    responses: {
      200: {
        description: 'Team member retrieved.',
        content: { 'application/json': { schema: memberResponseSchema } },
      },
      401: unauthorized,
      403: forbidden,
      404: errorContent('Team member not found.'),
    },
  })

  registry.registerPath({
    method: 'patch',
    path: '/api/v1/team/{userId}',
    tags: ['Team'],
    security: [{ bearerAuth: [] }],
    summary: 'Update a team member',
    description: `${ADMIN_ONLY} Updates name, phone, or (for accounts that are not yet ACTIVE) email; at least one field is required. Role changes are not supported here. Audited as team.member_updated.`,
    request: {
      params: userIdParams,
      body: {
        required: true,
        content: {
          'application/json': { schema: registeredUpdateMemberSchema },
        },
      },
    },
    responses: {
      200: {
        description: 'Team member updated.',
        content: {
          'application/json': { schema: updatedMemberResponseSchema },
        },
      },
      400: errorContent(
        "Validation failed, or an attempt to change an ACTIVE user's email.",
      ),
      401: unauthorized,
      403: forbidden,
      404: errorContent('Team member not found.'),
    },
  })

  registry.registerPath({
    method: 'patch',
    path: '/api/v1/team/{userId}/status',
    tags: ['Team'],
    security: [{ bearerAuth: [] }],
    summary: 'Activate or disable a team member',
    description: `${ADMIN_ONLY} Sets status to ACTIVE or DISABLED. A disabled account is rejected on its next authenticated request. Audited as team.member_status_changed.`,
    request: {
      params: userIdParams,
      body: {
        required: true,
        content: {
          'application/json': { schema: registeredUpdateStatusSchema },
        },
      },
    },
    responses: {
      200: {
        description: 'Status updated.',
        content: {
          'application/json': { schema: memberStatusResponseSchema },
        },
      },
      400: errorContent('Status must be ACTIVE or DISABLED.'),
      401: unauthorized,
      403: forbidden,
      404: errorContent('Team member not found.'),
      409: errorContent('The member already has this status.'),
    },
  })
}
