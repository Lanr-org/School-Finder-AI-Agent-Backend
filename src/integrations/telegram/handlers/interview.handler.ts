import { InlineKeyboard } from 'grammy'
import { logger } from '../../../config/logger.js'
import { InterviewType, MessageChannel } from '../../../generated/prisma/index.js'
import type { AppError } from '../../../common/errors/AppError.js'
import InterviewService from '../../../modules/interview/interview.service.js'
import {
  INTERVIEW_QUESTION_COUNT,
  type InterviewTurn,
} from '../../../modules/interview/interview.types.js'
import { TelegramOutboundService } from '../services/telegram-outbound.service.js'

const GENERIC_FAILURE = "Sorry, I couldn't continue the interview just now. Please send your answer again."

const bullets = (items: string[]) => items.map((item) => `• ${item}`).join('\n')

export const formatInterviewTurn = (turn: InterviewTurn): string => {
  const parts: string[] = []
  if (turn.feedback) {
    const { tip, score, sampleAnswer } = turn.feedback
    parts.push(`💡 ${tip}\nScore: ${score}/10`)
    if (sampleAnswer) parts.push(`✍️ A stronger answer could sound like this:\n"${sampleAnswer}"`)
  }
  if (turn.nextQuestion) {
    parts.push(
      `Question ${turn.nextQuestion.index + 1} of ${INTERVIEW_QUESTION_COUNT}:\n${turn.nextQuestion.text}`,
    )
  }
  if (turn.result) {
    const { overallScore, summary, strengths, improvements } = turn.result
    parts.push(
      [
        `🏁 Interview complete! Overall score: ${overallScore}/100`,
        summary,
        strengths.length ? `Strengths:\n${bullets(strengths)}` : '',
        improvements.length ? `To improve:\n${bullets(improvements)}` : '',
        'This is practice only. Confirm real requirements with your advisor or the official source. Send /interview to try again.',
      ]
        .filter(Boolean)
        .join('\n\n'),
    )
  }
  return parts.join('\n\n')
}

// Known client errors (limit reached, already running...) carry a message meant for the student.
const friendlyMessage = (error: unknown): string => {
  const appError = error as Partial<AppError> | undefined
  const status = appError?.statusCode
  if (typeof status === 'number' && status >= 400 && status < 500 && appError?.message) {
    return appError.message
  }
  return GENERIC_FAILURE
}

export class TelegramInterviewHandler {
  // "/interview": ask which kind. Starting happens on the button press.
  static async promptType(chatId: string, studentId: string): Promise<void> {
    if (await InterviewService.GetActive(studentId)) {
      await TelegramOutboundService.sendMessage(
        chatId,
        'You already have a practice interview running. Answer the last question, or send /stop to end it.',
      )
      return
    }
    const keyboard = new InlineKeyboard()
      .text('🛂 Visa interview', `INTERVIEW_TYPE:${InterviewType.VISA}`)
      .row()
      .text('🎓 Admission interview', `INTERVIEW_TYPE:${InterviewType.ADMISSION}`)
    await TelegramOutboundService.sendMessage(
      chatId,
      `Let's practise! ${INTERVIEW_QUESTION_COUNT} questions, one at a time, with a tip after each answer. Which interview?`,
      keyboard,
    )
  }

  static async start(chatId: string, studentId: string, type: InterviewType): Promise<void> {
    try {
      const turn = await InterviewService.Start(studentId, type, MessageChannel.TELEGRAM)
      await TelegramOutboundService.sendMessage(
        chatId,
        `${formatInterviewTurn(turn)}\n\nType your answer below. Send /stop to end the interview.`,
      )
    } catch (error) {
      logger.warn({ err: error, studentId }, 'Could not start Telegram interview.')
      await TelegramOutboundService.sendMessage(chatId, friendlyMessage(error))
    }
  }

  // Free text during an interview is the answer. Returns false when there is no interview
  // in progress, so the caller falls through to the normal AI chat.
  static async handleText(chatId: string, studentId: string, text: string): Promise<boolean> {
    const active = await InterviewService.GetActive(studentId)
    if (!active) return false
    try {
      const turn = await InterviewService.SubmitAnswer(studentId, active.id, text.slice(0, 1500))
      await TelegramOutboundService.sendMessage(chatId, formatInterviewTurn(turn))
    } catch (error) {
      logger.warn({ err: error, studentId }, 'Could not record Telegram interview answer.')
      await TelegramOutboundService.sendMessage(chatId, friendlyMessage(error))
    }
    return true
  }

  static async stop(chatId: string, studentId: string): Promise<void> {
    const active = await InterviewService.GetActive(studentId)
    if (!active) {
      await TelegramOutboundService.sendMessage(chatId, 'There is no practice interview running. Send /interview to start one.')
      return
    }
    await InterviewService.Abandon(studentId, active.id)
    await TelegramOutboundService.sendMessage(chatId, 'Interview stopped. Send /interview whenever you want to practise again.')
  }
}
