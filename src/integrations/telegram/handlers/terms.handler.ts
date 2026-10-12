import { InlineKeyboard } from 'grammy'
import { MessageChannel } from '../../../generated/prisma/index.js'
import {
  CURRENT_TERMS_VERSION,
  PRIVACY_URL,
  StudentTermsService,
  TERMS_AGREEMENT_TEXT,
  TERMS_URL,
} from '../../../modules/studentPortal/studentTerms.js'
import { TelegramOutboundService } from '../services/telegram-outbound.service.js'
import { TelegramCommandHandler } from './command.handler.js'

export const ACCEPT_TERMS_ACTION = 'ACCEPT_TERMS'

// Telegram side of the one-click agreement. Until a student taps "I agree", nothing they send is
// saved or answered; they get the agreement again instead.
export class TelegramTermsHandler {
  /**
   * Runs before commands and messages. Returns true when it handled the update (the "I agree"
   * button, or anything from a student who hasn't agreed yet), so the caller stops there.
   */
  static async gate(chatId: string, studentId: string, callbackData?: string | null): Promise<boolean> {
    if (callbackData?.startsWith(`${ACCEPT_TERMS_ACTION}:`)) {
      await this.accept(chatId, studentId)
      return true
    }
    if (await StudentTermsService.IsAccepted(studentId)) return false
    await this.promptAgreement(chatId)
    return true
  }

  static async promptAgreement(chatId: string): Promise<void> {
    const keyboard = new InlineKeyboard().text('✅ I agree', `${ACCEPT_TERMS_ACTION}:${CURRENT_TERMS_VERSION}`)
    await TelegramOutboundService.sendMessage(
      chatId,
      `Welcome to Smetase! 🎓 Before we start, please confirm:\n\n${TERMS_AGREEMENT_TEXT}\n\nTerms: ${TERMS_URL}\nPrivacy Policy: ${PRIVACY_URL}`,
      keyboard,
    )
  }

  // The "I agree" button. Records the agreement, then starts onboarding like /start.
  static async accept(chatId: string, studentId: string): Promise<void> {
    await StudentTermsService.Accept(studentId, MessageChannel.TELEGRAM)
    await TelegramCommandHandler.sendWelcome(chatId)
  }
}
