import prisma from '../../database/prisma.js'
import type { Prisma } from '../../generated/prisma/index.js'
import type { Db } from '../../database/transaction.js'
import type { ListAuditLogsFilters } from './audit.types.js'

// Insert and read only, by design: there are deliberately no update or delete methods.
export class AuditRepo {
  static record = async (db: Db, data: Prisma.AuditLogUncheckedCreateInput) => {
    await db.auditLog.create({ data })
  }

  static list = async (filters: ListAuditLogsFilters) => {
    const where: Prisma.AuditLogWhereInput = {
      ...(filters.action !== undefined && { action: filters.action }),
      ...(filters.entityType !== undefined && {
        entity_type: filters.entityType,
      }),
      ...(filters.entityId !== undefined && { entity_id: filters.entityId }),
      ...(filters.actorUserId !== undefined && {
        actor_id: filters.actorUserId,
      }),
      ...((filters.from !== undefined || filters.to !== undefined) && {
        created_at: {
          ...(filters.from !== undefined && { gte: filters.from }),
          ...(filters.to !== undefined && { lte: filters.to }),
        },
      }),
    }

    const [logs, total] = await prisma.$transaction([
      prisma.auditLog.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
        include: { actor: { select: { public_id: true, full_name: true } } },
      }),
      prisma.auditLog.count({ where }),
    ])

    return { logs, total }
  }
}
