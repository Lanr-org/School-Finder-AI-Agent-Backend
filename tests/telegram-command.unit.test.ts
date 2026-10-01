import './setup-env'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TelegramCommandHandler } from '../src/integrations/telegram/handlers/command.handler'
import { TelegramOutboundService } from '../src/integrations/telegram/services/telegram-outbound.service'
import StudentLinkService from '../src/modules/studentLink/studentLink.service'
import { AdvisorRequestService } from '../src/modules/conversations/advisorRequest.service'

vi.mock('../src/integrations/telegram/services/telegram-outbound.service', () => ({
  TelegramOutboundService: { sendMessage: vi.fn() },
}))
vi.mock('../src/modules/conversations/advisorRequest.service', () => ({
  AdvisorRequestService: { Request: vi.fn() },
}))
vi.mock('../src/modules/studentLink/studentLink.service', () => ({
  default: { CreateWebLink: vi.fn() },
}))

const send = vi.mocked(TelegramOutboundService).sendMessage
const createWebLink = vi.mocked(StudentLinkService).CreateWebLink

beforeEach(() => vi.clearAllMocks())

describe('TelegramCommandHandler.parseLinkToken', () => {
  it.each([
    ['/start link_abc123', 'abc123'],
    ['/start', null],
    ['/start hello', null],
    ['/start link_', null],
    ['/help link_abc', null],
    ['hello', null],
    [undefined, null],
  ])('%s → %s', (text, expected) => {
    expect(TelegramCommandHandler.parseLinkToken(text)).toBe(expected)
  })
})

describe('/advisor', () => {
  const request = vi.mocked(AdvisorRequestService).Request

  it('asks for an advisor on the Telegram channel and confirms', async () => {
    request.mockResolvedValue({ alreadyRequested: false })

    const handled = await TelegramCommandHandler.handleCommand('2011329752', '/advisor', 'student-uuid')

    expect(handled).toBe(true)
    expect(request).toHaveBeenCalledWith('student-uuid', 'TELEGRAM')
    expect(send.mock.calls[0]![1]).toContain("I've asked the Smetase team")
  })

  it('tells the student when they already asked', async () => {
    request.mockResolvedValue({ alreadyRequested: true })

    await TelegramCommandHandler.handleCommand('2011329752', '/advisor', 'student-uuid')

    expect(send.mock.calls[0]![1]).toContain("already asked")
  })

  it('is listed in /help', async () => {
    await TelegramCommandHandler.handleCommand('2011329752', '/help', 'student-uuid')

    expect(send.mock.calls[0]![1]).toContain('/advisor')
  })
})

describe('/plan', () => {
  it('sends a one-time web link for this student, as plain text on localhost', async () => {
    createWebLink.mockResolvedValue('http://localhost:5174/link/token123')

    const handled = await TelegramCommandHandler.handleCommand('2011329752', '/plan', 'student-uuid')

    expect(handled).toBe(true)
    expect(createWebLink).toHaveBeenCalledWith('student-uuid')
    const [chatId, text, keyboard] = send.mock.calls[0]!
    expect(chatId).toBe('2011329752')
    expect(text).toContain('http://localhost:5174/link/token123')
    expect(keyboard).toBeUndefined()
  })

  it('adds an "Open my plan" button for an https link', async () => {
    createWebLink.mockResolvedValue('https://app.smetase.com/link/token123')

    await TelegramCommandHandler.handleCommand('2011329752', '/plan', 'student-uuid')

    const keyboard = send.mock.calls[0]![2] as { inline_keyboard: { text: string; url: string }[][] }
    expect(keyboard.inline_keyboard[0]![0]).toMatchObject({
      text: 'Open my plan',
      url: 'https://app.smetase.com/link/token123',
    })
  })
})
