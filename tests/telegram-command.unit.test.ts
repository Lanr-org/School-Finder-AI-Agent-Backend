import './setup-env'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TelegramCommandHandler } from '../src/integrations/telegram/handlers/command.handler'
import { TelegramOutboundService } from '../src/integrations/telegram/services/telegram-outbound.service'
import StudentLinkService from '../src/modules/studentLink/studentLink.service'

vi.mock('../src/integrations/telegram/services/telegram-outbound.service', () => ({
  TelegramOutboundService: { sendMessage: vi.fn() },
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
