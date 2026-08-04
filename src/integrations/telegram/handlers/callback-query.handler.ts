import { InlineKeyboard } from 'grammy'
import { logger } from '../../../config/logger.js'
import { TelegramOutboundService } from '../services/telegram-outbound.service.js'
import { StudentsService } from '../../../modules/students/students.service.js'

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
   * Processes interactive inline keyboard button selections and saves choices to PostgreSQL.
   */
  static async handleCallbackQuery(chatId: string, data: string, studentId?: string): Promise<boolean> {
    const parsed = this.parseCallbackData(data)

    if (!parsed) {
      logger.warn({ chatId, data }, 'Unrecognized callback query data format.')
      return false
    }

    logger.info({ chatId, action: parsed.action, value: parsed.value, studentId }, 'Handling Telegram callback query.')

    switch (parsed.action) {
      case 'SELECT_LEVEL':
        if (studentId) {
          await StudentsService.updateStudentPreferences(studentId, {
            studyLevel: parsed.value,
          })
        }

        const destinationKeyboard = new InlineKeyboard()
          .text('🇨🇦 Canada', 'SELECT_DESTINATION:CANADA')
          .text('🇬🇧 United Kingdom', 'SELECT_DESTINATION:UK')
          .row()
          .text('🇺🇸 United States', 'SELECT_DESTINATION:USA')
          .text('🇮🇪 Ireland', 'SELECT_DESTINATION:IRELAND')

        await TelegramOutboundService.sendMessage(
          chatId,
          `Degree level saved as ${parsed.value}! 🎓\n\nWhich country is your primary destination choice?`,
          destinationKeyboard
        )
        return true

      case 'SELECT_DESTINATION':
        if (studentId) {
          await StudentsService.updateStudentPreferences(studentId, {
            targetDestinations: [parsed.value],
          })
        }

        const intakeKeyboard = new InlineKeyboard()
          .text('🍂 Fall 2026', 'SELECT_INTAKE:FALL_2026')
          .text('🌸 Spring 2027', 'SELECT_INTAKE:SPRING_2027')

        await TelegramOutboundService.sendMessage(
          chatId,
          `Primary destination set to ${parsed.value}! 🌍\n\nWhen are you planning to start your studies?`,
          intakeKeyboard
        )
        return true

      case 'SELECT_INTAKE':
        if (studentId) {
          await StudentsService.updateStudentPreferences(studentId, {
            targetIntake: parsed.value.replace('_', ' '),
          })
        }

        await TelegramOutboundService.sendMessage(
          chatId,
          '🎉 Preference registration complete!\n\nYour profile has been updated in our system. You can now ask me any question about tuition fees, admission requirements, or specific universities!'
        )
        return true

      default:
        return false
    }
  }
}

