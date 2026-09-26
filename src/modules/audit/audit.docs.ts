import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi'
import { z } from 'zod'
import { AuditSchemas } from './audit.schemas'
import { AUDIT_ACTION_VALUES, AUDIT_ENTITY_TYPES } from './audit.actions'
import {
  errorContent,
  paginationSchema,
  successEnvelope,
} from '../../docs/registry'

export const registerAuditDocs = (registry: OpenAPIRegistry) => {
  const auditLogListResponseSchema = registry.register(
    'AuditLogListResponse',
    successEnvelope(
      z.object({
        logs: z.array(
          z.object({
            id: z.string(),
            action: z.enum(AUDIT_ACTION_VALUES),
            entity: z.object({
              type: z.enum(AUDIT_ENTITY_TYPES),
              id: z.string().nullable(),
            }),
            actor: z
              .object({
                publicId: z.string(),
                fullName: z.string(),
                role: z.enum(['ADMIN', 'ADVISOR', 'OPERATIONS']).nullable(),
              })
              .nullable(),
            before: z.unknown().nullable(),
            after: z.unknown().nullable(),
            metadata: z.unknown().nullable(),
            requestId: z.string().nullable(),
            ipAddress: z.string().nullable(),
            userAgent: z.string().nullable(),
            createdAt: z.date(),
          }),
        ),
        pagination: paginationSchema,
      }),
    ),
  )

  const registeredListAuditLogsQuerySchema = registry.register(
    'ListAuditLogsQuery',
    AuditSchemas.listAuditLogsQuerySchema,
  )

  registry.registerPath({
    method: 'get',
    path: '/api/v1/audit-logs',
    tags: ['Audit'],
    security: [{ bearerAuth: [] }],
    summary: 'List audit log entries',
    description:
      'Requires a bearer access token. Allowed roles: ADMIN only. Append-only record of who changed business data: login failures, session revocations, invitations, team member changes, advisor assignment, student/application status changes, school/program changes, settings, and recommendation weights. Newest first. before/after are sanitized snapshots (never passwords, tokens, or hashes). actor is null for system or unauthenticated actions (e.g. failed logins). actorId filters by the public USR- id.',
    request: { query: registeredListAuditLogsQuerySchema },
    responses: {
      200: {
        description: 'Audit log entries retrieved successfully.',
        content: { 'application/json': { schema: auditLogListResponseSchema } },
      },
      400: errorContent(
        'Query parameter validation failed (e.g. unknown action, or `from` after `to`).',
      ),
      401: errorContent('Bearer token is missing or invalid.'),
      403: errorContent('Only ADMIN may read audit logs.'),
      404: errorContent(
        'The user referenced by the actorId filter was not found.',
      ),
    },
  })
}
