import { StudentsRepo } from '../students/students.repository.js'
import { MatchingService } from '../matching/matching.service.js'
import { ConversationsRepo } from '../conversations/conversations.repository.js'
import { llmClient } from '../../integrations/llm/index.js'
import type { LLMMessage } from '../../integrations/llm/index.js'
import { MessageSenderType } from '../../generated/prisma/index.js'
import { STUDY_ABROAD_SYSTEM_PROMPT } from './ai.prompts.js'
import { createError } from '../../common/errors/AppError.js'
import {
  IndustryContextService,
  type GroundingContext,
} from './industry-context.service.js'

const formatIntakesForPrompt = (
  intakes: { month: string; year: number; applicationDeadline: Date | null }[],
) => {
  if (intakes.length === 0) return 'intake dates not listed'
  return intakes
    .map(
      (i) =>
        `${i.month} ${i.year}${i.applicationDeadline ? ` (apply by ${i.applicationDeadline.toDateString()})` : ''}`,
    )
    .join(', ')
}

const formatMatchesForPrompt = (
  matches: Awaited<ReturnType<typeof MatchingService.FindMatchesForStudent>>,
) => {
  if (matches.length === 0)
    return 'No shortlist available yet — not enough profile info to match programs.'
  return matches
    .map(
      (m) =>
        `- ${m.name} (${m.qualification}) at ${m.school.name}, ${m.school.city}, ${m.school.country} — ${m.tuitionCurrency} ${m.tuitionAmount} — intakes: ${formatIntakesForPrompt(m.intakes)}`,
    )
    .join('\n')
}

const formatGroundingContextForPrompt = ({
  bulletins,
  visaRates,
}: GroundingContext) => {
  if (bulletins.length === 0 && visaRates.length === 0) {
    return 'No verified industry updates available right now — do not state specific visa success rates, policy changes, or partner-sourced claims as fact.'
  }

  const rateLines = visaRates.map(
    (rate) =>
      `- ${rate.country} visa success rate: ${rate.success_rate}% (${rate.period_label}${rate.sample_size ? `, n=${rate.sample_size}` : ''})${rate.source_partner ? ` — via ${rate.source_partner}` : ''}`,
  )
  const bulletinLines = bulletins.map(
    (bulletin) =>
      `- [${bulletin.published_at.toDateString()}] ${bulletin.title}${bulletin.source_partner ? ` (via ${bulletin.source_partner})` : ''}: ${bulletin.body}`,
  )

  return [...rateLines, ...bulletinLines].join('\n')
}

export class AIReplyService {
  static GenerateReply = async (
    conversationId: string,
    studentId: string,
    studentMessage: string,
  ): Promise<string> => {
    await ConversationsRepo.createMessage(
      conversationId,
      MessageSenderType.STUDENT,
      studentMessage,
    )

    const student = await StudentsRepo.findStudentById(studentId)
    if (!student) {
      throw createError('Student not found', 404, {}, 'NOT_FOUND')
    }

    const matches = await MatchingService.FindMatchesForStudent(
      student.public_id,
      5,
    )
    const groundingContext = await IndustryContextService.GetGroundingContext(
      student.target_destinations ?? [],
    )
    const history = await ConversationsRepo.findRecentMessages(
      conversationId,
      20,
    )

    const systemPrompt = `${STUDY_ABROAD_SYSTEM_PROMPT}\n\nCurrent shortlist:\n${formatMatchesForPrompt(matches)}\n\nIndustry context:\n${formatGroundingContextForPrompt(groundingContext)}`

    const messages: LLMMessage[] = history.map((m) => ({
      role: m.sender_type === MessageSenderType.STUDENT ? 'user' : 'assistant',
      content: m.content,
    }))

    const replyText = await llmClient.generateReply(messages, systemPrompt)

    await ConversationsRepo.createMessage(
      conversationId,
      MessageSenderType.AGENT,
      replyText,
    )

    return replyText
  }
}
