import type { NextFunction, Request, Response } from 'express'
import { createError } from '../common/errors/AppError'
import { StudentTermsService } from '../modules/studentPortal/studentTerms'

// Runs after StudentAuthenticateMiddleware on every route that uses the student's data (chat,
// matches, plans, interviews). Until they click "I agree", only /me, the profile and the accept
// route work.
export const requireTermsAccepted = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    if (!req.student) {
      return next(createError('Not authorized', 401, {}, 'UNAUTHENTICATED'))
    }
    if (!(await StudentTermsService.IsAccepted(req.student.studentId))) {
      return next(
        createError('Please accept the terms first', 403, { _form: ['Please accept the terms first'] }, 'FORBIDDEN'),
      )
    }
    next()
  } catch (error) {
    next(error)
  }
}
