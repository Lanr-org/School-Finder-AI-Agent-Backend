import type { NextFunction, Request, Response } from 'express'
import { successResponse } from '../../http/response'
import InterviewService from './interview.service'

const studentIdOf = (req: Request): string => {
  if (!req.student) {
    throw new Error('Student request missing session claims')
  }
  return req.student.studentId
}

const send = (req: Request, res: Response, message: string, data?: unknown, status = 200) =>
  res.status(status).send(successResponse(true, message, data, { requestId: req.id }))

const InterviewController = {
  Start: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { type } = req.body as { type: 'VISA' | 'ADMISSION' }
      send(req, res, 'Interview started', await InterviewService.Start(studentIdOf(req), type, 'WEB'), 201)
    } catch (error) {
      next(error)
    }
  },

  GetActive: async (req: Request, res: Response, next: NextFunction) => {
    try {
      send(req, res, 'Active interview retrieved', await InterviewService.GetActive(studentIdOf(req)))
    } catch (error) {
      next(error)
    }
  },

  List: async (req: Request, res: Response, next: NextFunction) => {
    try {
      send(req, res, 'Interviews retrieved', await InterviewService.List(studentIdOf(req)))
    } catch (error) {
      next(error)
    }
  },

  Get: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const sessionId = req.params.sessionId as string
      send(req, res, 'Interview retrieved', await InterviewService.Get(studentIdOf(req), sessionId))
    } catch (error) {
      next(error)
    }
  },

  SubmitAnswer: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const sessionId = req.params.sessionId as string
      const { answer } = req.body as { answer: string }
      send(req, res, 'Answer recorded', await InterviewService.SubmitAnswer(studentIdOf(req), sessionId, answer))
    } catch (error) {
      next(error)
    }
  },

  Abandon: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const sessionId = req.params.sessionId as string
      send(req, res, 'Interview stopped', await InterviewService.Abandon(studentIdOf(req), sessionId))
    } catch (error) {
      next(error)
    }
  },
}

export default InterviewController
