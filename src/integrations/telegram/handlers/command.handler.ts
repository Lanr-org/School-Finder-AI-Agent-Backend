import { InlineKeyboard } from 'grammy'
import { logger } from '../../../config/logger.js'
import { MessageChannel } from '../../../generated/prisma/index.js'
import { AdvisorRequestService } from '../../../modules/conversations/advisorRequest.service.js'
import StudentLinkService from '../../../modules/studentLink/studentLink.service.js'
import type { LinkOutcome } from '../../../modules/studentLink/studentLink.types.js'
import { TelegramOutboundService } from '../services/telegram-outbound.service.js'


export interface ParsedCommand {
  command: string
  payload?: string | undefined
}

const LINKED_REPLY =
  "Done! Telegram and your Smetase web account are now one. Chat here or on the web, it's the same conversation."

export const LINK_REPLIES: Record<LinkOutcome, string> = {
  LINKED: LINKED_REPLY,
  ALREADY_LINKED: LINKED_REPLY,
  MERGED: LINKED_REPLY,
  INVALID_TOKEN: "That link has expired or was already used. On the web, tap 'Get updates on Telegram' again.",
  REFUSED: "We couldn't join these accounts automatically. Your advisor will sort it out.",
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
   * The token from "/start link_<token>" (a web account's "Get updates on Telegram" link), if any.
   */
  static parseLinkToken(text: string | undefined): string | null {
    const parsed = text ? this.parseCommandText(text) : null
    if (parsed?.command !== 'start' || !parsed.payload?.startsWith('link_')) return null
    return parsed.payload.slice('link_'.length) || null
  }

  /**
   * Processes recognized bot commands (welcome, help, and the web plan link).
   */
  static async handleCommand(chatId: string, text: string, studentId: string): Promise<boolean> {
    const parsed = this.parseCommandText(text)

    if (!parsed) {
      return false
    }

    logger.info({ chatId, command: parsed.command }, 'Handling Telegram command.')

    switch (parsed.command) {
      case 'start': {
        const levelKeyboard = new InlineKeyboard()
          .text('🎓 Masters', 'SELECT_LEVEL:MASTERS')
          .text('🏛️ Bachelors', 'SELECT_LEVEL:BACHELORS')
          .row()
          .text('🔬 PhD / Doctorate', 'SELECT_LEVEL:PHD')
          .text('📜 Diploma', 'SELECT_LEVEL:DIPLOMA')

        await TelegramOutboundService.sendMessage(
          chatId,
          'Welcome to Smetase! 🎓\n\nTo help us find the best study opportunities for you, what level of study are you aiming for?',
          levelKeyboard
        )
        return true
      }

      case 'plan': {
        // Signing in with Google on this link joins the web account to this Telegram student.
        const url = await StudentLinkService.CreateWebLink(studentId)
        // Telegram rejects non-https button URLs (e.g. localhost), so local testing gets the plain link.
        const keyboard = url.startsWith('https://') ? new InlineKeyboard().url('Open my plan', url) : undefined
        await TelegramOutboundService.sendMessage(
          chatId,
          `Here's your plan on the web. Sign in with Google and your matches, shortlist and this chat are all there.\n\n${url}\n\nThe link works once, for 15 minutes.`,
          keyboard
        )
        return true
      }

      case 'advisor': {
        const { alreadyRequested } = await AdvisorRequestService.Request(studentId, MessageChannel.TELEGRAM)
        await TelegramOutboundService.sendMessage(
          chatId,
          alreadyRequested
            ? "You've already asked for an advisor. The team has been told and will follow up here. You can keep chatting with me in the meantime."
            : "Done, I've asked the Smetase team to have an advisor follow up with you here. You can keep chatting with me in the meantime."
        )
        return true
      }

      case 'help':
        await TelegramOutboundService.sendMessage(
          chatId,
          'Here is how you can use Smetase:\n\n• Type your questions about studying abroad.\n• /plan to open your plan on the web.\n• /advisor to talk to a real advisor.\n• /start to restart onboarding.'
        )
        return true

      default:
        return false
    }
  }
}
