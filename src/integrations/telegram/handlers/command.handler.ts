import { logger } from '../../../config/logger.js'
import { TelegramOutboundService } from '../services/telegram-outbound.service.js'

export interface ParsedCommand {
  command: string
  payload?: string | undefined
}

export class TelegramCommandHandler {
  /**
   * Parses raw message text to identify bot commands (e.g. "/start link_token_123").
   */
  static parseCommandText(text: string): ParsedCommand | null {
    if (!text.startsWith('/')) {
      return null
    }

    const parts = text.trim().split(/\s+/)
    const firstPart = parts[0]
    if (!firstPart) {
      return null
    }

    const rawCommand = firstPart.substring(1).toLowerCase() // Remove leading slash
    const payload = parts.slice(1).join(' ') || undefined

    return {
      command: rawCommand,
      payload,
    }
  }


  /**
   * Processes recognized bot commands and triggers appropriate welcome/linking workflows.
   */
  static async handleCommand(chatId: string, text: string): Promise<boolean> {
    const parsed = this.parseCommandText(text)

    if (!parsed) {
      return false
    }

    logger.info({ chatId, command: parsed.command, payload: parsed.payload }, 'Handling Telegram command.')

    switch (parsed.command) {
      case 'start':
        if (parsed.payload && parsed.payload.startsWith('link_')) {
          const token = parsed.payload.replace('link_', '')
          await TelegramOutboundService.sendMessage(
            chatId,
            `Linking your Telegram account with token: ${token}...`
          )
        } else {
          await TelegramOutboundService.sendMessage(
            chatId,
            'Welcome to School Finder AI! 🎓\n\nI will help you explore international study opportunities, target programs, and application requirements.'
          )
        }
        return true

      case 'help':
        await TelegramOutboundService.sendMessage(
          chatId,
          'Here is how you can use School Finder AI:\n\n• Type your questions about studying abroad.\n• Use /start to restart onboarding.'
        )
        return true

      default:
        return false
    }
  }
}
