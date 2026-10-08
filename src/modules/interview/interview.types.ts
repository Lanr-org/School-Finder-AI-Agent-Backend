import type { InterviewStatus, InterviewType } from '../../generated/prisma/index.js'

export const INTERVIEW_QUESTION_COUNT = 5

export type InterviewSummary = {
  overallScore: number // 0-100
  summary: string
  strengths: string[]
  improvements: string[]
}

export type InterviewAnswerView = {
  index: number
  question: string
  answer: string | null
  tip: string | null
  sampleAnswer: string | null // only for weaker answers
  score: number | null // 0-10
}

export type InterviewSessionView = {
  id: string
  type: InterviewType
  status: InterviewStatus
  channel: string
  targetCountry: string | null
  programLabel: string | null
  questionCount: number
  createdAt: Date
  completedAt: Date | null
  result: InterviewSummary | null
  answers: InterviewAnswerView[]
}

// What the student sees after starting or answering.
export type InterviewTurn = {
  sessionId: string
  // Feedback on the answer just given (absent right after starting).
  feedback: { tip: string; score: number; sampleAnswer: string | null } | null
  // The next question to answer, or null once the interview is finished.
  nextQuestion: { index: number; text: string } | null
  // Set on the final turn.
  result: InterviewSummary | null
}
