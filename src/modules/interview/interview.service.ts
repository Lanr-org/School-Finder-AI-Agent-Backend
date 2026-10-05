import type { ZodType } from 'zod'
import { createError } from '../../common/errors/AppError.js'
import { logger } from '../../config/logger.js'
import { captureError } from '../../config/sentry.js'
import { llmClient } from '../../integrations/llm/index.js'
import type { LLMMessage } from '../../integrations/llm/index.js'
import type { InterviewType, MessageChannel } from '../../generated/prisma/index.js'
import { AiUsageService } from '../ai/aiUsage.service.js'
import StudentPortalRepo from '../studentPortal/studentPortal.repository.js'
import InterviewRepo, { isUniqueViolation } from './interview.repository.js'
import { parseModelJson } from './interview.parse.js'
import {
  FINAL_TURN_INSTRUCTION,
  FIRST_QUESTION_INSTRUCTION,
  NEXT_TURN_INSTRUCTION,
  SAMPLE_ANSWER_MAX_SCORE,
  buildInterviewSystemPrompt,
} from './interview.prompts.js'
import {
  finalTurnOutputSchema,
  firstQuestionOutputSchema,
  nextTurnOutputSchema,
} from './interview.schemas.js'
import {
  INTERVIEW_QUESTION_COUNT,
  type InterviewSessionView,
  type InterviewTurn,
} from './interview.types.js'

type SessionWithAnswers = NonNullable<Awaited<ReturnType<typeof InterviewRepo.findOwned>>>

const toView = (session: SessionWithAnswers): InterviewSessionView => ({
  id: session.id,
  type: session.type,
  status: session.status,
  channel: session.channel,
  targetCountry: session.target_country,
  programLabel: session.program_label,
  questionCount: session.question_count,
  createdAt: session.created_at,
  completedAt: session.completed_at,
  result:
    session.status === 'COMPLETED' && session.summary !== null
      ? {
          overallScore: Number(session.overall_score ?? 0),
          summary: session.summary,
          strengths: (session.strengths as string[] | null) ?? [],
          improvements: (session.improvements as string[] | null) ?? [],
        }
      : null,
  answers: session.answers.map((a) => ({
    index: a.idx,
    question: a.question,
    answer: a.answer,
    tip: a.tip,
    sampleAnswer: a.sample_answer,
    score: a.score,
  })),
})

// A sample answer is only for weaker answers, whatever the model sent.
const sampleFor = (out: { score: number; sampleAnswer: string | null }) =>
  out.score <= SAMPLE_ANSWER_MAX_SCORE ? out.sampleAnswer : null

const TRY_AGAIN = 'The interviewer had trouble responding. Please try again.'

// One model call: counts against the global daily cap, then parses the JSON reply.
// Throws a friendly error (and the caller saves nothing) if the cap is hit or the reply is unusable.
const askModel = async <T>(
  systemPrompt: string,
  messages: LLMMessage[],
  schema: ZodType<T>,
): Promise<T> => {
  const usage = await AiUsageService.TryConsumeGlobal()
  if (!usage.allowed) {
    throw createError(
      'Interview practice is busy right now. Please try again tomorrow.',
      429,
      {},
      'RATE_LIMITED',
    )
  }
  let raw: string
  try {
    raw = await llmClient.generateReply(messages, systemPrompt)
  } catch (error) {
    logger.warn({ err: error }, 'Interview LLM call failed.')
    // The root cause goes to Sentry here; the wrapper below is marked so the error
    // handler doesn't report it again.
    captureError(error, { tags: { area: 'interview' } })
    throw Object.assign(createError(TRY_AGAIN, 500, {}, 'INTERNAL_ERROR'), { reported: true })
  }
  const parsed = parseModelJson(raw, schema)
  if (!parsed) {
    logger.warn('Interview LLM reply was not valid JSON for the expected shape.')
    captureError(new Error('Interview LLM reply was not valid JSON'), { tags: { area: 'interview' } })
    throw Object.assign(createError(TRY_AGAIN, 500, {}, 'INTERNAL_ERROR'), { reported: true })
  }
  return parsed
}

export const InterviewService = {
  Start: async (
    studentId: string,
    type: InterviewType,
    channel: MessageChannel,
  ): Promise<InterviewTurn> => {
    const existing = await InterviewRepo.findActive(studentId)
    if (existing) {
      throw createError(
        'You already have an interview in progress.',
        409,
        { sessionId: existing.id },
        'CONFLICT',
      )
    }

    const student = await StudentPortalRepo.findStudent(studentId)
    if (!student) throw createError('Student not found', 404, {}, 'NOT_FOUND')

    const program = student.chosen_program_id
      ? await StudentPortalRepo.findProgramById(student.chosen_program_id)
      : null
    const country = program?.school.country ?? student.target_destinations[0] ?? null
    const programLabel = program ? `${program.name} at ${program.school.name}` : null

    const limit = await AiUsageService.TryConsumeInterviewSession(studentId)
    if (!limit.allowed) {
      throw createError(
        "You've reached today's limit for practice interviews. Try again tomorrow.",
        429,
        {},
        'RATE_LIMITED',
      )
    }

    const systemPrompt = buildInterviewSystemPrompt(type, {
      country,
      program: programLabel,
      studyLevel: student.study_level,
    })
    const { question } = await askModel(
      systemPrompt,
      [{ role: 'user', content: FIRST_QUESTION_INSTRUCTION }],
      firstQuestionOutputSchema,
    )

    try {
      const session = await InterviewRepo.create({
        studentId,
        type,
        channel,
        targetCountry: country,
        programLabel,
        questionCount: INTERVIEW_QUESTION_COUNT,
        firstQuestion: question,
      })
      return {
        sessionId: session.id,
        feedback: null,
        nextQuestion: { index: 0, text: question },
        result: null,
      }
    } catch (error) {
      // Lost a race with another start (partial unique index).
      if (isUniqueViolation(error)) {
        throw createError('You already have an interview in progress.', 409, {}, 'CONFLICT')
      }
      throw error
    }
  },

  SubmitAnswer: async (
    studentId: string,
    sessionId: string,
    answerText: string,
  ): Promise<InterviewTurn> => {
    const session = await InterviewRepo.findOwned(sessionId, studentId)
    if (!session) throw createError('Interview not found', 404, {}, 'NOT_FOUND')
    if (session.status !== 'IN_PROGRESS') {
      throw createError('This interview is already finished.', 409, {}, 'CONFLICT')
    }
    const current = session.answers.find((a) => a.answer === null)
    if (!current) throw createError('This interview has no open question.', 409, {}, 'CONFLICT')

    const student = await StudentPortalRepo.findStudent(studentId)
    const systemPrompt = buildInterviewSystemPrompt(session.type, {
      country: session.target_country,
      program: session.program_label,
      studyLevel: student?.study_level ?? null,
    })

    // Replay the exchange so far, then this answer and an instruction for the reply shape.
    const messages: LLMMessage[] = [{ role: 'user', content: FIRST_QUESTION_INSTRUCTION }]
    for (const a of session.answers) {
      messages.push({ role: 'assistant', content: JSON.stringify({ question: a.question }) })
      if (a.answer !== null) messages.push({ role: 'user', content: `Answer: ${JSON.stringify(a.answer)}` })
    }
    const isFinal = current.idx >= session.question_count - 1
    const answeredCount = current.idx + 1
    messages.push({
      role: 'user',
      content: `Answer: ${JSON.stringify(answerText)}\n\n${isFinal ? FINAL_TURN_INSTRUCTION : NEXT_TURN_INSTRUCTION(answeredCount)}`,
    })

    if (isFinal) {
      const out = await askModel(systemPrompt, messages, finalTurnOutputSchema)
      const result = {
        overallScore: out.overallScore,
        summary: out.summary,
        strengths: out.strengths,
        improvements: out.improvements,
      }
      const saved = await InterviewRepo.recordAnswer({
        sessionId,
        answerId: current.id,
        idx: current.idx,
        answer: answerText,
        tip: out.tip,
        sampleAnswer: sampleFor(out),
        score: out.score,
        result,
      })
      if (!saved) throw createError('That question was already answered.', 409, {}, 'CONFLICT')
      return {
        sessionId,
        feedback: { tip: out.tip, score: out.score, sampleAnswer: sampleFor(out) },
        nextQuestion: null,
        result,
      }
    }

    const out = await askModel(systemPrompt, messages, nextTurnOutputSchema)
    const saved = await InterviewRepo.recordAnswer({
      sessionId,
      answerId: current.id,
      idx: current.idx,
      answer: answerText,
      tip: out.tip,
      sampleAnswer: sampleFor(out),
      score: out.score,
      nextQuestion: out.nextQuestion,
    })
    if (!saved) throw createError('That question was already answered.', 409, {}, 'CONFLICT')
    return {
      sessionId,
      feedback: { tip: out.tip, score: out.score, sampleAnswer: sampleFor(out) },
      nextQuestion: { index: current.idx + 1, text: out.nextQuestion },
      result: null,
    }
  },

  Abandon: async (studentId: string, sessionId: string) => {
    const { count } = await InterviewRepo.abandon(sessionId, studentId)
    if (count === 0) throw createError('No interview in progress to stop.', 404, {}, 'NOT_FOUND')
    return { sessionId, status: 'ABANDONED' as const }
  },

  // Telegram uses this to decide whether free text is an interview answer.
  GetActive: async (studentId: string): Promise<InterviewSessionView | null> => {
    const session = await InterviewRepo.findActive(studentId)
    return session ? toView(session) : null
  },

  Get: async (studentId: string, sessionId: string): Promise<InterviewSessionView> => {
    const session = await InterviewRepo.findOwned(sessionId, studentId)
    if (!session) throw createError('Interview not found', 404, {}, 'NOT_FOUND')
    return toView(session)
  },

  List: async (studentId: string): Promise<InterviewSessionView[]> =>
    (await InterviewRepo.list(studentId)).map(toView),
}

export default InterviewService
