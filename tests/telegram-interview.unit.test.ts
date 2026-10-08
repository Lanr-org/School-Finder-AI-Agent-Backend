import './setup-env'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TelegramCommandHandler } from '../src/integrations/telegram/handlers/command.handler'
import { TelegramCallbackQueryHandler } from '../src/integrations/telegram/handlers/callback-query.handler'
import {
  TelegramInterviewHandler,
  formatInterviewTurn,
} from '../src/integrations/telegram/handlers/interview.handler'
import { TelegramOutboundService } from '../src/integrations/telegram/services/telegram-outbound.service'
import InterviewService from '../src/modules/interview/interview.service'

vi.mock('../src/integrations/telegram/services/telegram-outbound.service', () => ({
  TelegramOutboundService: { sendMessage: vi.fn() },
}))
vi.mock('../src/modules/interview/interview.service', () => ({
  default: { Start: vi.fn(), SubmitAnswer: vi.fn(), GetActive: vi.fn(), Abandon: vi.fn() },
}))
vi.mock('../src/modules/conversations/advisorRequest.service', () => ({ AdvisorRequestService: { Request: vi.fn() } }))
vi.mock('../src/modules/studentLink/studentLink.service', () => ({ default: { CreateWebLink: vi.fn() } }))
vi.mock('../src/modules/students/students.service', () => ({ StudentsService: { updateStudentPreferences: vi.fn() } }))

const send = vi.mocked(TelegramOutboundService).sendMessage
const service = vi.mocked(InterviewService)

const turn = {
  sessionId: 'sess',
  feedback: null,
  nextQuestion: { index: 0, text: 'Why this course?' },
  result: null,
}

beforeEach(() => vi.resetAllMocks())

describe('/interview and /stop commands', () => {
  it('/interview offers the two interview types', async () => {
    service.GetActive.mockResolvedValue(null)

    const handled = await TelegramCommandHandler.handleCommand('c1', '/interview', 's1')

    expect(handled).toBe(true)
    expect(send.mock.calls[0]![1]).toContain('Which interview?')
    expect(send.mock.calls[0]![2]).toBeDefined()
  })

  it('/interview does not start a second one', async () => {
    service.GetActive.mockResolvedValue({ id: 'sess' } as never)

    await TelegramCommandHandler.handleCommand('c1', '/interview', 's1')

    expect(send.mock.calls[0]![1]).toContain('already have a practice interview')
    expect(send.mock.calls[0]![2]).toBeUndefined()
  })

  it('/stop abandons the running interview', async () => {
    service.GetActive.mockResolvedValue({ id: 'sess' } as never)
    service.Abandon.mockResolvedValue({ sessionId: 'sess', status: 'ABANDONED' })

    await TelegramCommandHandler.handleCommand('c1', '/stop', 's1')

    expect(service.Abandon).toHaveBeenCalledWith('s1', 'sess')
    expect(send.mock.calls[0]![1]).toContain('Interview stopped')
  })

  it('/stop with nothing running says so', async () => {
    service.GetActive.mockResolvedValue(null)

    await TelegramCommandHandler.handleCommand('c1', '/stop', 's1')

    expect(service.Abandon).not.toHaveBeenCalled()
    expect(send.mock.calls[0]![1]).toContain('no practice interview')
  })

  it('is listed in /help', async () => {
    await TelegramCommandHandler.handleCommand('c1', '/help', 's1')
    expect(send.mock.calls[0]![1]).toContain('/interview')
  })
})

describe('INTERVIEW_TYPE callback', () => {
  it('starts the chosen interview on the Telegram channel and sends question 1', async () => {
    service.Start.mockResolvedValue(turn)

    const handled = await TelegramCallbackQueryHandler.handleCallbackQuery('c1', 'INTERVIEW_TYPE:VISA', 's1')

    expect(handled).toBe(true)
    expect(service.Start).toHaveBeenCalledWith('s1', 'VISA', 'TELEGRAM')
    expect(send.mock.calls[0]![1]).toContain('Question 1 of 5')
  })

  it('ignores an unknown type', async () => {
    const handled = await TelegramCallbackQueryHandler.handleCallbackQuery('c1', 'INTERVIEW_TYPE:NOPE', 's1')

    expect(handled).toBe(false)
    expect(service.Start).not.toHaveBeenCalled()
  })

  it("passes on a limit message meant for the student", async () => {
    service.Start.mockRejectedValue(
      Object.assign(new Error("You've reached today's limit for practice interviews."), { statusCode: 429 }),
    )

    await TelegramCallbackQueryHandler.handleCallbackQuery('c1', 'INTERVIEW_TYPE:ADMISSION', 's1')

    expect(send.mock.calls[0]![1]).toContain("today's limit")
  })
})

describe('TelegramInterviewHandler.handleText', () => {
  it('returns false when no interview is running, so normal chat continues', async () => {
    service.GetActive.mockResolvedValue(null)

    await expect(TelegramInterviewHandler.handleText('c1', 's1', 'hello')).resolves.toBe(false)
    expect(service.SubmitAnswer).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
  })

  it('treats text as the answer during an interview and replies with the feedback', async () => {
    service.GetActive.mockResolvedValue({ id: 'sess' } as never)
    service.SubmitAnswer.mockResolvedValue({
      sessionId: 'sess',
      feedback: { tip: 'Add detail.', score: 6, sampleAnswer: null },
      nextQuestion: { index: 1, text: 'Who funds you?' },
      result: null,
    })

    await expect(TelegramInterviewHandler.handleText('c1', 's1', 'My answer')).resolves.toBe(true)

    expect(service.SubmitAnswer).toHaveBeenCalledWith('s1', 'sess', 'My answer')
    expect(send.mock.calls[0]![1]).toContain('Add detail.')
    expect(send.mock.calls[0]![1]).toContain('Question 2 of 5')
  })

  it('still claims the message and asks to resend when the AI fails', async () => {
    service.GetActive.mockResolvedValue({ id: 'sess' } as never)
    service.SubmitAnswer.mockRejectedValue(Object.assign(new Error('boom'), { statusCode: 500 }))

    await expect(TelegramInterviewHandler.handleText('c1', 's1', 'My answer')).resolves.toBe(true)

    expect(send.mock.calls[0]![1]).toContain('send your answer again')
  })
})

describe('formatInterviewTurn', () => {
  it('shows a sample answer after the tip when there is one', () => {
    const text = formatInterviewTurn({
      sessionId: 'sess',
      feedback: { tip: 'Too vague.', score: 3, sampleAnswer: 'I chose [your course] because...' },
      nextQuestion: { index: 1, text: 'Who funds you?' },
      result: null,
    })

    expect(text).toContain('A stronger answer could sound like this')
    expect(text).toContain('I chose [your course] because...')
    expect(text.indexOf('Too vague.')).toBeLessThan(text.indexOf('stronger answer'))
    expect(text.indexOf('stronger answer')).toBeLessThan(text.indexOf('Question 2 of 5'))
  })

  it('omits the sample section when there is none', () => {
    const text = formatInterviewTurn({
      sessionId: 'sess',
      feedback: { tip: 'Good.', score: 8, sampleAnswer: null },
      nextQuestion: { index: 1, text: 'Next?' },
      result: null,
    })

    expect(text).not.toContain('stronger answer')
  })

  it('shows the score, summary and lists on the final turn', () => {
    const text = formatInterviewTurn({
      sessionId: 'sess',
      feedback: { tip: 'Nice.', score: 9, sampleAnswer: null },
      nextQuestion: null,
      result: { overallScore: 81, summary: 'Great.', strengths: ['Clear'], improvements: ['Detail'] },
    })

    expect(text).toContain('Overall score: 81/100')
    expect(text).toContain('• Clear')
    expect(text).toContain('• Detail')
    expect(text).not.toContain('Question')
  })
})
