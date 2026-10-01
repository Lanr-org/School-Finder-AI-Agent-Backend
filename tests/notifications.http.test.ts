import './setup-env'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import app from '../src/app'
import { generateAcessToken } from '../src/common/security/token'
import AuthRepo from '../src/modules/auth/auth.repository'
import { NotificationsRepo } from '../src/modules/notifications/notifications.repository'
import { NotificationsService } from '../src/modules/notifications/notifications.service'
import { CentrifugoClient } from '../src/integrations/centrifugo/services/centrifugo.client'

vi.mock('../src/modules/auth/auth.repository', () => ({
  default: { findUser: vi.fn(), findAuthSessionById: vi.fn() },
}))
vi.mock('../src/modules/notifications/notifications.repository', () => ({
  NotificationsRepo: {
    createMany: vi.fn(),
    list: vi.fn(),
    findOwned: vi.fn(),
    markRead: vi.fn(),
    markAllRead: vi.fn(),
    deleteAll: vi.fn(),
  },
}))
vi.mock('../src/integrations/centrifugo/services/centrifugo.client', () => ({
  CentrifugoClient: { publish: vi.fn() },
}))

const repo = vi.mocked(NotificationsRepo)
const authRepo = vi.mocked(AuthRepo)

const USER_ID = 'user-uuid'
const NOTIFICATION_ID = '3f0c6c5e-7a43-4d6e-9a53-0d2f6a1c9b11'
const token = () => generateAcessToken(USER_ID, 'session-uuid', 'ADVISOR', 0)
const auth = (req: request.Test) => req.set('Authorization', `Bearer ${token()}`)

const makeNotification = (overrides: Record<string, unknown> = {}) => ({
  id: NOTIFICATION_ID,
  user_id: USER_ID,
  type: 'CONVERSATION',
  title: 'Student requested an advisor',
  body: 'Ada Obi (STU-3766) asked to talk to an advisor.',
  link: '/conversations/CNV-1048',
  read_at: null,
  created_at: new Date('2026-10-01T10:00:00Z'),
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  authRepo.findAuthSessionById.mockResolvedValue({
    id: 'session-uuid',
    user_id: USER_ID,
    revoked_at: null,
    expires_at: new Date(Date.now() + 60_000),
  } as never)
  authRepo.findUser.mockResolvedValue({
    id: USER_ID,
    role: 'ADVISOR',
    status: 'ACTIVE',
    token_version: 0,
  } as never)
})

describe('GET /api/v1/notifications', () => {
  it('lists the caller’s notifications with the unread count and pagination', async () => {
    repo.list.mockResolvedValue({
      notifications: [makeNotification(), makeNotification({ id: 'other', read_at: new Date() })],
      total: 2,
      unreadCount: 1,
    } as never)

    const res = await auth(request(app).get('/api/v1/notifications'))

    expect(res.status).toBe(200)
    expect(repo.list).toHaveBeenCalledWith(USER_ID, expect.objectContaining({ page: 1, limit: 20 }))
    expect(res.body.data.unreadCount).toBe(1)
    expect(res.body.data.pagination).toEqual({ page: 1, limit: 20, total: 2, totalPages: 1 })
    expect(res.body.data.notifications[0]).toMatchObject({
      type: 'CONVERSATION',
      link: '/conversations/CNV-1048',
      readAt: null,
    })
    expect(res.body.data.notifications[1].readAt).not.toBeNull()
  })

  it('passes unreadOnly through as a boolean', async () => {
    repo.list.mockResolvedValue({ notifications: [], total: 0, unreadCount: 0 } as never)

    await auth(request(app).get('/api/v1/notifications?unreadOnly=true'))

    expect(repo.list).toHaveBeenCalledWith(USER_ID, expect.objectContaining({ unreadOnly: true }))
  })

  it('rejects a bad limit', async () => {
    const res = await auth(request(app).get('/api/v1/notifications?limit=500'))
    expect(res.status).toBe(400)
    expect(repo.list).not.toHaveBeenCalled()
  })
})

describe('PATCH /api/v1/notifications/:notificationId/read', () => {
  it('marks one of the caller’s notifications read', async () => {
    repo.findOwned.mockResolvedValue(makeNotification() as never)

    const res = await auth(request(app).patch(`/api/v1/notifications/${NOTIFICATION_ID}/read`))

    expect(res.status).toBe(200)
    expect(repo.findOwned).toHaveBeenCalledWith(USER_ID, NOTIFICATION_ID)
    expect(repo.markRead).toHaveBeenCalledWith(USER_ID, NOTIFICATION_ID)
  })

  it('returns 404 for someone else’s or a missing notification', async () => {
    repo.findOwned.mockResolvedValue(null)

    const res = await auth(request(app).patch(`/api/v1/notifications/${NOTIFICATION_ID}/read`))

    expect(res.status).toBe(404)
    expect(repo.markRead).not.toHaveBeenCalled()
  })

  it('rejects a malformed id', async () => {
    const res = await auth(request(app).patch('/api/v1/notifications/not-a-uuid/read'))
    expect(res.status).toBe(400)
  })
})

describe('POST /api/v1/notifications/read-all and DELETE /api/v1/notifications', () => {
  it('marks every notification of the caller read', async () => {
    repo.markAllRead.mockResolvedValue({ count: 3 } as never)

    const res = await auth(request(app).post('/api/v1/notifications/read-all'))

    expect(res.status).toBe(200)
    expect(repo.markAllRead).toHaveBeenCalledWith(USER_ID)
    expect(res.body.data).toEqual({ updated: 3 })
  })

  it('clears only the caller’s notifications', async () => {
    repo.deleteAll.mockResolvedValue({ count: 4 } as never)

    const res = await auth(request(app).delete('/api/v1/notifications'))

    expect(res.status).toBe(200)
    expect(repo.deleteAll).toHaveBeenCalledWith(USER_ID)
    expect(res.body.data).toEqual({ deleted: 4 })
  })
})

describe('authentication', () => {
  it.each([
    ['get', '/api/v1/notifications'],
    ['patch', `/api/v1/notifications/${NOTIFICATION_ID}/read`],
    ['post', '/api/v1/notifications/read-all'],
    ['delete', '/api/v1/notifications'],
  ])('%s %s needs a token', async (method, path) => {
    const res = await (request(app) as unknown as Record<string, (p: string) => request.Test>)[method]!(path)
    expect(res.status).toBe(401)
  })
})

describe('NotificationsService.notify', () => {
  it('creates one notification per distinct recipient and pushes it live', async () => {
    repo.createMany.mockResolvedValue({ count: 2 } as never)

    await NotificationsService.notify(['a', 'b', 'a'], { type: 'ASSIGNMENT', title: 't', body: 'b', link: '/x' })

    expect(repo.createMany).toHaveBeenCalledWith(['a', 'b'], {
      type: 'ASSIGNMENT',
      title: 't',
      body: 'b',
      link: '/x',
    })
    expect(CentrifugoClient.publish).toHaveBeenCalledWith(
      'advisors#a',
      expect.objectContaining({ event: 'advisor.notification' }),
    )
    expect(CentrifugoClient.publish).toHaveBeenCalledTimes(2)
  })

  it('does nothing without recipients', async () => {
    await NotificationsService.notify([], { type: 'SYSTEM', title: 't', body: 'b' })
    expect(repo.createMany).not.toHaveBeenCalled()
  })

  it('never throws when saving fails, and skips the live push', async () => {
    repo.createMany.mockRejectedValue(new Error('db down'))

    await expect(
      NotificationsService.notify(['a'], { type: 'SYSTEM', title: 't', body: 'b' }),
    ).resolves.toBeUndefined()
    expect(CentrifugoClient.publish).not.toHaveBeenCalled()
  })
})
