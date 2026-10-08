import './setup-env'
import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getRequestContext,
  requestContext,
  setRequestActor,
} from '../src/common/context/requestContext'
import { sanitizeForAudit } from '../src/modules/audit/audit.sanitize'
import { AuditService } from '../src/modules/audit/audit.service'
import { AuditRepo } from '../src/modules/audit/audit.repository'
import { AUDIT_ACTIONS } from '../src/modules/audit/audit.actions'

vi.mock('../src/modules/audit/audit.repository', () => ({
  AuditRepo: { record: vi.fn() },
}))

vi.mock('../src/database/transaction', () => ({
  runInTransaction: vi.fn(async (fn: (tx: unknown) => unknown) =>
    fn({ fake: 'tx' }),
  ),
}))

const auditRepoMock = vi.mocked(AuditRepo)

// Runs `fn` inside a real request context, as an HTTP request would.
const inRequest = <T>(
  fn: () => Promise<T>,
  fields: { id?: string; ip?: string; userAgent?: string } = {},
) =>
  new Promise<T>((resolve, reject) => {
    const req = {
      id: fields.id ?? 'req-1',
      ip: fields.ip ?? '10.0.0.1',
      get: () => fields.userAgent ?? 'vitest-agent',
    } as any
    requestContext(req, {} as any, () => {
      fn().then(resolve, reject)
    })
  })

describe('sanitizeForAudit', () => {
  it('redacts sensitive keys at any depth', () => {
    expect(
      sanitizeForAudit({
        email: 'a@b.com',
        password_hash: 'x',
        nested: {
          refreshToken: 'y',
          ok: 1,
          deeper: [{ apiSecret: 'z', name: 'n' }],
        },
      }),
    ).toEqual({
      email: 'a@b.com',
      password_hash: '[REDACTED]',
      nested: {
        refreshToken: '[REDACTED]',
        ok: 1,
        deeper: [{ apiSecret: '[REDACTED]', name: 'n' }],
      },
    })
  })

  it('converts dates, decimals, and bigints to plain JSON values', () => {
    const decimalLike = { toJSON: () => '1250.00' }
    expect(
      sanitizeForAudit({
        at: new Date('2026-09-26T00:00:00.000Z'),
        amount: decimalLike,
        big: BigInt(10),
        missing: undefined,
      }),
    ).toEqual({
      at: '2026-09-26T00:00:00.000Z',
      amount: '1250.00',
      big: '10',
      missing: null,
    })
  })
})

describe('request context', () => {
  it('is undefined outside a request (workers, scripts)', () => {
    expect(getRequestContext()).toBeUndefined()
  })

  it('carries request fields, with no actor until authentication sets one', async () => {
    await inRequest(async () => {
      expect(getRequestContext()).toMatchObject({
        requestId: 'req-1',
        ipAddress: '10.0.0.1',
        userAgent: 'vitest-agent',
        actorId: null,
        actorRole: null,
      })
      setRequestActor('user-uuid-1', 'ADMIN')
      await Promise.resolve()
      expect(getRequestContext()).toMatchObject({
        actorId: 'user-uuid-1',
        actorRole: 'ADMIN',
      })
    })
  })

  it('survives express.json body parsing and async handlers', async () => {
    const app = express()
    app.use((req, _res, next) => {
      req.id = 'req-json'
      next()
    })
    app.use(express.json())
    app.use(requestContext)
    app.post('/probe', async (_req, res) => {
      await new Promise((resolve) => setTimeout(resolve, 5))
      res.json({ requestId: getRequestContext()?.requestId ?? null })
    })

    const res = await request(app).post('/probe').send({ hello: 'world' })

    expect(res.body).toEqual({ requestId: 'req-json' })
  })
})

describe('AuditService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fills actor and request fields from the context and sanitizes snapshots', async () => {
    await inRequest(async () => {
      setRequestActor('admin-uuid', 'ADMIN')
      await AuditService.record({} as any, {
        action: AUDIT_ACTIONS.SCHOOL_UPDATED,
        entityType: 'school',
        entityId: 'SCH-2048',
        before: { name: 'Old' },
        after: { name: 'New', token: 'leak' },
      })
    })

    expect(auditRepoMock.record).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        actor_id: 'admin-uuid',
        actor_role: 'ADMIN',
        action: 'school.updated',
        entity_type: 'school',
        entity_id: 'SCH-2048',
        before_data: { name: 'Old' },
        after_data: { name: 'New', token: '[REDACTED]' },
        request_id: 'req-1',
        ip_address: '10.0.0.1',
        user_agent: 'vitest-agent',
      }),
    )
  })

  it('lets an explicit actor override the context (e.g. invitation acceptance)', async () => {
    await inRequest(async () => {
      await AuditService.record({} as any, {
        action: AUDIT_ACTIONS.INVITATION_ACCEPTED,
        entityType: 'invitation',
        entityId: 'USR-AAAAAAAAAAAA',
        actorId: 'invitee-uuid',
        actorRole: 'ADVISOR',
      })
    })

    expect(auditRepoMock.record).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        actor_id: 'invitee-uuid',
        actor_role: 'ADVISOR',
      }),
    )
  })

  it('records with no actor or request fields outside a request', async () => {
    await AuditService.record({} as any, {
      action: AUDIT_ACTIONS.LOGIN_FAILED,
      entityType: 'user',
      entityId: null,
      metadata: { reason: 'INVALID_CREDENTIALS' },
    })

    expect(auditRepoMock.record).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        actor_id: null,
        request_id: null,
        ip_address: null,
        metadata: { reason: 'INVALID_CREDENTIALS' },
      }),
    )
  })

  it('withAudit writes the audit row in the same transaction as the change', async () => {
    const result = await AuditService.withAudit(
      async (tx) => ({ tx, publicId: 'SCH-2048' }),
      (school) => ({
        action: AUDIT_ACTIONS.SCHOOL_CREATED,
        entityType: 'school',
        entityId: school.publicId,
      }),
    )

    expect(result.publicId).toBe('SCH-2048')
    // Same transaction client handed to both the change and the audit write.
    expect(auditRepoMock.record).toHaveBeenCalledWith(
      { fake: 'tx' },
      expect.objectContaining({
        action: 'school.created',
        entity_id: 'SCH-2048',
      }),
    )
  })

  it('withAudit propagates an audit failure so the transaction rolls back', async () => {
    auditRepoMock.record.mockRejectedValueOnce(new Error('insert failed'))

    await expect(
      AuditService.withAudit(
        async () => ({ publicId: 'SCH-2048' }),
        () => ({
          action: AUDIT_ACTIONS.SCHOOL_CREATED,
          entityType: 'school',
          entityId: 'SCH-2048',
        }),
      ),
    ).rejects.toThrow('insert failed')
  })
})
