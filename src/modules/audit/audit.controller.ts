import type { NextFunction, Request, Response } from 'express'
import { successResponse } from '../../http/response.js'
import { AuditService } from './audit.service.js'
import type { ListAuditLogsQueryDTO } from './audit.types.js'

export class AuditController {
  // ── GET /audit-logs ─────────────────────────────────────────────────────
  static List = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await AuditService.List(
        req.query as unknown as ListAuditLogsQueryDTO,
      )
      res.status(200).json(
        successResponse(true, 'Audit logs retrieved successfully', result, {
          requestId: req.id,
        }),
      )
    } catch (error) {
      next(error)
    }
  }
}
