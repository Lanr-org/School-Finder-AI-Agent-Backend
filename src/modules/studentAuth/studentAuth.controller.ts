import type { NextFunction, Request, Response } from 'express'
import { clearStudentCookie, setStudentCookie, STUDENT_REFRESH_COOKIE } from '../../http/cookie'
import { successResponse } from '../../http/response'
import StudentAuthService from './studentAuth.service'
import type { GoogleSignInInput } from './studentAuth.types'

const StudentAuthController = {
  GoogleSignIn: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { refreshToken, ...result } = await StudentAuthService.SignInWithGoogle(
        req.body as GoogleSignInInput,
      )
      setStudentCookie(res, refreshToken)
      res.status(200).send(successResponse(true, 'Signed in', result, { requestId: req.id }))
    } catch (error) {
      next(error)
    }
  },

  Refresh: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as Record<string, string | null | undefined>
      const { refreshToken, ...result } = await StudentAuthService.Refresh({
        refreshToken: body[STUDENT_REFRESH_COOKIE] ?? '',
        ipAddress: body.ipAddress ?? null,
        userAgent: body.userAgent ?? null,
      })
      setStudentCookie(res, refreshToken)
      res.status(200).send(successResponse(true, 'Session refreshed', result, { requestId: req.id }))
    } catch (error) {
      // A dead session also gets its cookie cleared, so the browser stops sending it.
      clearStudentCookie(res)
      next(error)
    }
  },

  Logout: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const cookies = req.cookies as Record<string, string | undefined> | undefined
      await StudentAuthService.Logout(cookies?.[STUDENT_REFRESH_COOKIE])
      clearStudentCookie(res)
      res.status(200).send(successResponse(true, 'Signed out', undefined, { requestId: req.id }))
    } catch (error) {
      next(error)
    }
  },
}

export default StudentAuthController
