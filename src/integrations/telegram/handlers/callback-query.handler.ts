import { logger } from '../../../config/logger.js'
import { TelegramOutboundService } from '../services/telegram-outbound.service.js'

export interface ParsedCallbackQuery {
  action: string
  value: string
}

export class TelegramCallbackQueryHandler {
  /**
   * Parses structured button callback data formatted as "ACTION:VALUE" (e.g. "SELECT_LEVEL:MASTERS").
   */
  static parseCallbackData(data: string): ParsedCallbackQuery | null {
    if (!data.includes(':')) {
      return null
    }

    const [action, ...valueParts] = data.split(':')
    if (!action) {
      return null
    }

    const value = valueParts.join(':')

    return {
      action: action.toUpperCase(),
      value,
    }
  }


  /**
   * Processes interactive inline keyboard button selections.
   */
  static async handleCallbackQuery(chatId: string, data: string): Promise<boolean> {
    const parsed = this.parseCallbackData(data)

    if (!parsed) {
      logger.warn({ chatId, data }, 'Unrecognized callback query data format.')
      return false
    }

    logger.info({ chatId, action: parsed.action, value: parsed.value }, 'Handling Telegram callback query.')

    switch (parsed.action) {
      case 'SELECT_LEVEL':
        await TelegramOutboundService.sendMessage(
          chatId,
          `Got it! You selected study level: ${parsed.value}.`
        )
        return true

      case 'SELECT_DESTINATION':
        await TelegramOutboundService.sendMessage(
          chatId,
          `Target destination updated: ${parsed.value}.`
        )
        return true

      default:
        return false
    }
  }
}
