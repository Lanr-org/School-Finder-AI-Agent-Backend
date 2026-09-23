import './setup-env'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import app from '../src/app'
import { generateAcessToken } from '../src/common/security/token'
import AuthRepo from '../src/modules/auth/auth.repository'
import { ConversationsRepo } from '../src/modules/conversations/conversations.repository'
import TeamRepo from '../src/modules/team/team.repository'
import { TelegramOutboundService } from '../src/integrations/telegram/services/telegram-outbound.service'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../src/modules/auth/auth.repository', () => ({
  default: {
    findUser: vi.fn(),
    findAuthSessionById: vi.fn(),
  },
}))

vi.mock('../src/modules/conversations/conversations.repository', () => ({
  ConversationsRepo: {
    findConversationByPublicId: vi.fn(),
    listConversations: vi.fn(),
    escalateConversation: vi.fn(),
    resolveConversation: vi.fn(),
    handbackConversation: vi.fn(),
    findRecentMessages: vi.fn(),
    createMessage: vi.fn(),
    touchLastActivity: vi.fn(),
  },
}))

vi.mock('../src/modules/team/team.repository', () => ({
  default: {
    findUserByPublicId: vi.fn(),
    findUsersByIds: vi.fn(),
  },
}))

vi.mock('../src/integrations/telegram/services/telegram-outbound.service', () => ({
  TelegramOutboundService: {
    sendMessage: vi.fn(),
  },
}))

// ── Typed response helpers ────────────────────────────────────────────────────

type ApiBody<T = unknown> = {
  success: boolean
  message: string
  data: T
  error?: { code: string; message: string }
}

function body<T = unknown>(res: { body: unknown }): ApiBody<T> {
  return res.body as ApiBody<T>
}

const authRepoMock = vi.mocked(AuthRepo)
const conversationsRepoMock = vi.mocked(ConversationsRepo)
const teamRepoMock = vi.mocked(TeamRepo)
const telegramOutboundMock = vi.mocked(TelegramOutboundService)

// ── Constants ─────────────────────────────────────────────────────────────────

const ADMIN_ID = 'admin-user-uuid-0001'
const ADVISOR_ID = 'advisor-user-uuid-0001'
const OTHER_ADVISOR_ID = 'advisor-user-uuid-0002'
const SESSION_ID = 'session-uuid-0001'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const makeUser = (overrides: Record<string, unknown> = {}) => ({
  id: ADMIN_ID,
  public_id: 'USR-0001',
  full_name: 'Alice Admin',
  email: 'alice@example.com',
  phone: null as string | null,
  password_hash: '$argon2id$hash' as string | null,
  role: 'ADMIN' as const,
  status: 'ACTIVE' as const,
  token_version: 0,
  last_login_at: null as Date | null,
  password_changed_at: null as Date | null,
  created_at: new Date('2024-01-01'),
  updated_at: new Date('2024-01-01'),
  ...overrides,
})

const makeSession = (overrides: Record<string, unknown> = {}) => ({
  id: SESSION_ID,
  user_id: ADMIN_ID,
  refresh_token_hash: 'hash',
  token_family: 'family-uuid',
  user_agent: null as string | null,
  ip_address: null as string | null,
  expires_at: new Date(Date.now() + 3_600_000),
  revoked_at: null as Date | null,
  last_used_at: null as Date | null,
  created_at: new Date(),
  ...overrides,
})

const makeConversation = (overrides: Record<string, unknown> = {}) => ({
  id: 'conversation-uuid-1',
  public_id: 'CON-3854',
  mode: 'AI_BOT' as const,
  status: 'ACTIVE' as const,
  last_activity_at: new Date('2024-01-01'),
  created_at: new Date('2024-01-01'),
  student: {
    id: 'student-uuid-1',
    public_id: 'STU-8440',
    assigned_advisor_id: ADVISOR_ID as string | null,
    contact: {
      id: 'contact-uuid-1',
      provider_type: 'TELEGRAM' as const,
      provider_user_id: '2011329752',
      first_name: 'Chinedu',
      last_name: 'Nwosu',
      email: null as string | null,
      phone: null as string | null,
    },
  },
  ...overrides,
})

const token = (role: 'ADMIN' | 'ADVISOR' | 'OPERATIONS', id = ADMIN_ID) =>
  generateAcessToken(id, SESSION_ID, role, 0)

const asAdmin = () => {
  authRepoMock.findUser.mockResolvedValue(makeUser({ id: ADMIN_ID, role: 'ADMIN' }) as any)
  authRepoMock.findAuthSessionById.mockResolvedValue(makeSession({ user_id: ADMIN_ID }) as any)
  return token('ADMIN', ADMIN_ID)
}

const asAdvisor = (id = ADVISOR_ID) => {
  authRepoMock.findUser.mockResolvedValue(makeUser({ id, role: 'ADVISOR' }) as any)
  authRepoMock.findAuthSessionById.mockResolvedValue(makeSession({ user_id: id }) as any)
  return token('ADVISOR', id)
}

// ── HTTP Test Suites ──────────────────────────────────────────────────────────

describe('Conversations API — GET /api/v1/conversations/:conversationId', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    teamRepoMock.findUsersByIds.mockResolvedValue([])
    conversationsRepoMock.findRecentMessages.mockResolvedValue([])
  })

  it('returns the conversation for ADMIN', async () => {
    const authToken = asAdmin()
    conversationsRepoMock.findConversationByPublicId.mockResolvedValue(makeConversation() as any)

    const res = await request(app).get('/api/v1/conversations/CON-3854').set('Authorization', `Bearer ${authToken}`)

    expect(res.status).toBe(200)
    expect(body<{ publicId: string }>(res).data.publicId).toBe('CON-3854')
  })

  it('returns 403 for an ADVISOR the conversation is not assigned to', async () => {
    const authToken = asAdvisor(OTHER_ADVISOR_ID)
    conversationsRepoMock.findConversationByPublicId.mockResolvedValue(
      makeConversation({ student: { ...makeConversation().student, assigned_advisor_id: ADVISOR_ID } }) as any,
    )

    const res = await request(app).get('/api/v1/conversations/CON-3854').set('Authorization', `Bearer ${authToken}`)

    expect(res.status).toBe(403)
    expect(body(res).error?.code).toBe('FORBIDDEN')
  })

  it('returns 404 when the conversation does not exist', async () => {
    const authToken = asAdmin()
    conversationsRepoMock.findConversationByPublicId.mockResolvedValue(null as any)

    const res = await request(app).get('/api/v1/conversations/CON-9999').set('Authorization', `Bearer ${authToken}`)

    expect(res.status).toBe(404)
  })
})

describe('Conversations API — GET /api/v1/conversations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    teamRepoMock.findUsersByIds.mockResolvedValue([])
    conversationsRepoMock.listConversations.mockResolvedValue({ conversations: [makeConversation() as any], total: 1 })
  })

  it('forces advisorUserId for ADVISOR and ignores the unassigned filter', async () => {
    const authToken = asAdvisor(ADVISOR_ID)

    const res = await request(app)
      .get('/api/v1/conversations?unassigned=true')
      .set('Authorization', `Bearer ${authToken}`)

    expect(res.status).toBe(200)
    expect(conversationsRepoMock.listConversations).toHaveBeenCalledWith(
      expect.objectContaining({ advisorUserId: ADVISOR_ID, unassigned: undefined }),
    )
  })

  it('honors the unassigned filter for ADMIN', async () => {
    const authToken = asAdmin()

    const res = await request(app)
      .get('/api/v1/conversations?unassigned=true')
      .set('Authorization', `Bearer ${authToken}`)

    expect(res.status).toBe(200)
    expect(conversationsRepoMock.listConversations).toHaveBeenCalledWith(
      expect.objectContaining({ unassigned: true }),
    )
  })
})

describe('Conversations API — POST /api/v1/conversations/:conversationId/replies', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    conversationsRepoMock.createMessage.mockResolvedValue({
      sender_type: 'ADVISOR',
      content: 'Hi, I can help from here.',
      created_at: new Date('2024-01-01'),
    } as any)
    conversationsRepoMock.touchLastActivity.mockResolvedValue({} as any)
  })

  it('persists the reply and sends it through Telegram for the assigned advisor', async () => {
    const authToken = asAdvisor(ADVISOR_ID)
    conversationsRepoMock.findConversationByPublicId.mockResolvedValue(makeConversation() as any)
    telegramOutboundMock.sendMessage.mockResolvedValue(true)

    const res = await request(app)
      .post('/api/v1/conversations/CON-3854/replies')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ content: 'Hi, I can help from here.' })

    expect(res.status).toBe(201)
    expect(conversationsRepoMock.createMessage).toHaveBeenCalledWith(
      'conversation-uuid-1',
      'ADVISOR',
      'Hi, I can help from here.',
    )
    expect(telegramOutboundMock.sendMessage).toHaveBeenCalledWith('2011329752', 'Hi, I can help from here.')
    expect(body<{ delivered: boolean }>(res).data.delivered).toBe(true)
  })

  it('is forbidden for an advisor who does not own the conversation', async () => {
    const authToken = asAdvisor(OTHER_ADVISOR_ID)
    conversationsRepoMock.findConversationByPublicId.mockResolvedValue(makeConversation() as any)

    const res = await request(app)
      .post('/api/v1/conversations/CON-3854/replies')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ content: 'Trying to reply anyway' })

    expect(res.status).toBe(403)
    expect(conversationsRepoMock.createMessage).not.toHaveBeenCalled()
  })

  it('returns 400 for empty reply content', async () => {
    const authToken = asAdvisor(ADVISOR_ID)

    const res = await request(app)
      .post('/api/v1/conversations/CON-3854/replies')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ content: '' })

    expect(res.status).toBe(400)
    expect(body(res).error?.code).toBe('VALIDATION_ERROR')
  })
})

describe('Conversations API — escalate / resolve / handback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    teamRepoMock.findUsersByIds.mockResolvedValue([])
  })

  it('escalate sets mode to HUMAN_ADVISOR and status to ESCALATED', async () => {
    const authToken = asAdvisor(ADVISOR_ID)
    conversationsRepoMock.findConversationByPublicId.mockResolvedValue(makeConversation() as any)
    conversationsRepoMock.escalateConversation.mockResolvedValue(
      makeConversation({ mode: 'HUMAN_ADVISOR', status: 'ESCALATED' }) as any,
    )

    const res = await request(app)
      .post('/api/v1/conversations/CON-3854/escalate')
      .set('Authorization', `Bearer ${authToken}`)

    expect(res.status).toBe(200)
    expect(body<{ mode: string; status: string }>(res).data).toMatchObject({
      mode: 'HUMAN_ADVISOR',
      status: 'ESCALATED',
    })
  })

  it('resolve sets status to RESOLVED without touching mode', async () => {
    const authToken = asAdvisor(ADVISOR_ID)
    conversationsRepoMock.findConversationByPublicId.mockResolvedValue(
      makeConversation({ mode: 'HUMAN_ADVISOR', status: 'ESCALATED' }) as any,
    )
    conversationsRepoMock.resolveConversation.mockResolvedValue(
      makeConversation({ mode: 'HUMAN_ADVISOR', status: 'RESOLVED' }) as any,
    )

    const res = await request(app)
      .post('/api/v1/conversations/CON-3854/resolve')
      .set('Authorization', `Bearer ${authToken}`)

    expect(res.status).toBe(200)
    expect(body<{ mode: string; status: string }>(res).data).toMatchObject({
      mode: 'HUMAN_ADVISOR',
      status: 'RESOLVED',
    })
  })

  it('handback returns the conversation to AI_BOT/ACTIVE when currently escalated', async () => {
    const authToken = asAdvisor(ADVISOR_ID)
    conversationsRepoMock.findConversationByPublicId.mockResolvedValue(
      makeConversation({ mode: 'HUMAN_ADVISOR', status: 'ESCALATED' }) as any,
    )
    conversationsRepoMock.handbackConversation.mockResolvedValue(
      makeConversation({ mode: 'AI_BOT', status: 'ACTIVE' }) as any,
    )

    const res = await request(app)
      .post('/api/v1/conversations/CON-3854/handback')
      .set('Authorization', `Bearer ${authToken}`)

    expect(res.status).toBe(200)
    expect(body<{ mode: string; status: string }>(res).data).toMatchObject({ mode: 'AI_BOT', status: 'ACTIVE' })
  })

  it('handback returns 409 when the conversation is already AI_BOT', async () => {
    const authToken = asAdvisor(ADVISOR_ID)
    conversationsRepoMock.findConversationByPublicId.mockResolvedValue(makeConversation({ mode: 'AI_BOT' }) as any)

    const res = await request(app)
      .post('/api/v1/conversations/CON-3854/handback')
      .set('Authorization', `Bearer ${authToken}`)

    expect(res.status).toBe(409)
    expect(conversationsRepoMock.handbackConversation).not.toHaveBeenCalled()
  })
})
