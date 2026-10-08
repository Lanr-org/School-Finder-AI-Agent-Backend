import type { NextFunction, Request, Response } from 'express'
import { successResponse } from '../../http/response'
import StudentLinkService from './studentLink.service'

const StudentLinkController = {
  CreateTelegramLink: async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.student) throw new Error('Student request missing session claims')
      const link = await StudentLinkService.CreateTelegramLink(req.student.studentId)
      res.status(201).send(successResponse(true, 'Telegram link created', link, { requestId: req.id }))
    } catch (error) {
      next(error)
    }
  },
}

export default StudentLinkController
