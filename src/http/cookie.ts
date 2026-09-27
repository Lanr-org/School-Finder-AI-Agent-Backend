import type { Response } from 'express'
import env from '../config/env'

export const setCookie = (res: Response, cookie: string) => {
  res.cookie('refreshToken', cookie, {
    httpOnly: true,
    secure: env.nodeEnv === 'production',
    sameSite: 'strict',
    maxAge: 1000 * 60 * 60 * 24 * 30,
  })
}

export const clearCookie = (res: Response) => {
  res.clearCookie('refreshToken')
}

export const STUDENT_REFRESH_COOKIE = 'smetase_student_rt'
// Only sent to the student refresh/logout routes, never with other requests,
// and never collides with the staff `refreshToken` cookie.
const STUDENT_COOKIE_PATH = '/api/v1/student/auth'

export const setStudentCookie = (res: Response, token: string) => {
  res.cookie(STUDENT_REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: env.nodeEnv === 'production',
    sameSite: 'strict',
    path: STUDENT_COOKIE_PATH,
    maxAge: 1000 * 60 * 60 * 24 * 30,
  })
}

export const clearStudentCookie = (res: Response) => {
  res.clearCookie(STUDENT_REFRESH_COOKIE, { path: STUDENT_COOKIE_PATH })
}
