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
