import { TelegramWebhookUpdate } from '../schemas/telegram-webhook.schema.js'

export interface ProviderContactDTO {
  providerType: 'TELEGRAM'
  providerUserId: string
  firstName: string
  lastName?: string | undefined
  username?: string | undefined
}

export class TelegramUserMapper {
  /**
   * Maps a raw Telegram Webhook Update user structure to a standard ProviderContactDTO.
   */
  static toProviderContact(update: TelegramWebhookUpdate): ProviderContactDTO | null {
    const fromUser = update.message?.from || update.callback_query?.from

    if (!fromUser) {
      return null
    }

    const lastName = 'last_name' in fromUser && typeof fromUser.last_name === 'string' ? fromUser.last_name : undefined
    const username = typeof fromUser.username === 'string' ? fromUser.username : undefined

    return {
      providerType: 'TELEGRAM',
      providerUserId: fromUser.id.toString(),
      firstName: fromUser.first_name,
      lastName,
      username,
    }
  }
}

