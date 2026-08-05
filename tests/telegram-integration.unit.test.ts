import { describe, it, expect, vi } from 'vitest'
import { TelegramUserMapper } from '../src/integrations/telegram/mappers/telegram-user.mapper'
import { TelegramMessageMapper } from '../src/integrations/telegram/mappers/telegram-message.mapper'
import { TelegramFormattingUtil } from '../src/integrations/telegram/utils/telegram-formatting.util'
import { TelegramCommandHandler } from '../src/integrations/telegram/handlers/command.handler'
import { TelegramCallbackQueryHandler } from '../src/integrations/telegram/handlers/callback-query.handler'
import { TelegramWebhookUpdate } from '../src/integrations/telegram/schemas/telegram-webhook.schema'

describe('Telegram Integration Unit Tests', () => {
  describe('TelegramUserMapper', () => {
    it('should map a valid Telegram text message user to ProviderContactDTO', () => {
      const mockUpdate: TelegramWebhookUpdate = {
        update_id: 10001,
        message: {
          message_id: 501,
          date: 1600000000,
          from: {
            id: 987654321,
            is_bot: false,
            first_name: 'Chinedu',
            last_name: 'Nwosu',
            username: 'chinedu_n',
          },
          chat: {
            id: 987654321,
            type: 'private',
          },
          text: 'Hello, I want to apply for Masters in Canada',
        },
      }

      const mapped = TelegramUserMapper.toProviderContact(mockUpdate)

      expect(mapped).toEqual({
        providerType: 'TELEGRAM',
        providerUserId: '987654321',
        firstName: 'Chinedu',
        lastName: 'Nwosu',
        username: 'chinedu_n',
      })
    })
  })

  describe('TelegramMessageMapper', () => {
    it('should map standard text message to InboundMessageDTO', () => {
      const mockUpdate: TelegramWebhookUpdate = {
        update_id: 10002,
        message: {
          message_id: 502,
          date: 1600000000,
          chat: {
            id: 987654321,
            type: 'private',
          },
          text: 'What are the Fall 2026 intakes?',
        },
      }

      const mapped = TelegramMessageMapper.toInboundMessage(mockUpdate)

      expect(mapped).toEqual({
        providerType: 'TELEGRAM',
        externalChatId: '987654321',
        externalMessageId: '502',
        textContent: 'What are the Fall 2026 intakes?',
        isGroup: false,
        isCallback: false,
      })
    })

    it('should map inline button callback query to InboundMessageDTO', () => {
      const mockUpdate: TelegramWebhookUpdate = {
        update_id: 10003,
        callback_query: {
          id: 'cb_12345',
          from: {
            id: 987654321,
            first_name: 'Chinedu',
          },
          message: {
            message_id: 503,
            chat: {
              id: 987654321,
            },
          },
          data: 'SELECT_LEVEL:MASTERS',
        },
      }

      const mapped = TelegramMessageMapper.toInboundMessage(mockUpdate)

      expect(mapped).toEqual({
        providerType: 'TELEGRAM',
        externalChatId: '987654321',
        externalMessageId: '503',
        callbackData: 'SELECT_LEVEL:MASTERS',
        isGroup: false,
        isCallback: true,
      })
    })
  })

  describe('TelegramFormattingUtil', () => {
    it('should escape reserved MarkdownV2 characters', () => {
      const rawText = 'Hello! Welcome to School-Finder (AI) & More.'
      const escaped = TelegramFormattingUtil.escapeMarkdownV2(rawText)

      expect(escaped).toBe('Hello\\! Welcome to School\\-Finder \\(AI\\) & More\\.')
    })

    it('should chunk messages exceeding maximum length safely', () => {
      const longText = 'A'.repeat(5000)
      const chunks = TelegramFormattingUtil.chunkMessageText(longText, 3900)

      expect(chunks.length).toBe(2)
      expect(chunks[0]?.length).toBeLessThanOrEqual(3900)
    })
  })

  describe('TelegramCommandHandler', () => {
    it('should parse bot command and deep-linking payload correctly', () => {
      const parsed = TelegramCommandHandler.parseCommandText('/start link_token_xyz')

      expect(parsed).toEqual({
        command: 'start',
        payload: 'link_token_xyz',
      })
    })
  })

  describe('TelegramCallbackQueryHandler', () => {
    it('should parse ACTION:VALUE callback query data correctly', () => {
      const parsed = TelegramCallbackQueryHandler.parseCallbackData('SELECT_DESTINATION:CANADA')

      expect(parsed).toEqual({
        action: 'SELECT_DESTINATION',
        value: 'CANADA',
      })
    })
  })
})
