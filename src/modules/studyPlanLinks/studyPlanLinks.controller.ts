import type { NextFunction, Request, Response } from 'express'
import { successResponse } from '../../http/response'
import StudyPlanLinkService from './studyPlanLinks.service'

const StudyPlanLinkController = {
  GetPublic: async (req: Request, res: Response, next: NextFunction) => {
    // Never cached by browsers or proxies, never indexed: the plan names a real student.
    res.set('Cache-Control', 'no-store')
    res.set('X-Robots-Tag', 'noindex, nofollow')
    try {
      const plan = await StudyPlanLinkService.GetPublic(
        req.params.token as string,
      )
      res
        .status(200)
        .send(
          successResponse(true, 'Study plan retrieved', plan, {
            requestId: req.id,
          }),
        )
    } catch (error) {
      next(error)
    }
  },
}

export default StudyPlanLinkController
