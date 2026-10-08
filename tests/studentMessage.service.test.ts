import { beforeEach, describe, expect, it, vi } from 'vitest'
import { StudentMessageService } from '../src/modules/conversations/studentMessage.service'
import { ConversationsRepo } from '../src/modules/conversations/conversations.repository'
import { aiReplyQueue } from '../src/jobs/queues'

vi.mock('../src/modules/conversations/conversations.repository', () => ({
  ConversationsRepo: {
    createMessage: vi.fn(),
    findConversationMode: vi.fn(),
  },
}))

vi.mock('../src/jobs/queues', () => ({
  aiReplyQueue: { add: vi.fn() },
}))

const conversationsRepoMock = vi.mocked(ConversationsRepo)
const queueMock = vi.mocked(aiReplyQueue)

const input = {
  conversationId: 'conv-1',
  studentId: 'student-1',
  text: 'Which schools fit me?',
  channel: 'WEB' as const,
}

const studentMessage = { id: 'msg-1', sender_type: 'STUDENT', channel: 'WEB' }

describe('StudentMessageService.Receive', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    conversationsRepoMock.createMessage.mockResolvedValue(
      studentMessage as never,
    )
  })

  it('saves the student message and queues the AI reply (without calling the AI)', async () => {
    conversationsRepoMock.findConversationMode.mockResolvedValue('AI_BOT')

    const result = await StudentMessageService.Receive(input)

    expect(conversationsRepoMock.createMessage).toHaveBeenCalledWith(
      'conv-1',
      'STUDENT',
      'Which schools fit me?',
      'WEB',
    )
    // Keyed by message id, so one message is never answered twice.
    expect(queueMock.add).toHaveBeenCalledWith(
      'reply',
      {
        conversationId: 'conv-1',
        studentId: 'student-1',
        messageId: 'msg-1',
        channel: 'WEB',
      },
      { jobId: 'ai_msg-1' },
    )
    expect(result).toEqual({ message: studentMessage, replyQueued: true })
  })

  it('still saves the student message once an advisor has taken over, without queuing a reply', async () => {
    conversationsRepoMock.findConversationMode.mockResolvedValue(
      'HUMAN_ADVISOR',
    )

    const result = await StudentMessageService.Receive({
      ...input,
      channel: 'TELEGRAM',
    })

    expect(conversationsRepoMock.createMessage).toHaveBeenCalledWith(
      'conv-1',
      'STUDENT',
      'Which schools fit me?',
      'TELEGRAM',
    )
    expect(queueMock.add).not.toHaveBeenCalled()
    expect(result).toEqual({ message: studentMessage, replyQueued: false })
  })
})
