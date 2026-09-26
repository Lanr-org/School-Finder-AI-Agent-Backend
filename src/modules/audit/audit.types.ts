import type { AuditAction, AuditEntityType } from './audit.actions.js'

export interface ListAuditLogsQueryDTO {
  action?: AuditAction | undefined
  entityType?: AuditEntityType | undefined
  entityId?: string | undefined
  actorId?: string | undefined
  from?: Date | undefined
  to?: Date | undefined
  page: number
  limit: number
}

export interface ListAuditLogsFilters {
  action?: AuditAction | undefined
  entityType?: AuditEntityType | undefined
  entityId?: string | undefined
  actorUserId?: string | undefined
  from?: Date | undefined
  to?: Date | undefined
  page: number
  limit: number
}
