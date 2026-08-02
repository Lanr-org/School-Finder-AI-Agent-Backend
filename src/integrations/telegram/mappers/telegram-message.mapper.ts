import { TelegramWebhookUpdate } from '../schemas/telegram-webhook.schema.js'

export interface InboundMessageDTO {
  providerType: 'TELEGRAM'
  externalChatId: string
  externalMessageId: string
  textContent?: string | undefined
  isGroup: boolean
  isCallback: boolean
  callbackData?: string | undefined
}

export class TelegramMessageMapper {
  /**
   * Maps a Telegram Webhook Update to a standard channel-agnostic InboundMessageDTO.
   */
  static toInboundMessage(update: TelegramWebhookUpdate): InboundMessageDTO | null {
    if (update.message) {
      return {
        providerType: 'TELEGRAM',
        externalChatId: update.message.chat.id.toString(),
        externalMessageId: update.message.message_id.toString(),
        textContent: update.message.text,
        isGroup: update.message.chat.type !== 'private',
        isCallback: false,
      }
    }

    if (update.callback_query) {
      return {
        providerType: 'TELEGRAM',
        externalChatId: update.callback_query.message.chat.id.toString(),
        externalMessageId: update.callback_query.message.message_id.toString(),
        callbackData: update.callback_query.data,
        isGroup: false,
        isCallback: true,
      }
    }

    return null
  }
}

