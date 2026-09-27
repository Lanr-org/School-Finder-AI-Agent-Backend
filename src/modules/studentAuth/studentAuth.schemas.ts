import { z } from 'zod'
import { STUDENT_REFRESH_COOKIE } from '../../http/cookie'

export const googleSignInSchema = z.object({
  credential: z.string().trim().min(1, 'Google credential is required').max(4096),
})

// Read from the cookie by validateRefreshToken, which merges it into req.body.
export const studentRefreshCookieSchema = z.object({
  [STUDENT_REFRESH_COOKIE]: z.string().trim().length(128),
})
