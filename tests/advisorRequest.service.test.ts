import './setup-env'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AdvisorRequestService } from '../src/modules/conversations/advisorRequest.service'
import { ConversationsRepo } from '../src/modules/conversations/conversations.repository'
import { ContactsRepo } from '../src/modules/contacts/contacts.repository'
import { NotificationsService } from '../src/modules/notifications/notifications.service'
import TeamRepo from '../src/modules/team/team.repository'
import { CentrifugoClient } from '../src/integrations/centrifugo/services/centrifugo.client'
import { AuditRepo } from '../src/modules/audit/audit.repository'

vi.mock('../src/modules/conversations/conversations.repository', () => ({
  ConversationsRepo: {
    findStudentForNotice: vi.fn(),
    findCurrentConversation: vi.fn(),
    requestAdvisor: vi.fn(),
  },
}))
vi.mock('../src/modules/contacts/contacts.repository', () => ({
  ContactsRepo: { createStudentConversation: vi.fn() },
}))
vi.mock('../src/modules/notifications/notifications.service', () => ({
  NotificationsService: { notify: vi.fn() },
}))
vi.mock('../src/modules/team/team.repository', () => ({
  default: { findActiveAdminIds: vi.fn() },
}))
vi.mock('../src/integrations/centrifugo/services/centrifugo.client', () => ({
  CentrifugoClient: { publish: vi.fn() },
}))

const conversationsRepo = vi.mocked(ConversationsRepo)
const notifications = vi.mocked(NotificationsService)
const teamRepo = vi.mocked(TeamRepo)

const STUDENT_ID = 'student-uuid'

const makeStudent = (assignedAdvisorId: string | null) => ({
  public_id: 'STU-3766',
  assigned_advisor_id: assignedAdvisorId,
  contact: { first_name: 'Ada', last_name: 'Obi' },
})

const makeConversation = (status: 'ACTIVE' | 'ESCALATED') => ({
  id: 'conv-uuid',
  public_id: 'CNV-1048',
  mode: 'AI_BOT',
  status,
})

beforeEach(() => {
  vi.clearAllMocks()
  conversationsRepo.findStudentForNotice.mockResolvedValue(makeStudent('advisor-uuid') as never)
  conversationsRepo.findCurrentConversation.mockResolvedValue(makeConversation('ACTIVE') as never)
  conversationsRepo.requestAdvisor.mockResolvedValue({} as never)
  teamRepo.findActiveAdminIds.mockResolvedValue(['admin-1', 'admin-2'])
})

describe('AdvisorRequestService.Request', () => {
  it('flags the thread for staff and notifies the assigned advisor', async () => {
    const result = await AdvisorRequestService.Request(STUDENT_ID, 'WEB')

    expect(result).toEqual({ alreadyRequested: false })
    expect(conversationsRepo.requestAdvisor).toHaveBeenCalledWith('conv-uuid', expect.anything())
    expect(notifications.notify).toHaveBeenCalledWith(
      ['advisor-uuid'],
      expect.objectContaining({ type: 'CONVERSATION', link: '/conversations/CNV-1048' }),
    )
    expect(teamRepo.findActiveAdminIds).not.toHaveBeenCalled()
  })

  it('notifies every active admin, linking to the student, when no advisor is assigned', async () => {
    conversationsRepo.findStudentForNotice.mockResolvedValue(makeStudent(null) as never)

    await AdvisorRequestService.Request(STUDENT_ID, 'TELEGRAM')

    expect(notifications.notify).toHaveBeenCalledWith(
      ['admin-1', 'admin-2'],
      expect.objectContaining({ type: 'CONVERSATION', link: '/students/STU-3766' }),
    )
  })

  it('writes an audit row with no staff actor and the channel in its metadata', async () => {
    await AdvisorRequestService.Request(STUDENT_ID, 'TELEGRAM')

    expect(AuditRepo.record).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'conversation.advisor_requested',
        entity_type: 'conversation',
        entity_id: 'CNV-1048',
        actor_id: null,
        actor_role: null,
        metadata: { studentId: 'STU-3766', conversationId: 'CNV-1048', channel: 'TELEGRAM' },
      }),
    )
  })

  it('is a no-op when the thread is already flagged', async () => {
    conversationsRepo.findCurrentConversation.mockResolvedValue(makeConversation('ESCALATED') as never)

    const result = await AdvisorRequestService.Request(STUDENT_ID, 'WEB')

    expect(result).toEqual({ alreadyRequested: true })
    expect(conversationsRepo.requestAdvisor).not.toHaveBeenCalled()
    expect(notifications.notify).not.toHaveBeenCalled()
    expect(AuditRepo.record).not.toHaveBeenCalled()
  })

  it('starts a new conversation when the last one was resolved', async () => {
    conversationsRepo.findCurrentConversation.mockResolvedValue(null)
    vi.mocked(ContactsRepo).createStudentConversation.mockResolvedValue(makeConversation('ACTIVE') as never)

    const result = await AdvisorRequestService.Request(STUDENT_ID, 'WEB')

    expect(result).toEqual({ alreadyRequested: false })
    expect(ContactsRepo.createStudentConversation).toHaveBeenCalledWith(STUDENT_ID)
    expect(conversationsRepo.requestAdvisor).toHaveBeenCalledWith('conv-uuid', expect.anything())
  })

  it('still succeeds when staff cannot be notified', async () => {
    notifications.notify.mockRejectedValue(new Error('boom'))
    vi.mocked(CentrifugoClient).publish.mockResolvedValue(false)

    const result = await AdvisorRequestService.Request(STUDENT_ID, 'WEB')

    expect(result).toEqual({ alreadyRequested: false })
    expect(conversationsRepo.requestAdvisor).toHaveBeenCalled()
  })

  it('throws NOT_FOUND for an unknown student', async () => {
    conversationsRepo.findStudentForNotice.mockResolvedValue(null)

    await expect(AdvisorRequestService.Request(STUDENT_ID, 'WEB')).rejects.toMatchObject({ statusCode: 404 })
    expect(conversationsRepo.requestAdvisor).not.toHaveBeenCalled()
  })
})
