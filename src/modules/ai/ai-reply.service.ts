import { StudentsRepo } from '../students/students.repository.js'
import { MatchingService } from '../matching/matching.service.js'
import { ConversationsRepo } from '../conversations/conversations.repository.js'
import { llmClient } from '../../integrations/llm/index.js'
import type { LLMMessage } from '../../integrations/llm/index.js'
import { MessageSenderType } from '../../generated/prisma/index.js'
import { STUDY_ABROAD_SYSTEM_PROMPT } from './ai.prompts.js'
import { createError } from '../../common/errors/AppError.js'

const formatMatchesForPrompt = (matches: Awaited<ReturnType<typeof MatchingService.FindMatchesForStudent>>) => {
  if (matches.length === 0) return 'No shortlist available yet — not enough profile info to match programs.'
  return matches
    .map(
      (m) =>
        `- ${m.name} (${m.qualification}) at ${m.school.name}, ${m.school.city}, ${m.school.country} — ${m.tuitionCurrency} ${m.tuitionAmount}`,
    )
    .join('\n')
}

export class AIReplyService {
  static GenerateReply = async (
    conversationId: string,
    studentId: string,
    studentMessage: string,
  ): Promise<string> => {
    await ConversationsRepo.createMessage(conversationId, MessageSenderType.STUDENT, studentMessage)

    const student = await StudentsRepo.findStudentById(studentId)
    if (!student) {
      throw createError('Student not found', 404, {}, 'NOT_FOUND')
    }

    const matches = await MatchingService.FindMatchesForStudent(student.public_id, 5)
    const history = await ConversationsRepo.findRecentMessages(conversationId, 20)

    const systemPrompt = `${STUDY_ABROAD_SYSTEM_PROMPT}\n\nCurrent shortlist:\n${formatMatchesForPrompt(matches)}`

    const messages: LLMMessage[] = history.map((m) => ({
      role: m.sender_type === MessageSenderType.STUDENT ? 'user' : 'assistant',
      content: m.content,
    }))

    const replyText = await llmClient.generateReply(messages, systemPrompt)

    await ConversationsRepo.createMessage(conversationId, MessageSenderType.AGENT, replyText)

    return replyText
  }
}
