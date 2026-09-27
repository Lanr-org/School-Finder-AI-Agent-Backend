import type { NextFunction, Request, Response } from 'express'
import { successResponse } from '../../http/response'
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

  MarkStudyPlanShared: async (req: Request, res: Response, next: NextFunction) => {
    try {
      await StudentPortalService.MarkStudyPlanShared(studentIdOf(req))
      send(req, res, 'Study plan share recorded')
    } catch (error) {
      next(error)
    }
  },
}

export default StudentPortalController
