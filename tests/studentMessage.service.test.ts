import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AI_FALLBACK_REPLY,
  StudentMessageService,
} from '../src/modules/conversations/studentMessage.service'
import { ConversationsRepo } from '../src/modules/conversations/conversations.repository'
import { AIReplyService } from '../src/modules/ai/ai-reply.service'

vi.mock('../src/modules/conversations/conversations.repository', () => ({
  ConversationsRepo: {
    createMessage: vi.fn(),
    findConversationMode: vi.fn(),
  },
}))

vi.mock('../src/modules/ai/ai-reply.service', () => ({
  AIReplyService: {
    GenerateReply: vi.fn(),
  },
}))

const conversationsRepoMock = vi.mocked(ConversationsRepo)
const aiReplyMock = vi.mocked(AIReplyService)

const input = {
  conversationId: 'conv-1',
  studentId: 'student-1',
  text: 'Which schools fit me?',
  channel: 'WEB' as const,
}

const studentMessage = { id: 'msg-1', sender_type: 'STUDENT', channel: 'WEB' }
const aiReply = { id: 'msg-2', sender_type: 'AGENT', channel: 'WEB' }

describe('StudentMessageService.Receive', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    conversationsRepoMock.createMessage.mockResolvedValue(studentMessage as any)
  })

  it('saves the student message and returns the AI reply while the AI handles the conversation', async () => {
    conversationsRepoMock.findConversationMode.mockResolvedValue('AI_BOT')
    aiReplyMock.GenerateReply.mockResolvedValue(aiReply as any)

    const result = await StudentMessageService.Receive(input)

    expect(conversationsRepoMock.createMessage).toHaveBeenCalledWith(
      'conv-1',
      'STUDENT',
      'Which schools fit me?',
      'WEB',
    )
    expect(aiReplyMock.GenerateReply).toHaveBeenCalledWith('conv-1', 'student-1', 'WEB')
    expect(result).toEqual({ message: studentMessage, reply: aiReply })
  })

  it('still saves the student message once an advisor has taken over, without an AI reply', async () => {
    conversationsRepoMock.findConversationMode.mockResolvedValue('HUMAN_ADVISOR')

    const result = await StudentMessageService.Receive({ ...input, channel: 'TELEGRAM' })

    expect(conversationsRepoMock.createMessage).toHaveBeenCalledTimes(1)
    expect(conversationsRepoMock.createMessage).toHaveBeenCalledWith(
      'conv-1',
      'STUDENT',
      'Which schools fit me?',
      'TELEGRAM',
    )
    expect(aiReplyMock.GenerateReply).not.toHaveBeenCalled()
    expect(result).toEqual({ message: studentMessage, reply: null })
  })

  it('saves and returns the fallback reply when the AI fails', async () => {
    conversationsRepoMock.findConversationMode.mockResolvedValue('AI_BOT')
    aiReplyMock.GenerateReply.mockRejectedValue(new Error('LLM timeout'))
    const fallback = { id: 'msg-3', sender_type: 'AGENT', content: AI_FALLBACK_REPLY }
    conversationsRepoMock.createMessage
      .mockResolvedValueOnce(studentMessage as any)
      .mockResolvedValueOnce(fallback as any)

    const result = await StudentMessageService.Receive(input)

    expect(conversationsRepoMock.createMessage).toHaveBeenLastCalledWith(
      'conv-1',
      'AGENT',
      AI_FALLBACK_REPLY,
      'WEB',
    )
    expect(result).toEqual({ message: studentMessage, reply: fallback })
  })
})
