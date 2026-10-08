import prisma from '../../database/prisma'
import {
  InterviewStatus,
  Prisma,
  type InterviewType,
  type MessageChannel,
} from '../../generated/prisma/index.js'
import type { InterviewSummary } from './interview.types.js'

const withAnswers = { answers: { orderBy: { idx: 'asc' } } } as const

const InterviewRepo = {
  findActive: (studentId: string) =>
    prisma.interviewSession.findFirst({
      where: { student_id: studentId, status: InterviewStatus.IN_PROGRESS },
      include: withAnswers,
    }),

  // Scoped to the student, so another student's id is just "not found".
  findOwned: (sessionId: string, studentId: string) =>
    prisma.interviewSession.findFirst({
      where: { id: sessionId, student_id: studentId },
      include: withAnswers,
    }),

  list: (studentId: string, take = 20) =>
    prisma.interviewSession.findMany({
      where: { student_id: studentId },
      orderBy: { created_at: 'desc' },
      take,
      include: withAnswers,
    }),

  // The partial unique index (one IN_PROGRESS per student) throws P2002 on a race; the
  // service turns that into a CONFLICT.
  create: (data: {
    studentId: string
    type: InterviewType
    channel: MessageChannel
    targetCountry: string | null
    programLabel: string | null
    questionCount: number
    firstQuestion: string
  }) =>
    prisma.interviewSession.create({
      data: {
        student_id: data.studentId,
        type: data.type,
        channel: data.channel,
        target_country: data.targetCountry,
        program_label: data.programLabel,
        question_count: data.questionCount,
        answers: { create: { idx: 0, question: data.firstQuestion } },
      },
      include: withAnswers,
    }),

  // Saves the answer + tip + score and either opens the next question or completes the
  // session, atomically. Returns false if the question was already answered (double submit).
  recordAnswer: (input: {
    sessionId: string
    answerId: string
    idx: number
    answer: string
    tip: string
    sampleAnswer: string | null
    score: number
    nextQuestion?: string
    result?: InterviewSummary
  }) =>
    prisma.$transaction(async (tx) => {
      const updated = await tx.interviewAnswer.updateMany({
        where: { id: input.answerId, answer: null },
        data: {
          answer: input.answer,
          tip: input.tip,
          sample_answer: input.sampleAnswer,
          score: input.score,
          answered_at: new Date(),
        },
      })
      if (updated.count === 0) return false

      if (input.nextQuestion) {
        await tx.interviewAnswer.create({
          data: { session_id: input.sessionId, idx: input.idx + 1, question: input.nextQuestion },
        })
      }
      if (input.result) {
        await tx.interviewSession.update({
          where: { id: input.sessionId },
          data: {
            status: InterviewStatus.COMPLETED,
            completed_at: new Date(),
            overall_score: input.result.overallScore,
            summary: input.result.summary,
            strengths: input.result.strengths,
            improvements: input.result.improvements,
          },
        })
      }
      return true
    }),

  // Only an in-progress session can be abandoned.
  abandon: (sessionId: string, studentId: string) =>
    prisma.interviewSession.updateMany({
      where: { id: sessionId, student_id: studentId, status: InterviewStatus.IN_PROGRESS },
      data: { status: InterviewStatus.ABANDONED, completed_at: new Date() },
    }),
}

export const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'

export default InterviewRepo
