import type { NextFunction, Request, Response } from 'express'
import { successResponse } from '../../http/response'
import type { JourneyCheckKey } from '../../generated/prisma/index.js'
import StudyPlanLinkService from '../studyPlanLinks/studyPlanLinks.service'
import StudentPortalService from './studentPortal.service'
import type { UpdateProfileDTO } from './studentPortal.types'

const studentIdOf = (req: Request): string => {
  if (!req.student) {
    throw new Error('Student request missing session claims')
  }
  return req.student.studentId
}

const send = (req: Request, res: Response, message: string, data?: unknown) =>
  res.status(200).send(successResponse(true, message, data, { requestId: req.id }))

const StudentPortalController = {
  GetMe: async (req: Request, res: Response, next: NextFunction) => {
    try {
      send(req, res, 'Student retrieved', await StudentPortalService.GetMe(studentIdOf(req)))
    } catch (error) {
      next(error)
    }
  },

  UpdateProfile: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const me = await StudentPortalService.UpdateProfile(studentIdOf(req), req.body as UpdateProfileDTO)
      send(req, res, 'Profile updated', me)
    } catch (error) {
      next(error)
    }
  },

  GetJourney: async (req: Request, res: Response, next: NextFunction) => {
    try {
      send(req, res, 'Journey retrieved', await StudentPortalService.GetJourney(studentIdOf(req)))
    } catch (error) {
      next(error)
    }
  },

  GetMatches: async (req: Request, res: Response, next: NextFunction) => {
    try {
      send(req, res, 'Matches retrieved', await StudentPortalService.GetMatches(studentIdOf(req)))
    } catch (error) {
      next(error)
    }
  },

  AddToShortlist: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const programId = req.params.programId as string
      send(req, res, 'Added to shortlist', await StudentPortalService.AddToShortlist(studentIdOf(req), programId))
    } catch (error) {
      next(error)
    }
  },

  RemoveFromShortlist: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const programId = req.params.programId as string
      send(
        req,
        res,
        'Removed from shortlist',
        await StudentPortalService.RemoveFromShortlist(studentIdOf(req), programId),
      )
    } catch (error) {
      next(error)
    }
  },

  Choose: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { programId } = req.body as { programId: string }
      send(req, res, 'Programme chosen', await StudentPortalService.Choose(studentIdOf(req), programId))
    } catch (error) {
      next(error)
    }
  },

  GetStudyPlan: async (req: Request, res: Response, next: NextFunction) => {
    try {
      // `data: null` (no programme chosen yet) is sent explicitly so the client can tell it apart.
      const plan = await StudentPortalService.GetStudyPlan(studentIdOf(req))
      res.status(200).send({ ...successResponse(true, 'Study plan retrieved', undefined, { requestId: req.id }), data: plan })
    } catch (error) {
      next(error)
    }
  },

  CreateStudyPlanLink: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const link = await StudyPlanLinkService.Create(studentIdOf(req))
      res.status(201).send(successResponse(true, 'Study plan link created', link, { requestId: req.id }))
    } catch (error) {
      next(error)
    }
  },

  RevokeStudyPlanLinks: async (req: Request, res: Response, next: NextFunction) => {
    try {
      await StudyPlanLinkService.RevokeAll(studentIdOf(req))
      send(req, res, 'Study plan links revoked')
    } catch (error) {
      next(error)
    }
  },

  SetJourneyCheck: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const key = req.params.key as JourneyCheckKey
      const done = req.method === 'PUT'
      send(req, res, 'Journey updated', await StudentPortalService.SetJourneyCheck(studentIdOf(req), key, done))
    } catch (error) {
      next(error)
    }
  },

  GetMessages: async (req: Request, res: Response, next: NextFunction) => {
    try {
      send(req, res, 'Messages retrieved', await StudentPortalService.GetMessages(studentIdOf(req)))
    } catch (error) {
      next(error)
    }
  },

  SendMessage: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { content } = req.body as { content: string }
      const result = await StudentPortalService.SendMessage(studentIdOf(req), content)
      res.status(201).send(successResponse(true, 'Message sent', result, { requestId: req.id }))
    } catch (error) {
      next(error)
    }
  },
}

export default StudentPortalController
