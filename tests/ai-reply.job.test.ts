import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AI_FALLBACK_REPLY,
  AI_GLOBAL_LIMIT_REPLY,
  AI_STUDENT_LIMIT_REPLY,
  processAiReply,
} from '../src/modules/ai/ai-reply.job'
import { AIReplyService } from '../src/modules/ai/ai-reply.service'
import { AiUsageService } from '../src/modules/ai/aiUsage.service'
import { ConversationsRepo } from '../src/modules/conversations/conversations.repository'
import { TelegramOutboundService } from '../src/integrations/telegram/services/telegram-outbound.service'

vi.mock('../src/modules/conversations/conversations.repository', () => ({
  ConversationsRepo: {
    findConversationMode: vi.fn(),
    hasNewerStudentMessage: vi.fn(),
    createMessage: vi.fn(),
    findTelegramChatId: vi.fn(),
  },
}))
vi.mock('../src/modules/ai/ai-reply.service', () => ({
  AIReplyService: { GenerateReply: vi.fn() },
}))
vi.mock('../src/modules/ai/aiUsage.service', () => ({
  AiUsageService: { TryConsume: vi.fn() },
}))
vi.mock(
  '../src/integrations/telegram/services/telegram-outbound.service',
  () => ({ TelegramOutboundService: { sendMessage: vi.fn() } }),
)

const repo = vi.mocked(ConversationsRepo)
const ai = vi.mocked(AIReplyService)
const usage = vi.mocked(AiUsageService)
const telegram = vi.mocked(TelegramOutboundService)

const job = {
  conversationId: 'conv-1',
  studentId: 'student-1',
  messageId: 'msg-1',
  channel: 'WEB' as const,
}

describe('processAiReply', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    repo.findConversationMode.mockResolvedValue('AI_BOT')
    repo.hasNewerStudentMessage.mockResolvedValue(false)
    ai.GenerateReply.mockResolvedValue({ content: 'Book your IELTS.' } as never)
    usage.TryConsume.mockResolvedValue({ allowed: true })
  })

  it('saves a limit message instead of calling the AI when the student is over their daily limit', async () => {
    usage.TryConsume.mockResolvedValue({
      allowed: false,
      reason: 'STUDENT_DAILY',
    })
    repo.createMessage.mockResolvedValue({
      content: AI_STUDENT_LIMIT_REPLY,
    } as never)

    await expect(processAiReply(job)).resolves.toBe('SKIPPED_LIMIT')

    expect(usage.TryConsume).toHaveBeenCalledWith('student-1')
    expect(ai.GenerateReply).not.toHaveBeenCalled()
    expect(repo.createMessage).toHaveBeenCalledWith(
      'conv-1',
      'AGENT',
      AI_STUDENT_LIMIT_REPLY,
      'WEB',
    )
    expect(telegram.sendMessage).not.toHaveBeenCalled()
  })

  it('uses the capacity message and pushes it to Telegram when the global cap is hit', async () => {
    usage.TryConsume.mockResolvedValue({
      allowed: false,
      reason: 'GLOBAL_DAILY',
    })
    repo.createMessage.mockResolvedValue({
      content: AI_GLOBAL_LIMIT_REPLY,
    } as never)
    repo.findTelegramChatId.mockResolvedValue('2011329752')

    await expect(processAiReply({ ...job, channel: 'TELEGRAM' })).resolves.toBe(
      'SKIPPED_LIMIT',
    )

    expect(ai.GenerateReply).not.toHaveBeenCalled()
    expect(telegram.sendMessage).toHaveBeenCalledWith(
      '2011329752',
      AI_GLOBAL_LIMIT_REPLY,
    )
  })

  it('does not spend usage when the job is skipped for an advisor or a newer message', async () => {
    repo.findConversationMode.mockResolvedValue('HUMAN_ADVISOR')
    await processAiReply(job)
    repo.findConversationMode.mockResolvedValue('AI_BOT')
    repo.hasNewerStudentMessage.mockResolvedValue(true)
    await processAiReply(job)

    expect(usage.TryConsume).not.toHaveBeenCalled()
  })

  it('saves the AI reply for a web student without pushing it anywhere', async () => {
    await expect(processAiReply(job)).resolves.toBe('REPLIED')
    expect(ai.GenerateReply).toHaveBeenCalledWith('conv-1', 'student-1', 'WEB')
    expect(telegram.sendMessage).not.toHaveBeenCalled()
  })

  it('sends the reply to the Telegram chat for a Telegram message', async () => {
    repo.findTelegramChatId.mockResolvedValue('2011329752')

    await processAiReply({ ...job, channel: 'TELEGRAM' })

    expect(telegram.sendMessage).toHaveBeenCalledWith(
      '2011329752',
      'Book your IELTS.',
    )
  })

  it('skips when an advisor took over while the job waited', async () => {
    repo.findConversationMode.mockResolvedValue('HUMAN_ADVISOR')
    await expect(processAiReply(job)).resolves.toBe('SKIPPED_ADVISOR')
    expect(ai.GenerateReply).not.toHaveBeenCalled()
  })

  it('skips when the student wrote again (the newer message gets one reply for all)', async () => {
    repo.hasNewerStudentMessage.mockResolvedValue(true)
    await expect(processAiReply(job)).resolves.toBe('SKIPPED_NEWER_MESSAGE')
    expect(repo.hasNewerStudentMessage).toHaveBeenCalledWith('conv-1', 'msg-1')
    expect(ai.GenerateReply).not.toHaveBeenCalled()
  })

  it('saves and sends the fallback when every AI provider fails', async () => {
    ai.GenerateReply.mockRejectedValue(new Error('all providers down'))
    repo.createMessage.mockResolvedValue({
      content: AI_FALLBACK_REPLY,
    } as never)
    repo.findTelegramChatId.mockResolvedValue('2011329752')

    await expect(processAiReply({ ...job, channel: 'TELEGRAM' })).resolves.toBe(
      'FALLBACK',
    )

    expect(repo.createMessage).toHaveBeenCalledWith(
      'conv-1',
      'AGENT',
      AI_FALLBACK_REPLY,
      'TELEGRAM',
    )
    expect(telegram.sendMessage).toHaveBeenCalledWith(
      '2011329752',
      AI_FALLBACK_REPLY,
    )
  })
})
