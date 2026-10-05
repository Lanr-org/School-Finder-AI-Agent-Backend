import express, { type Router } from 'express'
import { StudentAuthenticateMiddleware } from '../../middleware/studentAuthenticate'
import { createRateLimit } from '../../middleware/rateLimit'
import { validate, validateParams } from '../../middleware/validate'
import InterviewController from './interview.controller'
import { sessionIdParamsSchema, startInterviewSchema, submitAnswerSchema } from './interview.schemas'

// Mock interviews for the signed-in student, mounted at /api/v1/student. Every route needs
// a student token and only ever touches that student's own sessions.
export const interviewRouter: Router = express.Router()

// Keyed by student: starting and answering each cost AI calls. The daily session cap lives
// in AiUsageService. Runs after StudentAuthenticateMiddleware, so req.student is always set.
const interviewRateLimit = createRateLimit(20, 1, (req) => `interview:${req.student?.studentId ?? 'none'}`)

interviewRouter.get('/interview-sessions', StudentAuthenticateMiddleware, InterviewController.List)
// Declared before /:sessionId so "active" isn't read as an id.
interviewRouter.get('/interview-sessions/active', StudentAuthenticateMiddleware, InterviewController.GetActive)
interviewRouter.post(
  '/interview-sessions',
  StudentAuthenticateMiddleware,
  interviewRateLimit,
  validate(startInterviewSchema),
  InterviewController.Start,
)
interviewRouter.get(
  '/interview-sessions/:sessionId',
  StudentAuthenticateMiddleware,
  validateParams(sessionIdParamsSchema),
  InterviewController.Get,
)
interviewRouter.post(
  '/interview-sessions/:sessionId/answers',
  StudentAuthenticateMiddleware,
  interviewRateLimit,
  validateParams(sessionIdParamsSchema),
  validate(submitAnswerSchema),
  InterviewController.SubmitAnswer,
)
interviewRouter.post(
  '/interview-sessions/:sessionId/abandon',
  StudentAuthenticateMiddleware,
  validateParams(sessionIdParamsSchema),
  InterviewController.Abandon,
)
