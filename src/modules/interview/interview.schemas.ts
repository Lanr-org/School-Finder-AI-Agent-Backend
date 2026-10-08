import { z } from 'zod'
import { InterviewType } from '../../generated/prisma/index.js'

export const startInterviewSchema = z.object({
  type: z.enum(InterviewType),
})

export const submitAnswerSchema = z.object({
  answer: z.string().trim().min(1).max(1500),
})

export const sessionIdParamsSchema = z.object({
  sessionId: z.string().uuid(),
})

// What we expect back from the model. Lenient on length, strict on shape; scores are clamped
// by the service rather than rejected, since a 11/10 is still a usable answer.
export const firstQuestionOutputSchema = z.object({
  question: z.string().trim().min(3).max(600),
})

const tipFields = {
  tip: z.string().trim().min(1).max(1000),
  score: z.number().transform((n) => Math.min(10, Math.max(0, Math.round(n)))),
  // Only for weaker answers; the model may send null or an empty string otherwise.
  sampleAnswer: z
    .string()
    .trim()
    .max(1200)
    .nullish()
    .transform((s) => (s ? s : null)),
}

export const nextTurnOutputSchema = z.object({
  ...tipFields,
  nextQuestion: z.string().trim().min(3).max(600),
})

export const finalTurnOutputSchema = z.object({
  ...tipFields,
  summary: z.string().trim().min(1).max(2000),
  overallScore: z.number().transform((n) => Math.min(100, Math.max(0, Math.round(n)))),
  strengths: z.array(z.string().trim().min(1).max(300)).max(5).default([]),
  improvements: z.array(z.string().trim().min(1).max(300)).max(5).default([]),
})
