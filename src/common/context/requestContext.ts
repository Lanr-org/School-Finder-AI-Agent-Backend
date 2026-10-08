import { AsyncLocalStorage } from 'node:async_hooks'
import type { NextFunction, Request, Response } from 'express'
import type { UserRole } from '../../generated/prisma/index.js'

export type RequestContext = {
  requestId: string | null
  ipAddress: string | null
  userAgent: string | null
  actorId: string | null
  actorRole: UserRole | null
}

const storage = new AsyncLocalStorage<RequestContext>()

// undefined outside an HTTP request (BullMQ workers, scripts) — audit rows then
// record no actor and no request fields.
export const getRequestContext = (): RequestContext | undefined =>
  storage.getStore()

// Mount after the body/cookie parsers: stream-based parsing is a known point
// where AsyncLocalStorage context gets lost.
export const requestContext = (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  storage.run(
    {
      // pino-http types req.id as string | number; the requestId middleware always sets a string.
      requestId: req.id !== undefined ? String(req.id) : null,
      ipAddress: req.ip ?? null,
      userAgent: req.get('user-agent')?.slice(0, 255) ?? null,
      actorId: null,
      actorRole: null,
    },
    next,
  )
}

// Called by AuthenticateMiddleware once the token and session are verified.
export const setRequestActor = (actorId: string, actorRole: UserRole) => {
  const store = storage.getStore()
  if (store) {
    store.actorId = actorId
    store.actorRole = actorRole
  }
}
