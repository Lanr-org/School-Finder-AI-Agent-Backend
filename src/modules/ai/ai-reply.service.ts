import { StudentsRepo } from '../students/students.repository.js'
import { MatchingService } from '../matching/matching.service.js'
import { ConversationsRepo } from '../conversations/conversations.repository.js'
import { llmClient } from '../../integrations/llm/index.js'
import type { LLMMessage } from '../../integrations/llm/index.js'
import { MessageSenderType, type MessageChannel } from '../../generated/prisma/index.js'
import { STUDY_ABROAD_SYSTEM_PROMPT } from './ai.prompts.js'
import { createError } from '../../common/errors/AppError.js'
import { logger } from '../../config/logger.js'
import JourneyService from '../studentPortal/studentJourney.service.js'
import type { Journey, StageOwner } from '../studentPortal/studentPortal.types.js'
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

const OWNER_FOR_PROMPT: Record<StageOwner, string> = {
  YOU: 'the student',
  SMETASE: 'Smetase (you)',
  ADVISOR: 'their advisor',
}

const JOURNEY_FALLBACK = 'Journey not available — do not assume which steps are done.'

const formatJourneyForPrompt = (journey: Journey | null) => {
  if (!journey) return JOURNEY_FALLBACK
  const current = journey.stages.find((stage) => stage.status === 'CURRENT')
  if (!current) return JOURNEY_FALLBACK
  const done = journey.stages.filter((stage) => stage.status === 'DONE').map((stage) => stage.title)
  const todo = current.checklist.filter((item) => !item.done).map((item) => item.label)
  return [
    `Current stage: ${current.title} (owner: ${OWNER_FOR_PROMPT[current.owner]})`,
    `Next step: ${journey.nextStep.title}. ${journey.nextStep.description}`,
    `Still to do in this stage: ${todo.length ? todo.join(', ') : 'nothing listed'}`,
    `Done so far: ${done.length ? done.join(', ') : 'nothing yet'}`,
  ].join('\n')
}

// Never lets the journey break a reply: on failure the prompt says it's unknown.
const loadJourney = async (studentId: string) => {
  try {
    return await JourneyService.ForStudent(studentId)
  } catch (error) {
    logger.warn({ err: error, studentId }, 'Could not load journey for AI prompt.')
    return null
  }
}

export class AIReplyService {
  static GenerateReply = async (
    conversationId: string,
    studentId: string,
    channel: MessageChannel,
  ) => {
    // The student's message is already saved (StudentMessageService), so `history` includes it.
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
    const journey = await loadJourney(studentId)

    const systemPrompt = `${STUDY_ABROAD_SYSTEM_PROMPT}\n\nCurrent shortlist:\n${formatMatchesForPrompt(matches)}\n\nIndustry context:\n${formatGroundingContextForPrompt(groundingContext)}\n\nStudent's journey:\n${formatJourneyForPrompt(journey)}`

    const messages: LLMMessage[] = history.map((m) => ({
      role: m.sender_type === MessageSenderType.STUDENT ? 'user' : 'assistant',
      content: m.content,
    }))

    const replyText = await llmClient.generateReply(messages, systemPrompt)

    return ConversationsRepo.createMessage(
      conversationId,
      MessageSenderType.AGENT,
      replyText,
      channel,
    )
  }
}
