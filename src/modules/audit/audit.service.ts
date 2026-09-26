import { getRequestContext } from '../../common/context/requestContext.js'
import {
  runInTransaction,
  type Db,
  type Tx,
} from '../../database/transaction.js'
import { Prisma, type UserRole } from '../../generated/prisma/index.js'
import type { AuditAction, AuditEntityType } from './audit.actions.js'
import { AuditRepo } from './audit.repository.js'
import { sanitizeForAudit } from './audit.sanitize.js'
import type { ListAuditLogsQueryDTO } from './audit.types.js'
import { createError } from '../../common/errors/AppError.js'
import TeamRepo from '../team/team.repository.js'

export type AuditEntry = {
  action: AuditAction
  entityType: AuditEntityType
  entityId: string | null
  before?: unknown
  after?: unknown
  metadata?: Record<string, unknown>
  // Override the context actor, e.g. the invitee accepting on a public route.
  actorId?: string | null
  actorRole?: UserRole | null
}

const toJsonColumn = (value: unknown) =>
  sanitizeForAudit(value) ?? Prisma.DbNull

export class AuditService {
  static record = async (db: Db, entry: AuditEntry) => {
    const ctx = getRequestContext()
    await AuditRepo.record(db, {
      actor_id:
        entry.actorId !== undefined ? entry.actorId : (ctx?.actorId ?? null),
      actor_role:
        entry.actorRole !== undefined
          ? entry.actorRole
          : (ctx?.actorRole ?? null),
      action: entry.action,
      entity_type: entry.entityType,
      entity_id: entry.entityId,
      ...(entry.before !== undefined && {
        before_data: toJsonColumn(entry.before),
      }),
      ...(entry.after !== undefined && {
        after_data: toJsonColumn(entry.after),
      }),
      ...(entry.metadata !== undefined && {
        metadata: toJsonColumn(entry.metadata),
      }),
      request_id: ctx?.requestId ?? null,
      ip_address: ctx?.ipAddress ?? null,
      user_agent: ctx?.userAgent ?? null,
    })
  }

  // ── GET /audit-logs ─────────────────────────────────────────────────────
  static List = async (query: ListAuditLogsQueryDTO) => {
    let actorUserId: string | undefined
    if (query.actorId !== undefined) {
      const actor = await TeamRepo.findUserByPublicId(query.actorId)
      if (!actor) {
        throw createError('Actor not found', 404, {}, 'NOT_FOUND')
      }
      actorUserId = actor.id
    }

    const { logs, total } = await AuditRepo.list({
      action: query.action,
      entityType: query.entityType,
      entityId: query.entityId,
      actorUserId,
      from: query.from,
      to: query.to,
      page: query.page,
      limit: query.limit,
    })

    return {
      logs: logs.map((log) => ({
        id: log.id,
        action: log.action,
        entity: { type: log.entity_type, id: log.entity_id },
        // Public fields only — the actor's internal UUID is never returned.
        actor: log.actor
          ? {
              publicId: log.actor.public_id,
              fullName: log.actor.full_name,
              role: log.actor_role,
            }
          : null,
        before: log.before_data,
        after: log.after_data,
        metadata: log.metadata,
        requestId: log.request_id,
        ipAddress: log.ip_address,
        userAgent: log.user_agent,
        createdAt: log.created_at,
      })),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    }
  }

  // Business change + audit row in one transaction: if the audit insert fails,
  // the change rolls back too.
  static withAudit = <T>(
    fn: (tx: Tx) => Promise<T>,
    buildEntry: (result: T) => AuditEntry,
  ): Promise<T> =>
    runInTransaction(async (tx) => {
      const result = await fn(tx)
      await AuditService.record(tx, buildEntry(result))
      return result
    })
}
