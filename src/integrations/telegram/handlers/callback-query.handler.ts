import { InlineKeyboard } from 'grammy'
import { logger } from '../../../config/logger.js'
import { TelegramOutboundService } from '../services/telegram-outbound.service.js'
import { StudentsService } from '../../../modules/students/students.service.js'
import { IntakeMonth } from '../../../generated/prisma/index.js'

export interface ParsedCallbackQuery {
  action: string
  value: string
}

// Calendar-month index (0-11) for the two intakes schools commonly offer. Extend here if a
// school with a different intake cycle needs representing.
const OFFERED_INTAKE_MONTHS: { month: IntakeMonth; calendarIndex: number; label: string }[] = [
  { month: IntakeMonth.SEPTEMBER, calendarIndex: 8, label: 'September' },
  { month: IntakeMonth.JANUARY, calendarIndex: 0, label: 'January' },
]

/**
 * Computes the next upcoming occurrence of each offered intake month/year relative to now,
 * so the bot never shows a stale year and never needs a redeploy to roll forward.
 */
const getUpcomingIntakeOptions = (referenceDate: Date = new Date()) => {
  const currentMonth = referenceDate.getMonth()
  const currentYear = referenceDate.getFullYear()

  return OFFERED_INTAKE_MONTHS.map(({ month, calendarIndex, label }) => ({
    month,
    year: currentMonth <= calendarIndex ? currentYear : currentYear + 1,
    label,
  })).sort((a, b) => a.year - b.year || OFFERED_INTAKE_MONTHS.findIndex((m) => m.month === a.month) - OFFERED_INTAKE_MONTHS.findIndex((m) => m.month === b.month))
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

        const intakeKeyboard = getUpcomingIntakeOptions().reduce(
          (keyboard, option) => keyboard.text(`📅 ${option.label} ${option.year}`, `SELECT_INTAKE:${option.month}_${option.year}`),
          new InlineKeyboard()
        )

        await TelegramOutboundService.sendMessage(
          chatId,
          `Primary destination set to ${parsed.value}! 🌍\n\nWhen are you planning to start your studies?`,
          intakeKeyboard
        )
        return true

      case 'SELECT_INTAKE':
        if (studentId) {
          const [month, yearRaw] = parsed.value.split('_')
          const year = Number(yearRaw)

          if (month && Number.isFinite(year)) {
            await StudentsService.updateStudentPreferences(studentId, {
              targetIntakeMonth: month as IntakeMonth,
              targetIntakeYear: year,
            })
          }
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

