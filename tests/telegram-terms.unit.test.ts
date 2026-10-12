import './setup-env'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TelegramTermsHandler } from '../src/integrations/telegram/handlers/terms.handler'
import { TelegramOutboundService } from '../src/integrations/telegram/services/telegram-outbound.service'
import { CURRENT_TERMS_VERSION, StudentTermsService } from '../src/modules/studentPortal/studentTerms'

vi.mock('../src/integrations/telegram/services/telegram-outbound.service', () => ({
  TelegramOutboundService: { sendMessage: vi.fn() },
}))
vi.mock('../src/modules/studentPortal/studentTerms', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/modules/studentPortal/studentTerms')>()
  return { ...actual, StudentTermsService: { IsAccepted: vi.fn(), Accept: vi.fn() } }
})
vi.mock('../src/modules/conversations/advisorRequest.service', () => ({ AdvisorRequestService: { Request: vi.fn() } }))
vi.mock('../src/modules/studentLink/studentLink.service', () => ({ default: { CreateWebLink: vi.fn() } }))

const send = vi.mocked(TelegramOutboundService.sendMessage)
const terms = vi.mocked(StudentTermsService)

const CHAT = '2011329752'
const STUDENT = 'student-uuid'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('TelegramTermsHandler.gate', () => {
  it('lets a student who agreed through', async () => {
    terms.IsAccepted.mockResolvedValue(true)
    expect(await TelegramTermsHandler.gate(CHAT, STUDENT, null)).toBe(false)
    expect(send).not.toHaveBeenCalled()
  })

  it('answers anything else with the agreement and an "I agree" button', async () => {
    terms.IsAccepted.mockResolvedValue(false)

    expect(await TelegramTermsHandler.gate(CHAT, STUDENT, null)).toBe(true)

    const [chatId, text, keyboard] = send.mock.calls[0]!
    expect(chatId).toBe(CHAT)
    expect(text).toContain('I agree to the Terms and Privacy Policy')
    expect(text).toContain('https://smetase.com/terms')
    expect(text).toContain('https://smetase.com/privacy')
    expect(JSON.stringify(keyboard)).toContain(`ACCEPT_TERMS:${CURRENT_TERMS_VERSION}`)
    expect(terms.Accept).not.toHaveBeenCalled()
  })

  it('records the agreement on the button and starts onboarding', async () => {
    expect(await TelegramTermsHandler.gate(CHAT, STUDENT, `ACCEPT_TERMS:${CURRENT_TERMS_VERSION}`)).toBe(true)

    expect(terms.Accept).toHaveBeenCalledWith(STUDENT, 'TELEGRAM')
    expect(send).toHaveBeenCalledWith(CHAT, expect.stringContaining('what level of study'), expect.anything())
  })

  it('does not treat other buttons as agreement', async () => {
    terms.IsAccepted.mockResolvedValue(false)
    expect(await TelegramTermsHandler.gate(CHAT, STUDENT, 'SELECT_LEVEL:MASTERS')).toBe(true)
    expect(terms.Accept).not.toHaveBeenCalled()
  })
})
